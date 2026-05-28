import { describe, expect, it } from "vitest";
import {
  clampPieScale,
  isPointInLegendRegion,
  isPointInPieRegion,
  nextLegendScrollIndex,
  parseChartInset,
  pointerDistance,
  PIE_SCALE_MAX,
  PIE_SCALE_MIN,
  resolveLegendRegion,
  wheelSteps,
  wheelZoomDelta,
} from "./pieChartGestures";

describe("clampPieScale", () => {
  it("clamps zoom within configured bounds", () => {
    expect(clampPieScale(0.1)).toBe(PIE_SCALE_MIN);
    expect(clampPieScale(3)).toBe(PIE_SCALE_MAX);
    expect(clampPieScale(1.2)).toBe(1.2);
  });
});

describe("parseChartInset", () => {
  it("parses pixel and percent insets", () => {
    expect(parseChartInset(12, 800, 0)).toBe(12);
    expect(parseChartInset("10%", 500, 0)).toBe(50);
    expect(parseChartInset(undefined, 500, 8)).toBe(8);
  });
});

describe("resolveLegendRegion", () => {
  it("builds a right-side legend box from chart options", () => {
    const region = resolveLegendRegion(1000, 600, {
      type: "scroll",
      width: 160,
      right: 8,
      top: 8,
      bottom: 8,
    });

    expect(region).toEqual({
      left: 832,
      top: 8,
      right: 992,
      bottom: 592,
    });
  });

  it("returns null for plain legends", () => {
    expect(resolveLegendRegion(1000, 600, { type: "plain" })).toBeNull();
  });
});

describe("legend and pie hit regions", () => {
  const legendRegion = {
    left: 800,
    top: 8,
    right: 992,
    bottom: 592,
  };

  it("detects points inside the legend", () => {
    expect(isPointInLegendRegion({ x: 850, y: 100 }, legendRegion)).toBe(true);
    expect(isPointInLegendRegion({ x: 700, y: 100 }, legendRegion)).toBe(false);
  });

  it("treats the left chart area as the pie region", () => {
    expect(isPointInPieRegion({ x: 400, y: 300 }, legendRegion, 1000)).toBe(true);
    expect(isPointInPieRegion({ x: 900, y: 300 }, legendRegion, 1000)).toBe(false);
    expect(isPointInPieRegion({ x: 500, y: 300 }, null, 1000)).toBe(true);
  });
});

describe("wheel helpers", () => {
  it("derives scroll steps from trackpad delta", () => {
    expect(wheelSteps(24)).toBe(1);
    expect(wheelSteps(72)).toBe(3);
  });

  it("derives zoom delta from ctrl/meta wheel events", () => {
    expect(wheelZoomDelta(-120)).toBeCloseTo(0.6);
    expect(wheelZoomDelta(120)).toBeCloseTo(-0.6);
  });
});

describe("nextLegendScrollIndex", () => {
  it("scrolls within item bounds", () => {
    expect(nextLegendScrollIndex(4, 10, 2)).toBe(6);
    expect(nextLegendScrollIndex(0, 10, -3)).toBe(0);
    expect(nextLegendScrollIndex(9, 10, 5)).toBe(9);
  });
});

describe("pointerDistance", () => {
  it("measures distance between two touch points", () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
