import { overviewSchema, type Overview, type TenantContext } from "@profit-pilot/contracts";
import { getWorkspaceOverview } from "@profit-pilot/db";
import { developmentOverview } from "@profit-pilot/fixtures";

import type { ApiConfig } from "./config.js";

export interface OverviewService {
  get(context: TenantContext): Promise<Overview>;
}

export function createOverviewService(config: ApiConfig): OverviewService {
  if (config.DATABASE_URL) {
    return { get: getWorkspaceOverview };
  }
  return {
    async get() {
      return overviewSchema.parse(developmentOverview);
    },
  };
}
