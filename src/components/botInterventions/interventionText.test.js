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
