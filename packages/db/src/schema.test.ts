import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  affiliateConnections,
  auditEvents,
  contentItems,
  contentRevisions,
  evidenceRecords,
  opportunities,
  products,
  publications,
} from "./schema.js";

describe("tenant-owned database tables", () => {
  it.each([
    ["affiliateConnections", affiliateConnections],
    ["products", products],
    ["opportunities", opportunities],
    ["contentItems", contentItems],
    ["contentRevisions", contentRevisions],
    ["evidenceRecords", evidenceRecords],
    ["publications", publications],
    ["auditEvents", auditEvents],
  ])("%s carries an organization boundary", (_name, table) => {
    expect(getTableColumns(table)).toHaveProperty("organizationId");
  });
});
