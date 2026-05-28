export const ER_SCALE_MIN = 0.25;
export const ER_SCALE_MAX = 4;

export interface DiagramTransform {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const ER_DIAGRAM_FIT_PADDING = 24;
export const ER_DIAGRAM_STAGE_PADDING = 12;

export interface ErDiagramGestureHandlers {
  dispose: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface GestureLikeEvent extends Event {
  scale: number;
  clientX?: number;
  clientY?: number;
}

export function clampErScale(scale: number): number {
  return Math.min(ER_SCALE_MAX, Math.max(ER_SCALE_MIN, scale));
}

function pointerDistance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clientToPoint(element: HTMLElement, clientX: number, clientY: number): Point {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function isZoomWheel(event: WheelEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function wheelZoomDelta(deltaY: number): number {
  return -deltaY * 0.005;
}

export function panTransformFromWheel(
  transform: DiagramTransform,
  deltaX: number,
  deltaY: number
): DiagramTransform {
  return {
    ...transform,
    x: transform.x - deltaX,
    y: transform.y - deltaY,
  };
}

export function computeAutofitTransform(
  viewport: Size,
  content: Size,
  padding = ER_DIAGRAM_FIT_PADDING
): DiagramTransform {
  if (
    content.width <= 0 ||
    content.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return { scale: 1, x: padding, y: padding };
  }

  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);
  const scale = clampErScale(
    Math.min(availableWidth / content.width, availableHeight / content.height, 1)
  );

  return {
    scale,
    x: padding + (availableWidth - content.width * scale) / 2,
    y: padding + (availableHeight - content.height * scale) / 2,
  };
}

export function transformsEqual(a: DiagramTransform, b: DiagramTransform): boolean {
  return (
    Math.abs(a.scale - b.scale) < 0.001 &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5
  );
}

export function zoomTransformAtPoint(
  transform: DiagramTransform,
  point: Point,
  nextScale: number
): DiagramTransform {
  const scale = clampErScale(nextScale);
  if (scale === transform.scale) {
    return transform;
  }
  const ratio = scale / transform.scale;
  return {
    scale,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  };
}

function midpoint(left: Point, right: Point): Point {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function attachErDiagramGestures(
  viewport: HTMLElement,
  getTransform: () => DiagramTransform,
  setTransform: (transform: DiagramTransform) => void
): ErDiagramGestureHandlers {
  const activePointers = new Map<number, Point>();
  let pinchBaselineDistance = 0;
  let pinchBaselineScale = 1;
  let pinchBaselineTransform: DiagramTransform | null = null;
  let pinchBaselineAnchor: Point | null = null;
  let gestureActive = false;
  let gestureStartScale = 1;
  let gestureStartTransform: DiagramTransform | null = null;
  let gestureAnchor: Point | null = null;
  let panPointerId: number | null = null;
  let panBaseline: Point | null = null;
  let panBaselineTransform: DiagramTransform | null = null;

  const pointFromEvent = (event: PointerEvent): Point =>
    clientToPoint(viewport, event.clientX, event.clientY);

  const onWheel = (event: WheelEvent) => {
    const current = getTransform();

    if (isZoomWheel(event)) {
      const anchor = clientToPoint(viewport, event.clientX, event.clientY);
      setTransform(
        zoomTransformAtPoint(
          current,
          anchor,
          current.scale + wheelZoomDelta(event.deltaY)
        )
      );
    } else {
      setTransform(panTransformFromWheel(current, event.deltaX, event.deltaY));
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const onGestureStart = (event: Event) => {
    event.preventDefault();
    gestureActive = true;
    gestureStartTransform = getTransform();
    gestureStartScale = gestureStartTransform.scale;
    const gesture = event as GestureLikeEvent;
    gestureAnchor = clientToPoint(
      viewport,
      gesture.clientX ?? viewport.clientWidth / 2,
      gesture.clientY ?? viewport.clientHeight / 2
    );
  };

  const onGestureChange = (event: Event) => {
    if (!gestureActive || !gestureStartTransform || !gestureAnchor) {
      return;
    }
    event.preventDefault();
    const gesture = event as GestureLikeEvent;
    setTransform(
      zoomTransformAtPoint(
        gestureStartTransform,
        gestureAnchor,
        gestureStartScale * gesture.scale
      )
    );
  };

  const onGestureEnd = () => {
    gestureActive = false;
    gestureStartTransform = null;
    gestureAnchor = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    viewport.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, pointFromEvent(event));

    if (activePointers.size === 2) {
      panPointerId = null;
      panBaseline = null;
      panBaselineTransform = null;
      const points = [...activePointers.values()];
      pinchBaselineDistance = pointerDistance(points[0], points[1]);
      pinchBaselineTransform = getTransform();
      pinchBaselineScale = pinchBaselineTransform.scale;
      pinchBaselineAnchor = midpoint(points[0], points[1]);
      return;
    }

    if (activePointers.size === 1 && event.button === 0) {
      panPointerId = event.pointerId;
      panBaseline = pointFromEvent(event);
      panBaselineTransform = getTransform();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    activePointers.set(event.pointerId, pointFromEvent(event));

    if (activePointers.size === 2 && pinchBaselineDistance > 0 && pinchBaselineTransform && pinchBaselineAnchor) {
      const points = [...activePointers.values()];
      const distance = pointerDistance(points[0], points[1]);
      setTransform(
        zoomTransformAtPoint(
          pinchBaselineTransform,
          pinchBaselineAnchor,
          pinchBaselineScale * (distance / pinchBaselineDistance)
        )
      );
      event.preventDefault();
      return;
    }

    if (
      panPointerId === event.pointerId &&
      panBaseline &&
      panBaselineTransform &&
      activePointers.size === 1
    ) {
      const point = pointFromEvent(event);
      setTransform({
        ...panBaselineTransform,
        x: panBaselineTransform.x + (point.x - panBaseline.x),
        y: panBaselineTransform.y + (point.y - panBaseline.y),
      });
      event.preventDefault();
    }
  };

  const clearPointer = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    if (panPointerId === event.pointerId) {
      panPointerId = null;
      panBaseline = null;
      panBaselineTransform = null;
    }
    if (activePointers.size < 2) {
      pinchBaselineDistance = 0;
      pinchBaselineTransform = null;
      pinchBaselineAnchor = null;
    }
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("wheel", onWheel, { passive: false, capture: true });
  viewport.addEventListener("gesturestart", onGestureStart, { passive: false });
  viewport.addEventListener("gesturechange", onGestureChange, { passive: false });
  viewport.addEventListener("gestureend", onGestureEnd);
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove, { passive: false });
  viewport.addEventListener("pointerup", clearPointer);
  viewport.addEventListener("pointercancel", clearPointer);

  return {
    dispose: () => {
      viewport.removeEventListener("wheel", onWheel, true);
      viewport.removeEventListener("gesturestart", onGestureStart);
      viewport.removeEventListener("gesturechange", onGestureChange);
      viewport.removeEventListener("gestureend", onGestureEnd);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", clearPointer);
      viewport.removeEventListener("pointercancel", clearPointer);
    },
  };
}
