import type { EChartsOption, EChartsType } from "echarts";

export const PIE_SCALE_MIN = 0.5;
export const PIE_SCALE_MAX = 2.5;

export interface PieGestureHandlers {
  dispose: () => void;
}

interface GestureLikeEvent extends Event {
  scale: number;
}

function clampPieScale(scale: number): number {
  return Math.min(PIE_SCALE_MAX, Math.max(PIE_SCALE_MIN, scale));
}

function isPointerInLegend(chart: EChartsType, x: number, y: number): boolean {
  try {
    return chart.containPixel("legend", [x, y]);
  } catch {
    return false;
  }
}

function isPointerInPie(chart: EChartsType, x: number, y: number): boolean {
  try {
    return chart.containPixel({ seriesIndex: 0 }, [x, y]);
  } catch {
    return false;
  }
}

function getLegendScrollState(
  chart: EChartsType
): { index: number; count: number } | null {
  const option = chart.getOption();
  const raw = option.legend as EChartsOption["legend"];
  const legend = Array.isArray(raw) ? raw[0] : raw;
  if (!legend || legend.type !== "scroll") {
    return null;
  }

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

function scrollLegend(chart: EChartsType, deltaSteps: number): void {
  const state = getLegendScrollState(chart);
  if (!state || state.count === 0) {
    return;
  }

  const next = Math.max(0, Math.min(state.count - 1, state.index + deltaSteps));
  if (next === state.index) {
    return;
  }

  chart.dispatchAction({
    type: "legendScroll",
    scrollDataIndex: next,
  });
}

export function attachPieChartGestures(
  chart: EChartsType,
  getPieScale: () => number,
  setPieScale: (scale: number) => void
): PieGestureHandlers {
  const zr = chart.getZr();
  const dom = chart.getDom();
  let lastPointer: [number, number] = [0, 0];
  let pinchStartScale = getPieScale();
  let gestureActive = false;

  const onMouseMove = (event: { offsetX?: number; offsetY?: number }) => {
    lastPointer = [event.offsetX ?? 0, event.offsetY ?? 0];
  };

  const onWheel = (event: { event?: WheelEvent; offsetX?: number; offsetY?: number }) => {
    const native = event.event;
    if (!native) {
      return;
    }

    const x = event.offsetX ?? lastPointer[0];
    const y = event.offsetY ?? lastPointer[1];
    lastPointer = [x, y];

    if (isPointerInLegend(chart, x, y) && !native.ctrlKey) {
      const steps = Math.max(1, Math.round(Math.abs(native.deltaY) / 24));
      scrollLegend(chart, native.deltaY > 0 ? steps : -steps);
      native.preventDefault();
      return;
    }

    if (native.ctrlKey && isPointerInPie(chart, x, y)) {
      const delta = -native.deltaY * 0.008;
      setPieScale(clampPieScale(getPieScale() + delta));
      native.preventDefault();
    }
  };

  const onGestureStart = (event: Event) => {
    if (!isPointerInPie(chart, lastPointer[0], lastPointer[1])) {
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

  zr.on("mousemove", onMouseMove);
  zr.on("mousewheel", onWheel);
  dom.addEventListener("gesturestart", onGestureStart, { passive: false });
  dom.addEventListener("gesturechange", onGestureChange, { passive: false });
  dom.addEventListener("gestureend", onGestureEnd);

  return {
    dispose: () => {
      zr.off("mousemove", onMouseMove);
      zr.off("mousewheel", onWheel);
      dom.removeEventListener("gesturestart", onGestureStart);
      dom.removeEventListener("gesturechange", onGestureChange);
      dom.removeEventListener("gestureend", onGestureEnd);
    },
  };
}
