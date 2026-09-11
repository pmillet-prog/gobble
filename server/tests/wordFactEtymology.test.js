import assert from "node:assert/strict";
import test from "node:test";
import { resolveWordFactEtymology } from "../definitions/wordFactService.js";

const douer = {
  title: "douer",
  etymology: "XIIe siècle En ancien français doer venant du latin doto.",
};

test("Pivot follows the grammatical notice for doué to the actual origin of douer", async () => {
  const lookups = [];
  const etymology = await resolveWordFactEtymology("doué", {
    title: "doué",
    isFormOf: false,
    etymology: "Participe passé du verbe douer.",
  }, {
    lookupEntry: async (word) => { lookups.push(word); return douer; },
  });
  assert.deepEqual(lookups, ["douer"]);
  assert.equal(etymology, "De douer : XIIe siècle En ancien français doer venant du latin doto");
  assert.doesNotMatch(etymology, /participe passé/i);
});

test("grammatical notices alone never become etymologies when the origin is missing", async () => {
  for (const etymology of [
    "Participe passé du verbe douer.",
    "Participe présent de douer.",
    "Féminin singulier de doué.",
    "Masculin pluriel de doué.",
    "Forme conjuguée du verbe douer.",
    "Forme fléchie de douer.",
    "Participe passé.",
    "Féminin de l’adjectif « doué ».",
  ]) {
    assert.equal(await resolveWordFactEtymology("forme", { title: "forme", etymology }, {
      lookupEntry: async () => null,
    }), "", etymology);
  }
});

test("chains of grammatical references resolve and loops stop", async () => {
  const entries = {
    douee: { title: "douée", etymology: "Féminin singulier de doué." },
    doue: { title: "doué", etymology: "Participe passé du verbe douer." },
    douer,
  };
  const etymology = await resolveWordFactEtymology("douée", entries.douee, {
    lookupEntry: async (word) => entries[word],
  });
  assert.equal(etymology, "De doué : De douer : XIIe siècle En ancien français doer venant du latin doto");
  assert.equal(await resolveWordFactEtymology("doué", entries.doue, {
    lookupEntry: async () => ({ title: "douer", etymology: "Forme de doué." }),
  }), "");
});

test("an origin that includes historical participles or additional information remains usable", async () => {
  for (const etymology of [
    "Du latin fictus, participe passé de fingere.",
    "Participe passé du latin fictus.",
    "Participe passé du verbe douer. XIIe siècle, du latin doto.",
    "Dérivé de terre avec le suffixe -ien.",
  ]) {
    assert.equal(await resolveWordFactEtymology("exemple", { title: "exemple", etymology }, {
      lookupEntry: async () => { assert.fail("A substantive origin must not be treated as a bare grammatical reference"); },
    }), etymology.slice(0, -1));
  }
});

test("a reference with no usable etymology is rejected rather than replaced with a definition", async () => {
  assert.equal(await resolveWordFactEtymology("doué", { etymology: "Participe passé du verbe douer." }, {
    lookupEntry: async () => ({ title: "douer", definition: "Donner des qualités ou des avantages.", etymology: "" }),
  }), "");
});
