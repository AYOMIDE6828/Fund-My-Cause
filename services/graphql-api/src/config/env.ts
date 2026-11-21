/**
 * Centralised environment loading for graphql-api (#1688).
 *
 * Every variable read here has a default, and numeric values are checked so
 * a typo fails at startup with the variable name, not later as NaN.
 * Dependency-free on purpose: this service does not depend on zod.
 */

export interface GraphqlEnv {
  port: number;
  nodeEnv: string;
  rpcUrl: string;
  contractNetwork: string;
  registryContractId: string;
  jwtSecret: string | undefined;
  queryCostMax: number;
  queryDepthMax: number;
  corsOrigins: string[] | undefined;
}

function intFrom(source: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = source[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return parsed;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): GraphqlEnv {
  return {
    port: intFrom(source, "GRAPHQL_PORT", 4000),
    nodeEnv: source.NODE_ENV || "development",
    rpcUrl: source.RPC_URL || "https://soroban-testnet.stellar.org",
    contractNetwork: source.CONTRACT_NETWORK || "testnet",
    registryContractId: source.REGISTRY_CONTRACT_ID || "",
    jwtSecret: source.JWT_SECRET,
    queryCostMax: intFrom(source, "GRAPHQL_QUERY_COST_MAX", 1000),
    queryDepthMax: intFrom(source, "GRAPHQL_QUERY_DEPTH_MAX", 15),
    corsOrigins: source.CORS_ORIGIN ? source.CORS_ORIGIN.split(",") : undefined,
  };
}
