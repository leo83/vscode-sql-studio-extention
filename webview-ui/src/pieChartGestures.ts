import type { EChartsOption, EChartsType } from "echarts";
import { PIE_LEGEND_WIDTH } from "./chartConfig";

export const PIE_SCALE_MIN = 0.5;
export const PIE_SCALE_MAX = 2.5;

export interface PieGestureHandlers {
  dispose: () => void;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LegendRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface GestureLikeEvent extends Event {
  scale: number;
  clientX?: number;
  clientY?: number;
}

interface LegendOptionLike {
  type?: string;
  width?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;
}

export function clampPieScale(scale: number): number {
  return Math.min(PIE_SCALE_MAX, Math.max(PIE_SCALE_MIN, scale));
}

export function parseChartInset(
  value: number | string | undefined,
  chartSize: number,
  fallback: number
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const percentMatch = /^([\d.]+)%$/.exec(trimmed);
    if (percentMatch) {
      return (parseFloat(percentMatch[1]) / 100) * chartSize;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return fallback;
}

export function resolveLegendRegion(
  chartWidth: number,
  chartHeight: number,
  legendOption: LegendOptionLike | undefined
): LegendRegion | null {
  if (!legendOption || legendOption.type !== "scroll") {
    return null;
  }

  const width = parseChartInset(legendOption.width, chartWidth, PIE_LEGEND_WIDTH);
  const rightInset = parseChartInset(legendOption.right, chartWidth, 8);
  const top = parseChartInset(legendOption.top, chartHeight, 8);
  const bottomInset = parseChartInset(legendOption.bottom, chartHeight, 8);

  return {
    left: chartWidth - rightInset - width,
    top,
    right: chartWidth - rightInset,
    bottom: chartHeight - bottomInset,
  };
}

export function isPointInLegendRegion(point: ChartPoint, region: LegendRegion): boolean {
  return (
    point.x >= region.left &&
    point.x <= region.right &&
    point.y >= region.top &&
    point.y <= region.bottom
  );
}

export function isPointInPieRegion(
  point: ChartPoint,
  legendRegion: LegendRegion | null,
  chartWidth: number
): boolean {
  if (!legendRegion) {
    return point.x >= 0 && point.x <= chartWidth;
  }
  return point.x < legendRegion.left;
}

export function wheelSteps(deltaY: number): number {
  return Math.max(1, Math.round(Math.abs(deltaY) / 12));
}

export function wheelZoomDelta(deltaY: number): number {
  return -deltaY * 0.005;
}

export function pointerDistance(left: ChartPoint, right: ChartPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function getLegendOption(chart: EChartsType): LegendOptionLike | undefined {
  const option = chart.getOption();
  const raw = option.legend as EChartsOption["legend"];
  const legend = Array.isArray(raw) ? raw[0] : raw;
  return legend as LegendOptionLike | undefined;
}

function getLegendScrollState(
  chart: EChartsType
): { index: number; count: number } | null {
  const legend = getLegendOption(chart);
  if (!legend || legend.type !== "scroll") {
    return null;
  }

  const option = chart.getOption();
  const scrollLegend = legend as { scrollDataIndex?: number; data?: unknown[] };

  const rawSeries = option.series as EChartsOption["series"];
  const series = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
  const seriesData = (series?.data as unknown[] | undefined) ?? [];
  const legendData = scrollLegend.data ?? [];
  const count = Math.max(seriesData.length, legendData.length);
  if (count === 0) {
    return null;
  }

  return {
    index: scrollLegend.scrollDataIndex ?? 0,
    count,
  };
}

export function nextLegendScrollIndex(
  currentIndex: number,
  itemCount: number,
  deltaSteps: number
): number {
  if (itemCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(itemCount - 1, currentIndex + deltaSteps));
}

/** Imperative legend scroll (tests / fallback). Prefer native ECharts wheel handling. */
export function scrollLegendBySteps(chart: EChartsType, deltaSteps: number): void {
  const state = getLegendScrollState(chart);
  if (!state || state.count === 0) {
    return;
  }

  const next = nextLegendScrollIndex(state.index, state.count, deltaSteps);
  if (next === state.index) {
    return;
  }

  chart.dispatchAction({
    type: "legendScroll",
    scrollDataIndex: next,
  });
}

function clientToChartPoint(dom: HTMLElement, clientX: number, clientY: number): ChartPoint {
  const rect = dom.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function isZoomWheel(event: WheelEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function attachPieChartGestures(
  chart: EChartsType,
  getPieScale: () => number,
  setPieScale: (scale: number) => void
): PieGestureHandlers {
  const dom = chart.getDom();
  let pinchStartScale = getPieScale();
  let gestureActive = false;
  let pinchBaselineDistance = 0;
  let pinchBaselineScale = getPieScale();
  const activePointers = new Map<number, ChartPoint>();

  const chartPointFromClient = (clientX: number, clientY: number): ChartPoint =>
    clientToChartPoint(dom, clientX, clientY);

  const getRegions = () => {
    const width = chart.getWidth();
    const height = chart.getHeight();
    const legendRegion = resolveLegendRegion(width, height, getLegendOption(chart));
    return { width, height, legendRegion };
  };

  const onWheel = (event: WheelEvent) => {
    const point = chartPointFromClient(event.clientX, event.clientY);
    const { width, legendRegion } = getRegions();

    if (legendRegion && isPointInLegendRegion(point, legendRegion) && !isZoomWheel(event)) {
      // Block page scroll only; let ECharts handle legend wheel on the canvas (no stopPropagation).
      event.preventDefault();
      return;
    }

    if (isZoomWheel(event) && isPointInPieRegion(point, legendRegion, width)) {
      setPieScale(clampPieScale(getPieScale() + wheelZoomDelta(event.deltaY)));
      event.preventDefault();
    }
  };

  const onGestureStart = (event: Event) => {
    const gesture = event as GestureLikeEvent;
    const point = chartPointFromClient(gesture.clientX ?? 0, gesture.clientY ?? 0);
    const { width, legendRegion } = getRegions();
    if (!isPointInPieRegion(point, legendRegion, width)) {
      gestureActive = false;
      return;
    }
    event.preventDefault();
    gestureActive = true;
    pinchStartScale = getPieScale();
  };

  const onGestureChange = (event: Event) => {
    if (!gestureActive) {
      return;
    }
    event.preventDefault();
    const gesture = event as GestureLikeEvent;
    setPieScale(clampPieScale(pinchStartScale * gesture.scale));
  };

  const onGestureEnd = () => {
    gestureActive = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      return;
    }
    activePointers.set(event.pointerId, chartPointFromClient(event.clientX, event.clientY));
    if (activePointers.size === 2) {
      const points = [...activePointers.values()];
      pinchBaselineDistance = pointerDistance(points[0], points[1]);
      pinchBaselineScale = getPieScale();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    activePointers.set(event.pointerId, chartPointFromClient(event.clientX, event.clientY));
    if (activePointers.size !== 2 || pinchBaselineDistance <= 0) {
      return;
    }
    const points = [...activePointers.values()];
    const distance = pointerDistance(points[0], points[1]);
    setPieScale(clampPieScale(pinchBaselineScale * (distance / pinchBaselineDistance)));
    event.preventDefault();
  };

  const clearPointer = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchBaselineDistance = 0;
    }
  };

  // Bubble phase so ECharts zrender receives the event before we prevent page scroll.
  dom.addEventListener("wheel", onWheel, { passive: false });
  dom.addEventListener("gesturestart", onGestureStart, { passive: false });
  dom.addEventListener("gesturechange", onGestureChange, { passive: false });
  dom.addEventListener("gestureend", onGestureEnd);
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove, { passive: false });
  dom.addEventListener("pointerup", clearPointer);
  dom.addEventListener("pointercancel", clearPointer);

  return {
    dispose: () => {
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("gesturestart", onGestureStart);
      dom.removeEventListener("gesturechange", onGestureChange);
      dom.removeEventListener("gestureend", onGestureEnd);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", clearPointer);
      dom.removeEventListener("pointercancel", clearPointer);
    },
  };
}
