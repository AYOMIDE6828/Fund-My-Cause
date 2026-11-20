/**
 * DataLoader batching guards for nested GraphQL resolvers (#1686).
 * Each distinct key is fetched once per request, so repeated parents do not
 * trigger repeated service calls.
 */

import { describe, it, expect, vi } from "vitest";
import { createDataLoaders } from "./dataloader.js";

function fakeService() {
  return {
    getCampaign: vi.fn(async (id: string) => ({ id })),
    getUser: vi.fn(async (address: string) => ({ address })),
    getCampaignContributions: vi.fn(async (id: string) => [{ campaignId: id }]),
  };
}

describe("createDataLoaders N+1 guard (#1686)", () => {
  it("fetches a repeated campaign id once per request", async () => {
    const service = fakeService();
    const loaders = createDataLoaders(service as never);

    await Promise.all([
      loaders.campaigns.load("c1"),
      loaders.campaigns.load("c1"),
      loaders.campaigns.load("c2"),
    ]);

    expect(service.getCampaign).toHaveBeenCalledTimes(2);
  });

  it("fetches contributions once per distinct campaign", async () => {
    const service = fakeService();
    const loaders = createDataLoaders(service as never);

    await Promise.all([
      loaders.campaignContributions.load("c1"),
      loaders.campaignContributions.load("c1"),
      loaders.campaignContributions.load("c2"),
    ]);

    expect(service.getCampaignContributions).toHaveBeenCalledTimes(2);
  });
});
