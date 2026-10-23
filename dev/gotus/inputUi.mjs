import assert from "node:assert/strict";

export const GOTUS_READY = "!!document.querySelector('.gotus__board [data-editable=\"true\"]') && !document.querySelector('.gotus-intro')";

export function createGotusUi({ cdp, evaluate, mobile = false }) {
  async function click(selector, { allowCovered = false } = {}) {
    const point = await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node) throw new Error('Missing UI control: '+${JSON.stringify(selector)}); node.scrollIntoView({block:'nearest',inline:'nearest'}); const r=node.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,reachable:node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}; })()`);
    if (!allowCovered) assert.ok(point.reachable, `reachable control ${selector}`);
    if (mobile) {
      await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
      await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    }
  }
  async function key(value) {
    const special = { Enter: ["Enter", 13], Backspace: ["Backspace", 8], Delete: ["Delete", 46],
      ArrowLeft: ["ArrowLeft", 37], ArrowRight: ["ArrowRight", 39], Home: ["Home", 36], End: ["End", 35] };
    const [code, windowsVirtualKeyCode] = special[value] || [`Key${value.toUpperCase()}`, value.toUpperCase().charCodeAt(0)];
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: value, code, windowsVirtualKeyCode });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: value, code, windowsVirtualKeyCode });
  }
  async function typeLetters(letters) {
    for (const letter of letters) {
      if (mobile) await click(`.gotus__keyboard button[aria-label^="${letter}"]`);
      else await key(letter);
    }
  }
  const select = column => click(`.gotus__row[data-active="true"] [data-gotus-column="${column}"]`);
  async function word(value) {
    // Select every position explicitly for full-word replacement scenarios;
    // continuous typing and cursor movement have separate behavioral checks.
    for (const [column, letter] of [...value].entries()) { await select(column); await typeLetters(letter); }
  }
  const submit = () => mobile ? click('.gotus__keyboard button[aria-label="Proposer"]') : key("Enter");
  const row = index => evaluate(`Array.from(document.querySelectorAll('.gotus__board [data-gotus-row="${index}"]')).map(cell=>cell.textContent).join('')`);
  const selected = () => evaluate("Number(document.querySelector('.gotus__board [data-selected=\"true\"]')?.dataset.gotusColumn ?? -1)");
  return { click, key, typeLetters, select, word, submit, row, selected };
}
