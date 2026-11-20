"""Fraud Detection Pipeline — thin orchestrator (#636, #1122, #1379)

Wires stage modules into a FastAPI app.  All logic lives in:
  repository.py, scoring.py, stages/idempotency.py, stages/trace_id.py,
  stages/scoring_worker.py, stages/routes.py

See ADR-008: docs/adr/ADR-008-fraud-detection-scoring-pipeline-design.md
"""
from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

# ``backend/shared`` is not an installable package; add it to the path so
# shared modules can be imported without duplicating them here.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shared"))
from structured_logger import configure_structlog  # noqa: E402
from db_config import load_db_pool_config  # noqa: E402

# ---------------------------------------------------------------------------
# Logging — structlog configured for JSON output in production,
# coloured console output in development.  Must run before the app (and any
# request-scoped loggers) is constructed so trace IDs are bound (#1683).
# ---------------------------------------------------------------------------

configure_structlog()
log: structlog.BoundLogger = structlog.get_logger("fraud_detection")

# ---------------------------------------------------------------------------
# Domain types and repository — single source of truth in repository.py
# ---------------------------------------------------------------------------

from repository import (  # noqa: F401
    CampaignRecord, ContributionEvent, Flag, FlagReason, FlagSeverity, RefundEvent,
    append_contribution, append_campaign, append_refund, enqueue_flag, next_flag_id,
    get_contributions, get_refunds, get_campaign_records, get_flags, total_flag_count,
    mark_flag_reviewed,
    # Internal stores re-exported for test access (test_pipeline.py).
    _CONTRIBUTIONS, _REFUNDS, _CAMPAIGN_RECORDS, _QUEUE,
)

# ---------------------------------------------------------------------------
# Scoring — single source of truth in scoring.py
# ---------------------------------------------------------------------------

from scoring import (  # noqa: F401
    WASH_WINDOW_SECONDS, WASH_MIN_OCCURRENCES, SPIKE_WINDOW_SECONDS,
    SPIKE_MAX_CONTRIBUTIONS, DUPLICATE_JACCARD_THRESHOLD, DUPLICATE_SCAN_MIN_INTERVAL_SECONDS,
    scan_wash_contributions, scan_contribution_spikes, scan_duplicate_content, run_full_scan,
)
import scoring as _scoring  # noqa: F401

# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

from stages.trace_id import TraceIDMiddleware  # noqa: F401
from stages.idempotency import IdempotencyStore, IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY_MAX_LEN  # noqa: F401
from stages.scoring_worker import (  # noqa: F401
    ContributionPayload, ScoringJob,
    scoring_queue as _scoring_queue,
    scoring_worker as _scoring_worker,
)
from config import load_fraud_detection_config  # noqa: F401

# Route handlers — all HTTP logic lives in stages/routes.py.
from stages.routes import (  # noqa: F401
    healthz as _healthz,
    readyz as _readyz,
    ingest_contribution,
    trigger_scan,
    get_metrics_handler,
    moderation_queue_handler,
    mark_reviewed_handler,
)

# ---------------------------------------------------------------------------
# Startup: resolve and log the DB pool configuration
# ---------------------------------------------------------------------------

DB_POOL_CONFIG = load_db_pool_config()
log.info("db_pool_config_resolved", **DB_POOL_CONFIG.__dict__)

# ---------------------------------------------------------------------------
# Application lifespan: start/stop the scoring worker
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app_: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(_scoring_worker())
    log.info("scoring_worker_task_created")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        log.info("scoring_worker_task_stopped")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(title="Fund-My-Cause Fraud Detection", version="1.2.0", lifespan=lifespan)
app.add_middleware(TraceIDMiddleware)

app.get("/healthz")(_healthz)
app.get("/readyz")(_readyz)
app.post("/contributions")(ingest_contribution)
app.post("/scan")(trigger_scan)
app.get("/metrics")(get_metrics_handler)
app.get("/moderation-queue")(moderation_queue_handler)
app.patch("/moderation-queue/{flag_id}/reviewed")(mark_reviewed_handler)
