/**
 * Builds the long-lived services the GraphQL server depends on (#1689).
 *
 * Dependencies are passed in explicitly, so tests can build the same graph
 * with fakes and `index.ts` stays the only place that reads the environment.
 */

import type { ContractService } from "./services/contract.js";
import { createDataLoaders } from "./services/dataloader.js";
import { AuthService } from "./services/auth.js";
import { RateLimiterService } from "./services/rate-limiter.js";
import { QueryCostAnalyzer } from "./services/query-cost-analyzer.js";

export interface ContainerDeps {
  contractService: ContractService;
  redis: ConstructorParameters<typeof RateLimiterService>[0];
  jwtSecret: ConstructorParameters<typeof AuthService>[0];
  queryCost: ConstructorParameters<typeof QueryCostAnalyzer>[0];
}

export interface Services {
  dataLoaders: ReturnType<typeof createDataLoaders>;
  authService: AuthService;
  rateLimiter: RateLimiterService;
  queryCostAnalyzer: QueryCostAnalyzer;
}

export function createServices(deps: ContainerDeps): Services {
  return {
    dataLoaders: createDataLoaders(deps.contractService),
    authService: new AuthService(deps.jwtSecret),
    rateLimiter: new RateLimiterService(deps.redis),
    queryCostAnalyzer: new QueryCostAnalyzer(deps.queryCost),
  };
}
