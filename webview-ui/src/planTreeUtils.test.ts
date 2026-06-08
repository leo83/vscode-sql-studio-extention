import { describe, expect, it } from "vitest";
import {
  countPlanNodes,
  defaultPlanViewMode,
  filterPlanTree,
  flattenPlanTree,
  getPlanKindCategory,
  nodeMatchesSearch,
  planTreeToMarkdown,
} from "./planTreeUtils";
import type { PlanNode } from "./types";

const sampleTree: PlanNode[] = [
  {
    id: "root",
    kind: "Limit",
    title: "Limit",
    children: [
      {
        id: "scan",
        kind: "ReadFromMergeTree",
        title: "ReadFromMergeTree",
        subtitle: "robotisation.message",
        tags: ["full_scan"],
        metrics: [{ label: "Est. rows", value: 1000 }],
        children: [],
      },
    ],
  },
];

describe("planTreeUtils", () => {
  it("counts nodes recursively", () => {
    expect(countPlanNodes(sampleTree)).toBe(2);
  });

  it("flattens tree with depth", () => {
    const rows = flattenPlanTree(sampleTree);
    expect(rows).toHaveLength(2);
    expect(rows[1].depth).toBe(1);
    expect(rows[1].metricsText).toContain("Est. rows: 1000");
  });

  it("filters tree by search query", () => {
    const filtered = filterPlanTree(sampleTree, "robotisation");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].children).toHaveLength(1);
  });

  it("matches node search terms", () => {
    expect(nodeMatchesSearch(sampleTree[0].children![0], "mergetree")).toBe(true);
    expect(nodeMatchesSearch(sampleTree[0].children![0], "missing")).toBe(false);
  });

  it("classifies node kinds", () => {
    expect(getPlanKindCategory("ReadFromMergeTree")).toBe("scan");
    expect(getPlanKindCategory("Hash Join")).toBe("join");
    expect(getPlanKindCategory("Remote")).toBe("network");
  });

  it("chooses default view mode", () => {
    expect(defaultPlanViewMode("tree", true, false)).toBe("tree");
    expect(defaultPlanViewMode("table", true, true)).toBe("table");
    expect(defaultPlanViewMode("text", false, false)).toBe("raw");
  });

  it("converts plan tree to markdown", () => {
    const markdown = planTreeToMarkdown(sampleTree);
    expect(markdown).toContain("- **Limit**");
    expect(markdown).toContain("  - **ReadFromMergeTree** (robotisation.message) [full_scan] *(Est. rows: 1000)*");
  });
});
