import type { NextFunction, Request, Response } from "express";

/**
 * Baseline security headers for every response (#1694). Mounted before the
 * GraphQL route so errors and 404s carry the same headers as successes.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
