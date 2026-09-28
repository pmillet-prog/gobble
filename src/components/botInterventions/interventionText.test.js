import test from "node:test";
import assert from "node:assert/strict";
import { mountTypedText } from "./interventionText.js";

function container() {
  const make = tagName => ({ tagName, children: [], attributes: {},
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  return Object.assign(make("span"), { ownerDocument: {
    createElement: make, createTextNode: data => ({ data }),
  } });
}

test("Julien's answer becomes clickable once typed, without forwarding the tap to the presenter", () => {
  const host = container(), opened = [];
  const typed = mountTypedText(host, "« ZÈBRE », bien sûr !", ["ZÈBRE"], word => opened.push(word));
  const button = host.children.find(node => node.tagName === "button");
  assert.ok(button);
  assert.equal(button.disabled, true);
  assert.equal(button.attributes["aria-label"], undefined);
  for (const { unit, writer } of typed.units) writer.write(writer.node.data + unit);
  assert.equal(button.disabled, false);
  let stopped = false;
  button.onclick({ stopPropagation() { stopped = true; } });
  assert.deepEqual(opened, ["ZÈBRE"]);
  assert.equal(stopped, true);
  assert.match(button.attributes["aria-label"], /définition/);
});

test("Pinot's explicit word links work with immediate text and leave scores and emphasis alone", () => {
  const host = container(), opened = [];
  const typed = mountTypedText(host, "BRAVO ! 12 mots, dont ZÈBRE : un équidé.", ["zèbre"], word => opened.push(word));
  typed.revealAll();
  const buttons = host.children.filter(node => node.tagName === "button");
  assert.equal(buttons.length, 1);
  buttons[0].onclick({ stopPropagation() {} });
  assert.deepEqual(opened, ["ZÈBRE"]);
  assert.equal(host.children.map(node => node.children[0].data).join(""), "BRAVO ! 12 mots, dont ZÈBRE : un équidé.");
});

test("playing-phase text stays noninteractive, and replacing an intervention removes old word controls", () => {
  const host = container();
  mountTypedText(host, "« CHAT » !", ["CHAT"], () => {}).revealAll();
  mountTypedText(host, "« CHIEN » ?", ["CHIEN"]).revealAll();
  assert.ok(host.children.every(node => node.tagName === "span"));
  assert.equal(host.children.map(node => node.children[0].data).join(""), "« CHIEN » ?");
});

test("the inflected form is subdued and the complete lemma stays highlighted and clickable", () => {
  const host = container(), opened = [];
  const text = "On pouvait aussi trouver CHATS, pluriel de CHAT : un colocataire exigeant.";
  const typed = mountTypedText(host, text, ["CHAT"], word => opened.push(word), "CHATS, pluriel de ");
  typed.revealAll();
  const form = host.children.find(node => node.className === "sprite-intervention-form");
  assert.equal(form.children[0].data, "CHATS, pluriel de ");
  const buttons = host.children.filter(node => node.tagName === "button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].children[0].data, "CHAT");
  buttons[0].onclick({ stopPropagation() {} });
  assert.deepEqual(opened, ["CHAT"]);
  assert.equal(host.children.map(node => node.children[0].data).join(""), text);
});

test("Pinot links the played form, its lemma and a verified related word without changing the text", () => {
  const host = container(), opened = [];
  const text = "On pouvait aussi trouver PARSIS, forme de PARSI. Adepte du parsisme.";
  const typed = mountTypedText(host, text, ["PARSIS", "PARSI", "parsisme"], word => opened.push(word), "PARSIS, forme de ");
  const buttons = host.children.filter(node => node.tagName === "button");
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every(button => button.disabled));
  for (const { unit, writer } of typed.units) writer.write(writer.node.data + unit);
  assert.ok(buttons[0].className.includes("sprite-intervention-form"), "the played form stays small and italic");
  assert.ok(buttons[1].className.includes("sprite-intervention-highlight"));
  for (const button of buttons) button.onclick({ stopPropagation() {} });
  assert.deepEqual(opened, ["PARSIS", "PARSI", "parsisme"]);
  assert.equal(host.children.map(node => node.children[0].data).join(""), text);
});

test("an explicit lemma never creates a link from a fragment of an unverified word", () => {
  const host = container();
  const text = "PARSI : du parsisme, des parsis et du parsi-inconnu.";
  mountTypedText(host, text, ["PARSI"], () => {}).revealAll();
  assert.deepEqual(host.children.filter(node => node.tagName === "button").map(node => node.children[0].data), ["PARSI"]);
  assert.equal(host.children.map(node => node.children[0].data).join(""), text);
});

test("word matching preserves accented spellings and compounds as complete link targets", () => {
  const host = container(), opened = [];
  const text = "On pouvait trouver ÉTÉ ou ARC-EN-CIEL.";
  mountTypedText(host, text, ["e\u0301te\u0301", "arc-en-ciel"], word => opened.push(word)).revealAll();
  for (const button of host.children.filter(node => node.tagName === "button")) button.onclick({ stopPropagation() {} });
  assert.deepEqual(opened, ["ÉTÉ", "ARC-EN-CIEL"]);
});
