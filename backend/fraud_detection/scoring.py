"""
Fraud-detection scoring helpers (#1514).

This module provides the numeric scoring utilities used by the fraud-detection
pipeline.  All rounding and normalisation are delegated to
``backend/shared/shared_math_utils.py`` so that there is exactly ONE
implementation of each math helper across the entire backend.

Before #1514 the rounding and normalisation logic was duplicated between this
module (previously inlined inside pipeline.py) and shared_math_utils.py.
The duplication has been eliminated: this module re-exports the shared
helpers and adds fraud-specific wrappers on top of them.

The heuristic scan functions (scan_wash_contributions, scan_contribution_spikes,
scan_duplicate_content, run_full_scan) live here rather than in pipeline.py so
that they can be tested without spinning up a FastAPI app.  pipeline.py imports
them from here and remains a thin orchestrator.

Public API
----------
round_score(value, ndigits)
    Thin re-export of ``shared_math_utils.round_score``.

normalize(value, minimum, maximum)
    Thin re-export of ``shared_math_utils.normalize``.

jaccard_similarity(a, b)
    Token-level Jaccard similarity between two strings.
    Returns a float in [0.0, 1.0] rounded to 4 d.p.

severity_score(flag_count, max_flags)
    Normalise a raw flag count into a [0.0, 1.0] severity score.
    Delegates entirely to ``normalize``.

scan_wash_contributions()
    Wash-contribution heuristic scan.

scan_contribution_spikes()
    Sudden-spike heuristic scan.

scan_duplicate_content(force=False)
    Duplicate-content heuristic scan (rate-limited; bypass with force=True).

run_full_scan(force_duplicate_scan=False)
    Execute all three heuristics and enqueue new flags.
"""

from __future__ import annotations

import time
from typing import Optional

# ``shared_math_utils`` is importable via the package layout / PYTHONPATH
# configured by the service and test runners.  This module deliberately
# performs no ``sys.path`` mutation and has no logging side effects: it is a
# pure scoring module.
from shared_math_utils import normalize, round_score

# Repository layer — data access only; no FastAPI / asyncio deps.
from repository import (
    CampaignRecord,
    ContributionEvent,
    Flag,
    FlagReason,
    FlagSeverity,
    RefundEvent,
    enqueue_flag,
    get_campaign_records,
    get_contributions,
    get_refunds,
    next_flag_id,
)

__all__ = [
    "round_score",
    "normalize",
    "jaccard_similarity",
    "severity_score",
    # Heuristic scan functions
    "scan_wash_contributions",
    "scan_contribution_spikes",
    "scan_duplicate_content",
    "run_full_scan",
    # Constants
    "WASH_WINDOW_SECONDS",
    "WASH_MIN_OCCURRENCES",
    "SPIKE_WINDOW_SECONDS",
    "SPIKE_MAX_CONTRIBUTIONS",
    "DUPLICATE_JACCARD_THRESHOLD",
    "DUPLICATE_SCAN_MIN_INTERVAL_SECONDS",
]

# ---------------------------------------------------------------------------
# Tuneable thresholds (see docs/fraud-detection-heuristics.md for rationale)
# ---------------------------------------------------------------------------

WASH_WINDOW_SECONDS: int = 3600          # contributions that refund within 1 h
WASH_MIN_OCCURRENCES: int = 3            # flag after 3 wash cycles
SPIKE_WINDOW_SECONDS: int = 600          # 10-minute rolling window
SPIKE_MAX_CONTRIBUTIONS: int = 50        # > 50 contributions in 10 min → spike
DUPLICATE_JACCARD_THRESHOLD: float = 0.8 # titles ≥ 80 % token overlap → duplicate
DUPLICATE_SCAN_MIN_INTERVAL_SECONDS: int = 30  # rate-limit the O(N²) duplicate scan

# ---------------------------------------------------------------------------
# Rate-limit state for the duplicate-content scan
# ---------------------------------------------------------------------------

#: Unix timestamp of the last duplicate-content scan.  Reset by conftest.py
#: between tests.  Set to 0.0 to force a scan on the next run_full_scan() call.
_last_duplicate_scan_at: float = 0.0


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------


def jaccard_similarity(a: str, b: str) -> float:
    """
    Compute token-level Jaccard similarity between strings *a* and *b*.

    Tokenises each string by lowercasing and splitting on whitespace, then
    returns ``|intersection| / |union|``.  The result is rounded to 4
    decimal places via :func:`round_score`.

    Edge cases
    ----------
    * Both strings empty → returns 1.0 (identical empty sets).
    * One string empty  → returns 0.0 (no overlap).
    * Non-string input  → raises :class:`TypeError`.

    Parameters
    ----------
    a, b:
        Input strings to compare.

    Returns
    -------
    float
        Similarity in [0.0, 1.0].

    Examples
    --------
    >>> jaccard_similarity("fund the commons", "fund the commons")
    1.0
    >>> jaccard_similarity("hello world", "world hello")
    1.0
    >>> jaccard_similarity("", "")
    1.0
    >>> jaccard_similarity("abc", "")
    0.0
    """
    if not isinstance(a, str) or not isinstance(b, str):
        raise TypeError(
            f"jaccard_similarity expects two str arguments, "
            f"got {type(a).__name__!r} and {type(b).__name__!r}"
        )

    sa = set(a.lower().split())
    sb = set(b.lower().split())

    if not sa and not sb:
        return 1.0

    union = sa | sb
    if not union:
        return 0.0

    raw = len(sa & sb) / len(union)
    return round_score(raw, 4)


#: Internal alias used by test_scoring_comprehensive.py.
_jaccard = jaccard_similarity


def severity_score(flag_count: int, max_flags: int) -> float:
    """
    Normalise *flag_count* into a [0.0, 1.0] severity score.

    Uses :func:`normalize` from ``shared_math_utils`` so that the
    normalisation logic is not duplicated here.

    Parameters
    ----------
    flag_count:
        The number of flags raised for a given entity.
    max_flags:
        The upper bound used for normalisation (e.g. the highest observed
        flag count across all entities in the current scan, or a configured
        ceiling).

    Returns
    -------
    float
        Severity in [0.0, 1.0], rounded to 4 d.p.

    Examples
    --------
    >>> severity_score(5, 10)
    0.5
    >>> severity_score(0, 10)
    0.0
    >>> severity_score(10, 10)
    1.0
    >>> severity_score(0, 0)  # degenerate: no flags possible
    0.0
    """
    raw = normalize(float(flag_count), 0.0, float(max_flags))
    return round_score(raw, 4)


# ---------------------------------------------------------------------------
# Heuristic scan functions
# ---------------------------------------------------------------------------


def scan_wash_contributions() -> list[Flag]:
    """
    Wash-contribution heuristic.

    A "wash cycle" is a (campaign, wallet) pair where a contribution is
    followed by a refund within WASH_WINDOW_SECONDS.  When the same pair
    accumulates WASH_MIN_OCCURRENCES or more cycles, it is flagged.
    """
    contributions = get_contributions()
    refunds = get_refunds()

    # Build a lookup of refund timestamps keyed by (campaign_id, wallet).
    refund_times: dict[tuple[str, str], list[float]] = {}
    for r in refunds:
        key = (r.campaign_id, r.wallet)
        refund_times.setdefault(key, []).append(r.timestamp)

    # Count wash cycles per (campaign_id, wallet) pair.
    wash_count: dict[tuple[str, str], int] = {}
    for c in contributions:
        key = (c.campaign_id, c.wallet)
        for rt in refund_times.get(key, []):
            # A refund is a "wash" if it occurs strictly after the contribution
            # and within the wash window.
            if 0 < rt - c.timestamp <= WASH_WINDOW_SECONDS:
                wash_count[key] = wash_count.get(key, 0) + 1
                break  # one contribution can only count once per wash cycle

    flags: list[Flag] = []
    for (campaign_id, wallet), count in wash_count.items():
        if count >= WASH_MIN_OCCURRENCES:
            flags.append(Flag(
                id=next_flag_id(),
                reason=FlagReason.WASH_CONTRIBUTION,
                severity=FlagSeverity.HIGH,
                campaign_id=campaign_id,
                wallet=wallet,
                detail=f"Wallet performed {count} wash cycles within {WASH_WINDOW_SECONDS}s",
            ))
    return flags


def scan_contribution_spikes() -> list[Flag]:
    """
    Sudden-spike heuristic.

    If a campaign receives more than SPIKE_MAX_CONTRIBUTIONS in any
    SPIKE_WINDOW_SECONDS rolling window, flag it as a potential sybil attack.
    """
    contributions = get_contributions()

    flags: list[Flag] = []
    by_campaign: dict[str, list[float]] = {}
    for c in contributions:
        by_campaign.setdefault(c.campaign_id, []).append(c.timestamp)

    for campaign_id, timestamps in by_campaign.items():
        ts = sorted(timestamps)
        for i, t_start in enumerate(ts):
            window = [t for t in ts[i:] if t - t_start <= SPIKE_WINDOW_SECONDS]
            if len(window) > SPIKE_MAX_CONTRIBUTIONS:
                flags.append(Flag(
                    id=next_flag_id(),
                    reason=FlagReason.CONTRIBUTION_SPIKE,
                    severity=FlagSeverity.MEDIUM,
                    campaign_id=campaign_id,
                    wallet=None,
                    detail=(
                        f"{len(window)} contributions in "
                        f"{SPIKE_WINDOW_SECONDS}s window "
                        f"(threshold: {SPIKE_MAX_CONTRIBUTIONS})"
                    ),
                ))
                break  # one flag per campaign per scan
    return flags


def scan_duplicate_content(force: bool = False) -> list[Flag]:
    """
    Duplicate-content heuristic.

    Compares every pair of campaigns by title Jaccard similarity.
    Pairs above DUPLICATE_JACCARD_THRESHOLD are flagged.

    This scan is O(N²) in the number of campaigns and is rate-limited by
    ``_last_duplicate_scan_at`` / ``DUPLICATE_SCAN_MIN_INTERVAL_SECONDS``.
    Pass ``force=True`` (e.g. from an explicit POST /scan) to bypass the gate.
    """
    global _last_duplicate_scan_at

    now = time.time()
    if not force and (now - _last_duplicate_scan_at) < DUPLICATE_SCAN_MIN_INTERVAL_SECONDS:
        return []

    _last_duplicate_scan_at = now

    records = get_campaign_records()
    flags: list[Flag] = []
    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            a, b = records[i], records[j]
            sim = jaccard_similarity(a.title, b.title)
            if sim >= DUPLICATE_JACCARD_THRESHOLD:
                flags.append(Flag(
                    id=next_flag_id(),
                    reason=FlagReason.DUPLICATE_CONTENT,
                    severity=FlagSeverity.LOW,
                    campaign_id=b.id,
                    wallet=None,
                    detail=(
                        f"Title Jaccard similarity {sim:.2f} with campaign {a.id} "
                        f"(threshold: {DUPLICATE_JACCARD_THRESHOLD})"
                    ),
                ))
    return flags


def run_full_scan(force_duplicate_scan: bool = False) -> list[Flag]:
    """Execute all heuristics and append new flags to the moderation queue."""
    new_flags: list[Flag] = []
    new_flags.extend(scan_wash_contributions())
    new_flags.extend(scan_contribution_spikes())
    new_flags.extend(scan_duplicate_content(force=force_duplicate_scan))
    for f in new_flags:
        enqueue_flag(f)
    return new_flags
