import { describe, expect, it } from "vitest";
import {
  pieBaseRadius,
  pieCenter,
  pieUsesScrollLegend,
  scalePieRadius,
} from "./chartConfig";

describe("pieUsesScrollLegend", () => {
  it("enables scroll legend for large category sets", () => {
    expect(pieUsesScrollLegend(13)).toBe(true);
    expect(pieUsesScrollLegend(12)).toBe(false);
  });
});

describe("pieBaseRadius", () => {
  it("uses a larger radius when the scroll legend is shown", () => {
    expect(pieBaseRadius(true)).toEqual(["46%", "84%"]);
    expect(pieBaseRadius(false)).toEqual(["42%", "76%"]);
  });
});

describe("pieCenter", () => {
  it("shifts the pie left to leave room for the legend", () => {
    expect(pieCenter(true)).toEqual(["38%", "50%"]);
    expect(pieCenter(false)).toEqual(["50%", "52%"]);
  });
});

describe("scalePieRadius", () => {
  it("scales outer radius and preserves donut ring thickness", () => {
    expect(scalePieRadius("46%", "84%", 1)).toEqual(["46.0%", "84.0%"]);
    expect(scalePieRadius("46%", "84%", 2)).toEqual(["50.0%", "88.0%"]);
  });
});
