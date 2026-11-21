import { GraphQLError } from "graphql";

/**
 * Narrows a nullable service read to a value, or throws NOT_FOUND (#1697).
 * Use it for every read from ContractService, so callers never handle null
 * and the error message stays the same across resolvers.
 */
export function requireRecord<T>(value: T | null | undefined, label: string, id: string): T {
  if (value === null || value === undefined) {
    throw new GraphQLError(`${label} not found: ${id}`, {
      extensions: { code: "NOT_FOUND" },
    });
  }
  return value;
}
