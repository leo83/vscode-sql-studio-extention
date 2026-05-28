import { describe, expect, it } from "vitest";
import {
  clampErScale,
  computeAutofitTransform,
  ER_SCALE_MAX,
  ER_SCALE_MIN,
  panTransformFromWheel,
  transformsEqual,
  wheelZoomDelta,
  zoomTransformAtPoint,
} from "./erDiagramGestures";

describe("clampErScale", () => {
  it("clamps zoom within ER diagram bounds", () => {
    expect(clampErScale(1)).toBe(1);
    expect(clampErScale(ER_SCALE_MIN)).toBe(ER_SCALE_MIN);
    expect(clampErScale(ER_SCALE_MAX)).toBe(ER_SCALE_MAX);
    expect(clampErScale(0.1)).toBe(ER_SCALE_MIN);
    expect(clampErScale(10)).toBe(ER_SCALE_MAX);
  });
});

describe("wheelZoomDelta", () => {
  it("derives zoom delta from trackpad pinch wheel events", () => {
    expect(wheelZoomDelta(-120)).toBeCloseTo(0.6);
    expect(wheelZoomDelta(120)).toBeCloseTo(-0.6);
  });
});

describe("zoomTransformAtPoint", () => {
  it("keeps the anchor point fixed while zooming", () => {
    const next = zoomTransformAtPoint({ scale: 1, x: 0, y: 0 }, { x: 100, y: 50 }, 2);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-100);
    expect(next.y).toBe(-50);
  });
});

describe("panTransformFromWheel", () => {
  it("moves the diagram opposite to wheel deltas", () => {
    expect(panTransformFromWheel({ scale: 1, x: 10, y: 20 }, 5, 8)).toEqual({
      scale: 1,
      x: 5,
      y: 12,
    });
  });
});

describe("computeAutofitTransform", () => {
  it("scales down and centers large diagrams", () => {
    const fit = computeAutofitTransform(
      { width: 1000, height: 800 },
      { width: 2000, height: 1000 },
      24
    );
    expect(fit.scale).toBeCloseTo(0.476);
    expect(fit.x).toBeCloseTo(24);
    expect(fit.y).toBeCloseTo(162);
  });

  it("scales up small diagrams to fill the viewport", () => {
    const fit = computeAutofitTransform(
      { width: 1000, height: 800 },
      { width: 100, height: 100 },
      24
    );
    expect(fit.scale).toBe(4);
    expect(fit.x).toBeCloseTo(300);
    expect(fit.y).toBeCloseTo(200);
  });
});

describe("transformsEqual", () => {
  it("compares transforms with tolerance", () => {
    expect(
      transformsEqual({ scale: 1, x: 0, y: 0 }, { scale: 1.0005, x: 0.2, y: -0.2 })
    ).toBe(true);
    expect(transformsEqual({ scale: 1, x: 0, y: 0 }, { scale: 1.1, x: 0, y: 0 })).toBe(false);
  });
});
