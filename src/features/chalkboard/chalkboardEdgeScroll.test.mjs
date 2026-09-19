import test from "node:test";
import assert from "node:assert/strict";
import { createChalkboardEdgeScroll, edgeScrollSpeed } from "./chalkboardEdgeScroll.js";

function fixture() {
  const frames = new Map();
  let id = 0, dragging = true, time = 0;
  const node = { scrollLeft: 300, scrollWidth: 2400, clientWidth: 390, getBoundingClientRect: () => ({ left: 10 }) };
  const moves = [];
  const controller = createChalkboardEdgeScroll({ getNode: () => node, isDragging: () => dragging,
    onMove: pointer => moves.push({ x: (pointer.clientX - 10 + node.scrollLeft) / 0.5, scrollLeft: node.scrollLeft }),
    requestFrame: callback => { frames.set(++id, callback); return id; }, cancelFrame: id => frames.delete(id),
  });
  return { node, moves, frames, controller, disable: () => { dragging = false; },
    tick() { time += 16; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); } };
}

test("edge speed is symmetric, progressive and zero in the centre", () => {
  assert.equal(edgeScrollSpeed(195, 390), 0);
  assert.equal(edgeScrollSpeed(0, 390), -edgeScrollSpeed(390, 390));
  assert.ok(edgeScrollSpeed(385, 390) > edgeScrollSpeed(345, 390));
  assert.equal(edgeScrollSpeed(800, 390), 520);
});

test("a stationary finger keeps scrolling, and placement follows the live world coordinate", () => {
  const f = fixture();
  f.controller.track({ clientX: 398, clientY: 200 });
  f.tick(); f.tick(); f.tick();
  assert.equal(f.moves.length, 3);
  assert.ok(f.node.scrollLeft > 320);
  assert.equal(f.moves[2].x - f.moves[0].x, (f.moves[2].scrollLeft - f.moves[0].scrollLeft) / 0.5);
  f.controller.stop();
  f.tick();
  assert.equal(f.moves.length, 3);
  assert.equal(f.frames.size, 0);
});

test("leaving the edge, ending the drag and reaching either board end stop the loop", () => {
  const f = fixture();
  f.controller.track({ clientX: 398 }); f.tick();
  f.controller.track({ clientX: 205 }); f.tick();
  assert.equal(f.frames.size, 0);
  f.node.scrollLeft = 2009;
  f.controller.track({ clientX: 398 }); f.tick(); f.tick();
  assert.equal(f.node.scrollLeft, 2010);
  assert.equal(f.frames.size, 0);
  f.node.scrollLeft = 1;
  f.controller.track({ clientX: 10 }); f.tick(); f.tick();
  assert.equal(f.node.scrollLeft, 0);
  assert.equal(f.frames.size, 0);
  f.controller.track({ clientX: 398 }); f.disable(); f.tick();
  assert.equal(f.frames.size, 0);
  f.controller.track({ clientX: 398 });
  assert.equal(f.frames.size, 0);
});
