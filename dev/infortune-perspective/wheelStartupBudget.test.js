import test from "node:test";
import assert from "node:assert/strict";
import { createWheelStartupBudget } from "./wheelStartupBudget.js";

function fixture(allowFallback = true) {
  let time = 0, timer, reports = [];
  const visibility = new EventTarget(); visibility.hidden = false;
  const budget = createWheelStartupBudget({ now: () => time, visibility, onSlow(value) { reports.push(value); return allowFallback; },
    timers: { setTimeout(callback, delay) { timer = { callback, delay }; return 1; }, clearTimeout() { timer = null; } } });
  return { budget, reports, visibility, advance(ms) { time += ms; }, timer: () => timer };
}

test("loading timeout stops further GPU jobs, including after a synchronous overrun", () => {
  const app = fixture(); assert.equal(app.timer().delay, 8000);
  app.advance(12000); assert.equal(app.budget.check(), true); assert.equal(app.reports[0].elapsed, 12000);
  assert.equal(app.budget.check(), true); assert.equal(app.reports.length, 1); app.budget.dispose(); assert.equal(app.timer(), null);
});

test("background time does not consume the loading budget, and manual quality is not overridden", () => {
  const app = fixture(false); app.advance(3000);
  app.visibility.hidden = true; app.visibility.dispatchEvent(new Event("visibilitychange"));
  app.advance(60000); assert.equal(app.timer(), null); assert.equal(app.budget.check(), false);
  app.visibility.hidden = false; app.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(app.timer().delay, 5000); app.advance(5000); app.timer().callback();
  assert.equal(app.budget.check(), false); assert.equal(app.reports.length, 1); app.budget.dispose();
});
