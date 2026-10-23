import assert from "node:assert/strict";
import { createGotusUi, GOTUS_READY } from "./inputUi.mjs";

export async function runGotusChatChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases }) {
  const profiles = [{ name: "desktop", width: 1280, height: 900, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true }];
  const input = "textarea[aria-label='Message du chat']";
  async function fill(selector, value) {
    await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); input.focus(); Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await delay(50);
  }
  async function click(selector) {
    const point = await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,reachable:node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}; })()`);
    assert.ok(point.reachable, `reachable control ${selector}`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  }
  for (const profile of profiles) for (const surface of ["waiting", "live"]) {
    const ui = createGotusUi({ cdp, evaluate, mobile: profile.mobile });
    const label = `${profile.name}-${surface}`;
    await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, mobile: profile.mobile, deviceScaleFactor: 1 });
    await cdp("Page.navigate", { url: `${origin}/dev/gotus/?intro-test&chat-test` });
    await waitFor(() => evaluate("!!window.gotusFixture?.chat"), "chat fixture");
    await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)},${profile.mobile})`);
    await waitFor(() => evaluate(GOTUS_READY), "Gotus introduction finished");
    if (profile.mobile) {
      const launcher = await evaluate("(() => { const button=document.querySelector('.gotus__chat-button');return {count:document.querySelectorAll('[data-chat-launcher-button]').length,label:button?.getAttribute('aria-label'),rect:button?.getBoundingClientRect().toJSON()}; })()");
      assert.equal(launcher.count, 1); assert.equal(launcher.label, "Ouvrir le chat");
      assert.ok(launcher.rect.top >= 0 && launcher.rect.bottom <= 100, "mobile chat launcher in top header");
      const unreadField = surface === "waiting" ? "homeUnreadCount" : "mobileUnreadCount";
      const unreadBefore = await evaluate(`gotusFixture.chat.inspect().${unreadField}`);
      await evaluate("gotusFixture.chat.receive('Message reçu pendant Gotus')");
      assert.equal(await evaluate(`gotusFixture.chat.inspect().${unreadField}`), unreadBefore + 1);
      await click(".gotus__chat-button");
      await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(input)})`), "existing mobile chat drawer");
      await delay(300);
      assert.equal(await evaluate("!!document.querySelector('.gotus-surface__chat')"), false);
      const stacking = await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(input)}),r=input.getBoundingClientRect(),panel=input.closest('[data-chat-panel]'); return {rect:r.toJSON(),z:Number(getComputedStyle(panel).zIndex),topmost:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input,gotusVisible:!!document.querySelector('.gotus-surface')}; })()`);
      assert.ok(stacking.topmost && stacking.gotusVisible, "production chat drawer above Gotus");
      assert.ok(stacking.rect.top >= 0 && stacking.rect.bottom <= profile.height);
      cases.push({ chat: label, launcher, stacking });
    } else {
      await waitFor(() => evaluate("!!document.querySelector('.gotus-chat-column textarea')"), "production desktop chat");
      assert.equal(await evaluate("document.querySelectorAll('[data-chat-panel]').length"), 1);
      assert.equal(await evaluate("document.querySelectorAll('[data-chat-launcher-button]').length"), 0);
      assert.ok(await evaluate("document.querySelector('.gotus-surface__chat').getBoundingClientRect().width>=300"));
      await evaluate("gotusFixture.chat.receive('Message reçu pendant Gotus')");
    }
    assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(input)}).length`), 1, "one chat composer");
    await waitFor(() => evaluate("document.querySelector('[data-chat-panel]').textContent.includes('Message reçu pendant Gotus')"), "received message rendered");
    await fill(input, `Envoi ${label}`);
    if (profile.mobile) await click(".chat-content-send");
    else {
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
    await waitFor(() => evaluate(`gotusFixture.chat.inspect().messages.some(message=>message.text===${JSON.stringify(`Envoi ${label}`)})`), "chat send and server echo");
    const sent = await evaluate("gotusFixture.chat.inspect().emissions.filter(item=>item.event==='chat:send')");
    assert.equal(sent.length, 1);
    assert.equal(typeof sent[0].payload === "object" && sent[0].payload.lobby === true, surface === "waiting");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(input)}).value`), "");
    await fill(input, "Brouillon conservé");
    if (profile.mobile) {
      await evaluate("document.querySelector('[aria-label=\"Fermer le chat\"]').click()");
      await waitFor(() => evaluate("!document.querySelector('[data-chat-panel]')"), "chat closed");
      assert.equal(await evaluate("gotusFixture.chat.inspect().input"), "Brouillon conservé");
      await click(".gotus__chat-button"); await delay(300);
    } else {
      await evaluate("gotusFixture.closeAll()");
      await waitFor(() => evaluate("!document.querySelector('.gotus-surface')"), "Gotus closed");
      assert.equal(await evaluate("gotusFixture.chat.inspect().input"), "Brouillon conservé");
      await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)},false)`);
      await waitFor(() => evaluate(`${GOTUS_READY} && !!document.querySelector('.gotus-chat-column textarea')`), "Gotus reopened");
    }
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(input)}).value`), "Brouillon conservé");
    if (profile.mobile) {
      await evaluate("document.querySelector('[aria-label=\"Fermer le chat\"]').click()");
      await waitFor(() => evaluate("!document.querySelector('[data-chat-panel]')"), "chat closed for board entry");
    }
    await ui.word("BANANE");
    await ui.submit();
    await waitFor(() => evaluate("!document.querySelector('.gotus__board [data-editable=\"true\"]')"), "letter reveal started");
    if (profile.mobile) {
      await ui.click(".gotus__chat-button");
      await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(input)})`), "chat reopened during reveal");
    }
    await evaluate(`document.querySelector(${JSON.stringify(input)}).focus()`);
    await waitFor(() => evaluate(GOTUS_READY), "reveal finished");
    assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(input)})`), true, "Gotus reveal preserves chat focus");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(input)}).value`), "Brouillon conservé");
    assert.equal(await evaluate("gotusFixture.chat.inspect().handlers"), 6, "single chat realtime subscription set");
    if (surface === "waiting") assert.ok(await evaluate("gotusFixture.chat.inspect().subscriptions>0"));
    await capture(`chat-${label}`);
    if (profile.mobile && surface === "waiting") {
      await evaluate("gotusFixture.waiting('reminder')");
      await waitFor(() => evaluate("!!document.querySelector('.gotus-waiting__dialog')"), "tournament reminder over chat");
      const reminder = await evaluate("(() => { const dialog=document.querySelector('.gotus-waiting__dialog');return {rect:dialog.getBoundingClientRect().toJSON(),buttons:[...dialog.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {text:button.textContent.trim(),topmost:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}),chatStillOpen:gotusFixture.chat.inspect().mobileChatOpen}; })()");
      assert.ok(reminder.chatStillOpen && reminder.buttons.every(button => button.topmost), "reminder controls above open chat drawer");
      await capture("chat-mobile-waiting-reminder");
      await click(".gotus-waiting__actions button:nth-child(2)");
      await waitFor(() => evaluate("!document.querySelector('.gotus-waiting__dialog')"), "reminder dismissed");
      assert.equal(await evaluate("gotusFixture.chat.inspect().mobileChatOpen"), true);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(input)}).value`), "Brouillon conservé");
      const chatTopmost = await evaluate(`(() => {const input=document.querySelector(${JSON.stringify(input)}),r=input.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input;})()`);
      assert.ok(chatTopmost, "chat remains usable after reminder dismissed");
      cases.push({ chat: label, reminder, reminderDraftRetained: true });
    }
    cases.push({ chat: label, sent, draftRetained: true, focusRetained: true, singleComposer: true });
  }
}
