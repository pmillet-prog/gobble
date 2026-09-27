import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import parser from "@babel/parser";
import { createResultsWordPresenter } from "../bots/resultsWordPresenter.js";
import { normalizeWord, OCID_TYPE } from "../../shared/gameLogic.js";
import { getResultsWordIntro, getResultsWordFormText } from "../bots/resultsWordText.js";
import { createPresenterHintsController } from "../../src/features/presenters/createPresenterHintsController.js";

// Execute the real wiring without importing index.js or starting the backend.
const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const names = new Set(["prepareRoundPresenterInterventions", "prepareResultsWordPresentation",
  "commitPreparedPivotResultIntervention", "scheduleAmbientRoundEndBots", "pushAmbientChatBotMessage",
  "buildPresenterInterventionMessage", "rememberRoundPresenterIntervention", "preparePivotResultIntervention",
  "pickTargetRoundEtymologyLine", "isAmbientTargetRound", "isAmbientTargetRoundType", "buildDetailedHiddenWordFactLine"]);
const declarations = parser.parse(source, { sourceType: "module" }).program.body.filter(node =>
  (node.type === "FunctionDeclaration" && names.has(node.id.name)) ||
  (node.type === "VariableDeclaration" && node.declarations.some(d => d.id.name === "AMBIENT_CHAT_BOTS"))
).map(node => source.slice(node.start, node.end)).join("\n");

test("server results alternate Pinot and Bafouille presenter payloads, with no gameplay or chat leak", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "gobble-bafouille-live-"));
  const presenter = createResultsWordPresenter({ filePath: path.join(directory, "history.json"),
    catalog: { schemaVersion: 1, modes: ["normal", "massive_boggle", "finale"].map(key => ({ key, grids: 1000 })),
      entries: [{ word: "boire", label: "BOIRE", definition: "Activité qui demande un verre.",
        hits: { normal: 1, massive_boggle: 2, finale: 3 } }, ...["alpha", "beta", "gamma", "delta"].map(word => ({
        word, label: word.toUpperCase(), definition: `Définition de test pour ${word}.`,
        hits: { normal: 1, massive_boggle: 2, finale: 3 },
      }))], forms: [{ word: "buvais", lemma: "boire", formLabel: "forme conjuguée de", hits: { normal: 0, massive_boggle: 0, finale: 0 } }] },
  });
  t.after(async () => {
    await presenter.flush();
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("gobble-bafouille-live-")) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const messages = [], rememberedPinotWords = [];
  let serial = 0, pinotPreparations = 0, pinotAvailable = true;
  const context = vm.createContext({
    Map, Set, normalizeWord, OCID_TYPE, resultsWordPresenter: presenter, getResultsWordIntro, getResultsWordFormText,
    AMBIENT_CHAT_BOTS_ENABLED: true, AMBIENT_CHAT_BOT_ENABLED_KEYS: new Set(["linguist", "humorist"]),
    PRESENTER_INTERVENTION_TEXT_MAX_LEN: 700, PRESENTER_CHAT_COPY_TEXT_MAX_LEN: 2400, CHAT_MESSAGE_TEXT_MAX_LEN: 300,
    randomUUID: () => `message-${++serial}`,
    areGameplayPresenterHintsDisabled: () => true,
    getAmbientChatBotState: room => room.ambient,
    pushChatMessage: (room, message) => { messages.push(message); room.chatMessages.push(message); },
    rememberPivotWord: (_room, word) => rememberedPinotWords.push(word),
    collectRoundWordHighlights: () => ({}),
    getOfflineWordFactDetails: async word => {
      assert.equal(word, "cible");
      return { displayWord: "CIBLE", etymology: "Du mot ancien de test", definitions: [{ definition: "Définition lexicale de test" }] };
    },
    pickGrosRobertRoundEndLine: () => {
      pinotPreparations++;
      if (!pinotAvailable) return null;
      return { word: "lexique", line: "On pouvait trouver LEXIQUE. Étymologie : exemple.", highlights: ["LEXIQUE"] };
    },
  });
  vm.runInContext(declarations, context);
  const room = { id: "salon", chatMessages: [] };
  const start = (id, type = "normal", word = "boire") => {
    room.currentRound = { id, special: { type }, targetWord: "cible", solutions: [{ word }] };
    room.ambient = { flags: new Set(), messagesThisRound: 99, lastByBot: new Map() };
    context.prepareRoundPresenterInterventions(room);
  };
  start("first");
  assert.equal(pinotPreparations, 1);
  assert.equal(messages.length, 0);
  await context.prepareResultsWordPresentation(room);
  const pinot = room.currentRound.presenterInterventions.linguist;
  assert.equal(pinot.nick, "Bernard Pinot");
  context.scheduleAmbientRoundEndBots(room, []);
  assert.equal(messages.length, 0, "Pinot retains his existing presenter channel");
  start("second", "normal", "buvais");
  assert.equal(pinotPreparations, 1, "Bafouille does not prepare an unused Pinot intervention");
  assert.equal(messages.length, 0, "nothing is revealed while playing");
  await context.prepareResultsWordPresentation(room);
  const bafouille = room.currentRound.presenterInterventions.humorist;
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.presenterInterventions.humorist, bafouille, "results snapshots retain one stable intervention");
  assert.equal(room.currentRound.presenterInterventions.linguist, undefined);
  assert.equal(context.commitPreparedPivotResultIntervention(room), null);
  context.scheduleAmbientRoundEndBots(room, []);
  context.scheduleAmbientRoundEndBots(room, []);
  assert.equal(messages.length, 0, "chat copy belongs to the client after presentation, like Pinot");
  assert.equal(bafouille.nick, "Laurent Bafouille");
  assert.equal(bafouille.meta.category, "humorist");
  assert.equal(bafouille.text, `${getResultsWordIntro("second")} BUVAIS, forme conjuguée de BOIRE : Activité qui demande un verre.`);
  assert.equal(bafouille.meta.formText, "BUVAIS, forme conjuguée de ");
  assert.equal(bafouille.meta.highlights.join(), "BOIRE");
  assert.equal(presenter.snapshot().questions[0].word, "boire", "history stores the lemma across its forms");
  const lemmaLine = context.buildDetailedHiddenWordFactLine({ displayWord: "MANGEAIENT", baseWord: "MANGER", isForm: true,
    definition: "Avaler un aliment", etymology: "Du latin" }, "second");
  assert.equal(lemmaLine, `${getResultsWordIntro("second")} MANGEAIENT, forme de MANGER. Avaler un aliment. Étymologie : Du latin.`);
  assert.equal(Object.values(room.currentRound.presenterInterventions).length, 1);
  assert.deepEqual(rememberedPinotWords, ["lexique"]);
  start("third");
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.presenterInterventions.linguist.nick, "Bernard Pinot");
  start("fourth");
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.resultWordPresentation.botKey, "linguist", "repeat-only grids fall back to Pinot");
  context.scheduleAmbientRoundEndBots(room, []);
  assert.equal(messages.length, 0);
  for (const [type, word] of [["target_long", "alpha"], ["target_score", "beta"]]) {
    start(`target-${type}`, type);
    assert.equal(room.currentRound.presenterInterventions.humorist, undefined, "no target intervention is revealed while playing");
    await context.prepareResultsWordPresentation(room);
    const etymology = room.currentRound.presenterInterventions.linguist;
    assert.equal(etymology.text, "CIBLE — Étymologie : Du mot ancien de test.");
    assert.equal(room.currentRound.presenterInterventions.humorist, undefined);
    assert.equal(room.currentRound.resultWordPresentation.botKey, "linguist");
    assert.equal(presenter.snapshot().nextBotKey, "humorist");
    context.scheduleAmbientRoundEndBots(room, [], { word: "cible" });
    assert.equal(room.currentRound.presenterInterventions.linguist, etymology, "target fallback does not duplicate the intervention");
    start(`after-${type}`, "normal", word);
    await context.prepareResultsWordPresentation(room);
    assert.equal(room.currentRound.presenterInterventions.humorist.nick, "Laurent Bafouille");
    assert.equal(room.currentRound.presenterInterventions.linguist, undefined);
    start(`resume-${type}`);
    await context.prepareResultsWordPresentation(room);
    assert.equal(room.currentRound.presenterInterventions.linguist.nick, "Bernard Pinot");
  }
  start("bafouille-before-massive", "normal", "gamma");
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.presenterInterventions.humorist.nick, "Laurent Bafouille");
  pinotAvailable = false;
  start("massive-without-pinot", "massive_boggle", "delta");
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.presenterInterventions.humorist?.nick, "Laurent Bafouille",
    "when Pinot has no fact, Bafouille's eligible word must reach the results payload");
  assert.equal(room.currentRound.presenterInterventions.linguist, undefined);
  assert.equal(room.currentRound.resultWordPresentation.frequency.mode, "massive_boggle");
  assert.equal(presenter.snapshot().nextBotKey, "linguist");
  context.scheduleAmbientRoundEndBots(room, []);
  const controller = createPresenterHintsController({ storage: null });
  controller.setScope(room.currentRound.id, "results");
  controller.hydrateInterventions(Object.values(room.currentRound.presenterInterventions));
  assert.equal(controller.getSnapshot().entries.pivot.hasHint, true, "the results button is available");
  assert.equal(controller.getSnapshot().entries.pivot.presenterKey, "bafouille");
  assert.equal(controller.request("pivot"), true);
  const beforeEmpty = presenter.snapshot();
  start("both-exhausted", "massive_boggle", "delta");
  await context.prepareResultsWordPresentation(room);
  assert.equal(room.currentRound.resultWordPresentation, null);
  assert.equal(Object.values(room.currentRound.presenterInterventions).length, 0);
  assert.deepEqual(presenter.snapshot(), beforeEmpty);
  context.scheduleAmbientRoundEndBots(room, []);
  assert.equal(messages.length, 0);
});
