export function edgeScrollSpeed(x, width) {
  const edge = Math.min(64, width / 4);
  if (x < edge) return -520 * Math.min(1, (edge - x) / edge) ** 2;
  if (x > width - edge) return 520 * Math.min(1, (x - width + edge) / edge) ** 2;
  return 0;
}

// Own a single animation loop, including when a finger rests at the edge.
export function createChalkboardEdgeScroll({ getNode, isDragging, onMove,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  let frame = 0, pointer = null, previousTime = null;
  function stop() {
    if (frame) cancelFrame(frame);
    frame = 0;
    pointer = null;
    previousTime = null;
  }
  function tick(time) {
    frame = 0;
    const node = getNode();
    if (!node || !pointer || !isDragging()) return stop();
    const rect = node.getBoundingClientRect();
    const speed = edgeScrollSpeed(pointer.clientX - rect.left, node.clientWidth);
    const dt = previousTime == null ? 16 : Math.min(32, time - previousTime);
    previousTime = time;
    const before = node.scrollLeft;
    node.scrollLeft = Math.max(0, Math.min(node.scrollWidth - node.clientWidth, before + speed * dt / 1000));
    if (!speed || node.scrollLeft === before) return stop();
    onMove(pointer);
    frame = requestFrame(tick);
  }
  return {
    track(event) {
      if (!isDragging()) return stop();
      pointer = { clientX: event.clientX, clientY: event.clientY, pressure: event.pressure };
      if (!frame) frame = requestFrame(tick);
    },
    stop,
  };
}
