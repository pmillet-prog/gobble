import assert from "node:assert/strict";
import { createGotusUi, GOTUS_READY } from "./inputUi.mjs";

export async function runGotusInputChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases }) {
  const profiles = [{ name: "desktop", width: 1280, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true }];
  for (const profile of profiles) for (const surface of ["training", "live"]) {
    const label = `${profile.name}-${surface}`, ui = createGotusUi({ cdp, evaluate, mobile: profile.mobile });
    const chatInput = 'textarea[aria-label="Message du chat"]';
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, mobile: profile.mobile, deviceScaleFactor: 1 });
    await cdp("Page.navigate", { url: `${origin}/dev/gotus/?intro-test&input-test` });
    await waitFor(() => evaluate("!!window.gotusFixture?.responsive"), `${label} fixture`);
    await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)},${profile.mobile})`);
    await waitFor(() => evaluate(GOTUS_READY), `${label} board ready`);
    const accessibility = await evaluate("(() => {const grid=document.querySelector('.gotus__board');return {role:grid.getAttribute('role'),tabIndex:grid.tabIndex,cells:grid.querySelectorAll('[role=gridcell]').length,selected:grid.querySelectorAll('[data-selected=\"true\"]').length,textInputs:document.querySelectorAll('.gotus__playground input[type=text],.gotus__playground textarea').length};})()");
    assert.deepEqual(accessibility, { role: "grid", tabIndex: 0, cells: 36, selected: 1, textInputs: 0 });
    assert.equal(await ui.row(0), "B·····"); assert.equal(await ui.selected(), 1);
    await ui.select(1);
    for (const [index, letter] of [..."ANANE"].entries()) {
      await ui.typeLetters(letter);
      assert.equal(await ui.selected(), Math.min(index + 2, 5), "cursor advances after a letter");
    }
    assert.equal(await ui.row(0), "BANANE");
    await ui.select(2); await ui.typeLetters("L");
    assert.equal(await ui.row(0), "BALANE", "replace previous letter without shifting suffix");
    assert.equal(await ui.selected(), 3);
    await capture(`input-${label}-replacement`);
    await ui.key("ArrowLeft"); assert.equal(await ui.selected(), 2);
    await ui.key("Delete"); assert.equal(await ui.row(0), "BA·ANE"); assert.equal(await ui.selected(), 2);
    await ui.typeLetters("N"); assert.equal(await ui.row(0), "BANANE");
    const backspace = () => profile.mobile ? ui.click('.gotus__keyboard button[aria-label="Effacer une lettre"]') : ui.key("Backspace");
    await backspace(); assert.equal(await ui.row(0), "BAN·NE"); assert.equal(await ui.selected(), 3);
    await backspace(); assert.equal(await ui.row(0), "BA··NE"); assert.equal(await ui.selected(), 2);
    await ui.typeLetters("NA"); assert.equal(await ui.row(0), "BANANE"); assert.equal(await ui.selected(), 4);
    await ui.key("ArrowRight"); assert.equal(await ui.selected(), 5);
    await ui.key("ArrowRight"); assert.equal(await ui.selected(), 5, "cursor stays within row");
    await ui.key("Home"); assert.equal(await ui.selected(), 0);
    await ui.key("ArrowLeft"); assert.equal(await ui.selected(), 0);
    await ui.key("End"); assert.equal(await ui.selected(), 5);
    await ui.submit();
    await waitFor(() => evaluate("!document.querySelector('.gotus__board [data-editable=\"true\"]')"), "reveal locks board");
    assert.equal(await ui.row(0), "BANANE", "submitted row matches edited word exactly");
    await ui.click('.gotus__board [data-gotus-row="0"][data-gotus-column="2"]');
    for (const key of ["Z", "Backspace", "Delete", "ArrowLeft", "Enter"]) await ui.key(key);
    assert.equal(await ui.row(0), "BANANE", "revealing row ignores typing and editing");
    if (surface === "live") {
      assert.deepEqual(await evaluate("gotusFixture.liveEmissions.filter(entry=>entry.event==='gotus:guess').map(entry=>entry.payload.word)"), ["BANANE"]);
    }
    if (profile.mobile) await ui.click(".gotus__chat-button");
    await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(chatInput)})`), "chat composer available");
    if (profile.mobile) await delay(250);
    await ui.click(chatInput);
    await cdp("Input.insertText", { text: "Brouillon pendant la révélation" });
    await waitFor(() => evaluate(GOTUS_READY), "next attempt ready");
    assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(chatInput)})`), true, "next attempt preserves chat focus");
    assert.equal(await evaluate("gotusFixture.chat.inspect().input"), "Brouillon pendant la révélation");
    assert.equal(await ui.row(0), "BANANE");
    assert.equal(await evaluate("document.querySelector('.gotus__row[data-active=\"true\"] [data-gotus-row]')?.dataset.gotusRow"), "1");
    assert.equal(await ui.row(1), "BA····", "all correctly placed letters are prefilled on the next attempt");
    assert.equal(await ui.selected(), 2, "next attempt selects the first unknown letter");
    await capture(`input-${label}-chat-focus`);
    if (profile.mobile) {
      await evaluate("document.querySelector('[aria-label=\"Fermer le chat\"]').click()");
      await waitFor(() => evaluate("!document.querySelector('[data-chat-panel]')"), "chat closed");
    }
    await ui.select(0); await ui.typeLetters("B");
    assert.equal(await ui.selected(), 1, "typing advances one cell even when the next letter is known");
    await ui.typeLetters("O");
    assert.equal(await ui.row(1), "BO····", "continuous typing overwrites the known A without skipping it");
    assert.equal(await ui.selected(), 2);
    await ui.select(1); await ui.typeLetters("A");
    await ui.select(1); await ui.key("Delete");
    assert.equal(await ui.row(1), "B·····", "deleting a known letter leaves the cell genuinely empty");
    assert.equal(await ui.selected(), 1);
    await ui.typeLetters("A");
    assert.equal(await ui.row(1), "BA····"); assert.equal(await ui.selected(), 2);
    await ui.typeLetters("LLON");
    assert.equal(await ui.row(1), "BALLON", "typing only missing LLON completes the prefilled BA");
    await ui.submit();
    await waitFor(() => evaluate("document.querySelector('.gotus__finish')?.textContent.includes('BALLON')"), "winning word resolved");
    assert.equal(await evaluate("document.querySelectorAll('.gotus__board [data-editable=\"true\"]').length"), 0);
    if (surface === "live") {
      assert.deepEqual(await evaluate("gotusFixture.liveEmissions.filter(entry=>entry.event==='gotus:guess').map(entry=>entry.payload.word)"), ["BANANE", "BALLON"]);
      assert.equal(await evaluate("gotusFixture.state().wordsFound"), 1, "prefilled letters still award one found word");
    }
    await evaluate("gotusFixture.closeAll()");
    await waitFor(() => evaluate("!document.querySelector('.gotus__board')"), "first puzzle closed");
    await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)},${profile.mobile})`);
    await waitFor(() => evaluate(GOTUS_READY), "known-prefix puzzle ready");
    await ui.word("BALLES"); await ui.submit();
    await waitFor(() => evaluate(`${GOTUS_READY} && document.querySelector('.gotus__row[data-active=\"true\"] [data-gotus-row]')?.dataset.gotusRow==='1'`), "four known letters revealed");
    assert.equal(await ui.row(1), "BALL··"); assert.equal(await ui.selected(), 4);
    await ui.select(4); await ui.typeLetters("ON");
    assert.equal(await ui.row(1), "BALLON", "typing only ON completes the prefilled BALL");
    await ui.submit();
    await waitFor(() => evaluate("document.querySelector('.gotus__finish')?.textContent.includes('BALLON')"), "known-prefix win");
    if (surface === "live") {
      assert.deepEqual(await evaluate("gotusFixture.liveEmissions.filter(entry=>entry.event==='gotus:guess').map(entry=>entry.payload.word)"), ["BANANE", "BALLON", "BALLES", "BALLON"]);
      assert.equal(await evaluate("gotusFixture.state().wordsFound"), 1);
    }
    cases.push({ input: label, accessibility, prefilledFirstLetter: true, initialColumn: 1,
      overwriteWithoutShift: true, autoAdvance: true, deleteAndBackspace: true, navigation: true,
      submittedWords: ["BANANE", "BALLON", "BALLES", "BALLON"], revealLocked: true, chatFocusPreserved: true,
      knownLetters: [{ prefill: "BA", typed: "LLON", submitted: "BALLON" }, { prefill: "BALL", typed: "ON", submitted: "BALLON" }],
      knownLetterOverwrite: true, knownLetterDelete: true, continuousTypingWithoutSkip: true });
  }
}
