import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { BAFOUILLE_HISTORY_LIMIT, createHumorWordPicker, createResultsWordPresenter,
  loadHumorDictionary } from "../bots/resultsWordPresenter.js";
import { BOT_ANIMATOR_ROSTER } from "../bots/botManager.js";

const entry = (word, counts = [1, 1, 1], definition = `Définition humoristique de ${word}.`) => ({
  word, label: word.toUpperCase(), definition,
  hits: { normal: counts[0], massive_boggle: counts[1], finale: counts[2] },
});
const catalog = entries => ({ schemaVersion: 1,
  modes: ["normal", "massive_boggle", "finale"].map(key => ({ key, grids: 1000 })), entries });
const round = (words, type = "normal", extra = {}) => ({
  id: Symbol(), solutions: words.map(word => ({ word, pts: word.length * 10 })), special: { type }, ...extra,
});
const take = (presenter, current, options = {}) => presenter.takeForRound(current, {
  preparePinot: async () => ({ word: "lexique", line: "Définition et étymologie de LEXIQUE." }),
  ...options,
});

async function setup(t, entries = [entry("rare"), entry("courant", [100, 200, 300])]) {
  const directory = await mkdtemp(path.join(tmpdir(), "gobble-bafouille-test-"));
  const filePath = path.join(directory, "history.json"), errors = [];
  const options = { catalog: catalog(entries), filePath, onError: error => errors.push(error) };
  const presenter = createResultsWordPresenter(options);
  await presenter.load();
  t.after(async () => {
    await presenter.flush();
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("gobble-bafouille-test-")) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return { presenter, options, errors };
}

test("Bafouille uses the matching sample and chooses the rarest playable word, including zero observations", () => {
  const pick = createHumorWordPicker(catalog([
    entry("rare", [1, 40, 20]), entry("courant", [100, 2, 10]), entry("absent", [0, 0, 0]),
  ]));
  assert.equal(pick(round(["courant", "RARE"]))?.word, "rare");
  assert.equal(pick(round(["rare", "courant"], "massive_boggle"))?.word, "courant");
  assert.equal(pick(round(["rare", "courant"], "finale"))?.frequency.mode, "finale");
  assert.equal(pick(round(["rare", "courant"], "speed"))?.word, "rare");
  assert.equal(pick(round(["rare", "absent", "courant"]))?.word, "absent");
  assert.equal(pick(round(["motinconnu", "ai"])), null);
  assert.equal(pick(round([])), null);
});

test("word and definition exclusions precede frequency, never fall back to a repeat, and ties are stable", () => {
  const pick = createHumorWordPicker(catalog([
    entry("ete", [0, 0, 0], "Une pause très méritée !"), entry("repos", [1, 1, 1], "Une pause très méritée !"),
    entry("alpha", [10, 10, 10]), entry("beta", [10, 10, 10]),
  ]));
  assert.equal(pick(round(["ete", "repos", "beta", "alpha"]), [
    { word: "ÉTÉ", definition: "UNE PAUSE TRES MERITEE." },
  ])?.word, "alpha");
  assert.equal(pick(round(["beta", "alpha"]))?.word, pick(round(["alpha", "beta"]))?.word);
  assert.equal(pick(round(["ÉTÉ", "repos"]), [{ word: "été", definition: "Une pause très méritée !" }]), null);
  assert.throws(() => createHumorWordPicker(catalog([entry("ai")])));
  const malformed = catalog([entry("rare")]); delete malformed.entries[0].hits.finale;
  assert.throws(() => createHumorWordPicker(malformed), "missing frequency data must not become a zero");
});

test("Bafouille selects inflections by the playable form's frequency and shares the lemma's repetition filter", () => {
  const data = catalog([entry("boire", [100, 100, 100]), entry("chat", [100, 100, 100]), entry("doux"), entry("rare", [2, 2, 2])]);
  data.forms = [
    { word: "buvais", lemma: "boire", formLabel: "forme conjuguée de", hits: { normal: 1, massive_boggle: 5, finale: 0 } },
    { word: "buvaient", lemma: "boire", hits: { normal: 0, massive_boggle: 0, finale: 0 } },
    { word: "chats", lemma: "chat", hits: { normal: 0, massive_boggle: 0, finale: 0 } },
    { word: "douce", lemma: "doux", hits: { normal: 0, massive_boggle: 0, finale: 0 } },
  ];
  const pick = createHumorWordPicker(data);
  const selected = pick(round(["buvais", "rare"]));
  assert.equal(selected.word, "buvais");
  assert.equal(selected.lemma, "boire");
  assert.equal(selected.frequency.hits, 1);
  assert.match(selected.line, /BUVAIS, forme conjuguée de BOIRE : Définition humoristique de boire\.$/u);
  assert.equal(selected.formText, "BUVAIS, forme conjuguée de ");
  assert.deepEqual(selected.highlights, ["BOIRE"]);
  assert.equal(pick(round(["buvais", "rare"], "massive_boggle")).word, "rare");
  assert.equal(pick(round(["buvais", "buvaient", "boire"])).word, "boire");
  assert.equal(pick(round(["buvais", "boire", "rare"])).word, "rare", "redundant forms cannot lower a lemma's frequency");
  assert.equal(pick(round(["chat", "chats"])).word, "chat");
  assert.equal(pick(round(["chats"])), null, "a simple plural is never an extra candidate");
  assert.equal(pick(round(["douce"])).lemma, "doux", "a changed feminine can add a candidate");
  assert.equal(pick(round(["douce", "doux"])).word, "doux");
  assert.equal(pick(round(["buvais", "buvaient", "boire"]), [{ word: "boire", definition: "Texte ancien." }]), null);
  assert.equal(pick(round(["buvais", "buvaient", "boire"]), [{ word: "buvais", definition: selected.definition }]), null);
});

test("alternation advances once at results, survives reload, and preparation or training cannot consume it", async t => {
  const { presenter, options, errors } = await setup(t);
  const discarded = round(["rare"]);
  assert.equal(presenter.planRound(discarded), "linguist");
  assert.equal(presenter.snapshot().nextBotKey, "linguist");
  const first = round(["rare"]);
  presenter.planRound(first);
  assert.equal((await take(presenter, first))?.botKey, "linguist");
  assert.equal((await take(presenter, first))?.botKey, "linguist");
  const training = round(["rare"], "normal", { training: true });
  presenter.planRound(training); await take(presenter, training);
  assert.deepEqual(presenter.snapshot(), { nextBotKey: "humorist", questions: [] });
  await presenter.flush();
  const reloaded = createResultsWordPresenter(options); await reloaded.load();
  const second = round(["courant", "rare"]);
  assert.equal(reloaded.planRound(second), "humorist");
  const result = await take(reloaded, second);
  assert.equal(result.word, "rare");
  assert.equal(await take(reloaded, second), result);
  assert.equal(reloaded.snapshot().questions.length, 1);
  assert.equal(reloaded.planRound(round(["rare"])), "linguist");
  await reloaded.flush();
  const afterRestart = createResultsWordPresenter(options); await afterRestart.load();
  assert.deepEqual(afterRestart.snapshot(), reloaded.snapshot());
  assert.deepEqual(errors, []);
});

test("fresh history is applied to already planned grids, and exhaustion uses Pinot without repeating Bafouille", async t => {
  const { presenter } = await setup(t);
  const first = round(["rare"]); presenter.planRound(first); await take(presenter, first);
  const second = round(["rare"]), stale = round(["rare", "courant"]);
  presenter.planRound(second); presenter.planRound(stale);
  assert.equal((await take(presenter, second))?.word, "rare");
  assert.equal((await take(presenter, stale))?.word, "courant");
  const exhausted = round(["rare", "courant"]);
  presenter.planRound(exhausted, { pinotEnabled: false });
  assert.equal(await take(presenter, exhausted), null);
  const pinot = round(["rare"]); presenter.planRound(pinot); await take(presenter, pinot);
  const fallback = round(["rare"]); presenter.planRound(fallback);
  assert.equal((await take(presenter, fallback))?.botKey, "linguist");
  assert.equal(presenter.snapshot().questions.length, 2);
});

test("missing Pinot falls back once to the rarest Massive Boggle candidate and persists the actual turn", async t => {
  const { presenter, options } = await setup(t, [entry("rare", [1, 20, 1]), entry("absent", [10, 0, 10])]);
  const current = round(["rare", "absent"], "massive_boggle");
  assert.equal(presenter.planRound(current), "linguist");
  let release, lookups = 0;
  const preparePinot = () => { lookups++; return new Promise(resolve => { release = resolve; }); };
  const first = take(presenter, current, { preparePinot });
  const duplicate = take(presenter, current, { preparePinot });
  assert.equal(first, duplicate, "concurrent result builds share their selection");
  await Promise.resolve();
  assert.equal(lookups, 1);
  assert.deepEqual(presenter.snapshot(), { nextBotKey: "linguist", questions: [] });
  release(null);
  const result = await first;
  assert.equal(result.botKey, "humorist");
  assert.equal(result.word, "absent");
  assert.equal(result.frequency.mode, "massive_boggle");
  assert.equal(await duplicate, result);
  assert.equal(await take(presenter, current), result);
  assert.equal(presenter.snapshot().questions.length, 1);
  assert.equal(presenter.snapshot().nextBotKey, "linguist");
  await presenter.flush();
  const reloaded = createResultsWordPresenter(options); await reloaded.load();
  assert.deepEqual(reloaded.snapshot(), presenter.snapshot());
  const following = round(["rare", "absent"], "massive_boggle");
  reloaded.planRound(following);
  assert.equal((await take(reloaded, following, { preparePinot: async () => null })).word, "rare",
    "fallback appearances also populate the anti-repetition history");
  await reloaded.flush();
});

test("Bafouille avoids an unused Pinot lookup, but exhausted Bafouille really resolves Pinot", async t => {
  const { presenter } = await setup(t);
  const first = round(["rare"]); presenter.planRound(first); await take(presenter, first);
  let lookups = 0;
  const preparePinot = async () => { lookups++; return { line: "Le texte de Pinot." }; };
  const humor = round(["rare"]); presenter.planRound(humor);
  assert.equal((await take(presenter, humor, { preparePinot })).botKey, "humorist");
  assert.equal(lookups, 0);
  const target = round([], "target_long"); presenter.planRound(target); await take(presenter, target);
  const repeat = round(["rare"]); presenter.planRound(repeat);
  assert.equal((await take(presenter, repeat, { preparePinot })).line, "Le texte de Pinot.");
  assert.equal(lookups, 1);
  assert.equal(presenter.snapshot().questions.length, 1);
  assert.equal(presenter.snapshot().nextBotKey, "humorist");
});

test("when neither presenter has a text, no turn or repetition exclusion is consumed", async t => {
  const { presenter } = await setup(t);
  const noPinot = { preparePinot: async () => null };
  const empty = round([]); presenter.planRound(empty);
  const before = presenter.snapshot();
  assert.equal(await take(presenter, empty, noPinot), null);
  assert.equal(await take(presenter, empty), null, "an empty finalized result stays stable");
  assert.deepEqual(presenter.snapshot(), before);
  const used = round(["rare"]); presenter.planRound(used, { pinotEnabled: false });
  await take(presenter, used);
  const first = round([]); presenter.planRound(first); await take(presenter, first);
  const repeat = round(["rare"]); presenter.planRound(repeat);
  const beforeRepeat = presenter.snapshot();
  assert.equal(await take(presenter, repeat, noPinot), null);
  assert.deepEqual(presenter.snapshot(), beforeRepeat, "exhaustion cannot bypass recent definitions");
});

test("missing Pinot never invites Bafouille into targets, training, or a disabled slot", async t => {
  for (const type of ["target_long", "target_score", "normal"]) {
    for (const extra of [{}, { training: true }]) {
      const { presenter } = await setup(t);
      const current = round(["rare"], type, extra);
      presenter.planRound(current, type === "normal" && !extra.training ? { bafouilleEnabled: false } : {});
      assert.equal(await take(presenter, current, { preparePinot: async () => null }), null);
      assert.equal(presenter.snapshot().questions.length, 0);
      assert.equal(presenter.snapshot().nextBotKey,
        type !== "normal" && !extra.training ? "humorist" : "linguist");
    }
  }
});

test("a replaced round cannot consume an appearance after its delayed Pinot lookup", async t => {
  const { presenter } = await setup(t);
  const current = round(["rare"]); presenter.planRound(current);
  let active = true, release;
  const result = take(presenter, current, {
    preparePinot: () => new Promise(resolve => { release = resolve; }), isCurrent: () => active,
  });
  await Promise.resolve();
  active = false;
  release(null);
  assert.equal(await result, null);
  assert.deepEqual(presenter.snapshot(), { nextBotKey: "linguist", questions: [] });
});

test("both target modes use Pinot and reserve the next eligible round for Bafouille, across reload", async t => {
  for (const type of ["target_long", "target_score"]) for (const nextWasBafouille of [false, true]) {
    const { presenter, options } = await setup(t);
    if (nextWasBafouille) {
      const first = round(["rare"]); presenter.planRound(first); await take(presenter, first);
    }
    const before = presenter.snapshot();
    const target = round(["rare"], type);
    assert.equal(presenter.planRound(target), "linguist");
    assert.deepEqual(presenter.snapshot(), before, "preparing/abandoning a target consumes nothing");
    assert.equal((await take(presenter, target))?.botKey, "linguist");
    assert.deepEqual(presenter.snapshot(), { nextBotKey: "humorist", questions: [] });
    await presenter.flush();
    const reloaded = createResultsWordPresenter(options); await reloaded.load();
    const following = round(["rare"]);
    assert.equal(reloaded.planRound(following), "humorist");
    assert.equal((await take(reloaded, following))?.word, "rare");
    assert.equal(reloaded.planRound(round(["courant"])), "linguist");
    assert.equal((await take(presenter, target))?.botKey, "linguist", "repeated results are idempotent");
    await reloaded.flush();
  }
});

test("consecutive targets and empty grids keep Bafouille due until an unseen candidate is available", async t => {
  const { presenter } = await setup(t);
  const play = current => { presenter.planRound(current); return take(presenter, current); };
  assert.equal((await play(round(["rare"], "target_long")))?.botKey, "linguist");
  assert.equal((await play(round(["rare"], "target_score")))?.botKey, "linguist");
  assert.equal((await play(round([])))?.botKey, "linguist");
  assert.equal(presenter.snapshot().nextBotKey, "humorist");
  assert.equal((await play(round(["rare"])))?.botKey, "humorist");
  assert.equal((await play(round(["rare"], "target_long")))?.botKey, "linguist");
  assert.equal((await play(round(["rare"])))?.botKey, "linguist", "recent words stay excluded");
  assert.equal(presenter.snapshot().nextBotKey, "humorist");
  assert.equal((await play(round(["rare", "courant"])))?.word, "courant");
  assert.equal(presenter.snapshot().nextBotKey, "linguist");
});

test("target restriction respects disabled bots and training does not change public alternation", async t => {
  for (const type of ["target_long", "target_score"]) {
    const { presenter } = await setup(t);
    for (const options of [{ enabled: false }, { pinotEnabled: false }, { bafouilleEnabled: false }]) {
      const target = round(["rare"], type), before = presenter.snapshot();
      const expected = options.bafouilleEnabled === false ? "linguist" : null;
      assert.equal(presenter.planRound(target, options), expected);
      assert.equal((await take(presenter, target))?.botKey || null, expected);
      assert.deepEqual(presenter.snapshot(), before);
    }
    for (let turn = 0; turn < 2; turn++) {
      const training = round(["rare"], type, { training: true }), before = presenter.snapshot();
      assert.equal(presenter.planRound(training), "linguist");
      await take(presenter, training);
      assert.deepEqual(presenter.snapshot(), before);
      const regular = round(["rare"]); presenter.planRound(regular); await take(presenter, regular);
    }
  }
});

test("the last 100 definitions remain excluded after reload, older entries become eligible", async t => {
  const entries = Array.from({ length: BAFOUILLE_HISTORY_LIMIT + 1 }, (_, i) =>
    entry(`mot${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`));
  const { presenter, options } = await setup(t, entries);
  for (const candidate of entries) {
    const current = round([candidate.word]); presenter.planRound(current, { pinotEnabled: false });
    assert.equal((await take(presenter, current))?.word, candidate.word);
  }
  await presenter.flush();
  const reloaded = createResultsWordPresenter(options); await reloaded.load();
  assert.equal(reloaded.snapshot().questions.length, 100);
  const blocked = round([entries.at(-1).word]); reloaded.planRound(blocked, { pinotEnabled: false });
  assert.equal(await take(reloaded, blocked), null);
  const old = round([entries[0].word]); reloaded.planRound(old, { pinotEnabled: false });
  assert.equal((await take(reloaded, old))?.word, entries[0].word);
  await reloaded.flush();
});

test("disabling bots consumes nothing; corrupt files and write errors are reported without losing in-memory exclusions", async t => {
  const { presenter, options, errors } = await setup(t);
  const disabled = round(["rare"]); presenter.planRound(disabled, { enabled: false });
  assert.equal(await take(presenter, disabled), null);
  assert.deepEqual(presenter.snapshot(), { nextBotKey: "linguist", questions: [] });
  await writeFile(options.filePath, "broken JSON");
  const corrupt = createResultsWordPresenter(options); await corrupt.load();
  assert.equal(errors.length, 1);
  const failing = createResultsWordPresenter({ ...options, filePath: path.join(options.filePath, "impossible.json") });
  const first = round(["rare"]); failing.planRound(first, { pinotEnabled: false });
  assert.equal((await take(failing, first))?.word, "rare");
  await failing.flush();
  assert.equal(errors.length, 2);
  const repeat = round(["rare"]); failing.planRound(repeat, { pinotEnabled: false });
  assert.equal(await take(failing, repeat), null);
});

test("the packaged runtime corpus matches its source and editorial frequencies; Laurent replaces Momo in the roster", async () => {
  const runtime = await loadHumorDictionary();
  const source = await readFile(new URL("../../data/humor/definitions.fr.txt", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), runtime.provenance.sourceSha256);
  const editorial = JSON.parse(await readFile(new URL("../../docs/humor-dictionary/catalog.fr.json", import.meta.url), "utf8"));
  assert.ok(runtime.entries.length >= 5000);
  assert.equal(runtime.entries.length, editorial.count);
  const byWord = new Map(editorial.entries.map(e => [e.word, e]));
  for (const e of runtime.entries) {
    assert.equal(e.definition, byWord.get(e.word).definition);
    for (const mode of runtime.modes) assert.equal(e.hits[mode.key], byWord.get(e.word).frequencies[mode.key].hits);
  }
  const pick = createHumorWordPicker(runtime);
  assert.ok(pick(round(runtime.entries.map(e => e.word))));
  assert.ok(runtime.forms.length > 10000);
  for (const form of runtime.forms) {
    assert.ok(form.word.length >= 3);
    assert.ok(byWord.has(form.lemma));
    assert.ok(!byWord.has(form.word), "a direct humorous definition takes priority");
    assert.ok(!form.word.startsWith(form.lemma), "a simple extension adds no candidate");
  }
  for (const word of ["buvaient", "buvais"]) {
    const selected = pick(round([word]));
    assert.equal(selected.word, word);
    assert.ok(selected.lemma);
    assert.ok(selected.formText);
  }
  assert.equal(BOT_ANIMATOR_ROSTER.some(bot => bot.nick === "MomoMotus"), false);
  assert.equal(BOT_ANIMATOR_ROSTER.filter(bot => bot.nick === "Laurent Bafouille").length, 1);
});
