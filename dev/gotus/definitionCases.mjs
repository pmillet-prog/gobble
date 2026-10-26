import assert from "node:assert/strict";
import { createGotusUi, GOTUS_READY } from "./inputUi.mjs";

export async function runGotusDefinitionChecks({ cdp, evaluate, capture, waitFor, origin, cases }) {
  for (const profile of [{ name: "mobile", width: 390, height: 844, mobile: true }, { name: "desktop", width: 1440, height: 900, mobile: false }]) {
    await cdp("Emulation.setDeviceMetricsOverride", { ...profile, deviceScaleFactor: 1 });
    const ui = createGotusUi({ cdp, evaluate, mobile: profile.mobile });
    for (const surface of ["training", "live"]) {
      await cdp("Page.navigate", { url: `${origin}/dev/gotus/?intro-test=1` });
      await waitFor(() => evaluate("!!window.gotusFixture"), "fixture ready");
      await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)}, ${profile.mobile})`);
      await waitFor(() => evaluate(GOTUS_READY), `${surface} ready`);
      assert.equal(await evaluate("document.querySelectorAll('.gotus-solution button').length"), 0, "No definition before the answer is revealed");
      if (surface === "training") await ui.click(".gotus__footer button:first-child");
      else { await ui.word("BALLON"); await ui.submit(); }
      await waitFor(() => evaluate("!!document.querySelector('.gotus-solution button')"), "revealed solution");
      const geometry = await evaluate("document.querySelector('.gotus-solution button').getBoundingClientRect().toJSON()");
      assert.ok(geometry.width >= 44 && geometry.height >= 44);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
      await ui.click(".gotus-solution button");
      await waitFor(() => evaluate("[...document.querySelectorAll('[role=dialog]')].some(dialog=>dialog.textContent.includes('Objet gonflable'))"), "definition opens above Gotus");
      assert.deepEqual(await evaluate("gotusFixture.definitionCalls"), ["BALLON"]);
      await capture(`definition-${profile.name}-${surface}`);
      await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(button=>button.textContent.trim()==='Fermer').click()");
      assert.equal(await evaluate("!!document.querySelector('.gotus__finish')"), true);
      cases.push({ profile: profile.name, surface, definition: "BALLON", geometry });
    }
    await evaluate("gotusFixture.recap({won:true,solution:'BALLON',attemptsUsed:1})");
    await waitFor(() => evaluate("!!document.querySelector('.gotus-recap .gotus-solution button')"), "recap");
    await ui.click(".gotus-recap .gotus-solution button");
    await waitFor(() => evaluate("gotusFixture.definitionCalls.length === 2"), "recap definition");
    await capture(`definition-${profile.name}-recap`);
    cases.push({ profile: profile.name, surface: "recap", definition: "BALLON" });
  }
}
