import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLepersInterventionText,
  buildLepersResultIntervention,
  buildLepersSolvedIntervention,
  getLepersBonusForNick,
  isLepersChallengeRound,
  pickLepersTournamentRound,
  pickLepersChallenge,
  pickLepersDefinition,
  rankLepersChallenges,
  selectLepersChallenge,
} from "../bots/lepersChallenge.js";

test("Lepers owns the single odd tournament round selected at tournament creation", () => {
  assert.equal(
    isLepersChallengeRound({ enabled: true, tournamentRound: 1, training: false }),
    true
  );
  assert.equal(
    isLepersChallengeRound({ enabled: true, tournamentRound: 2, training: false }),
    false
  );
  assert.equal(
    isLepersChallengeRound({ enabled: true, tournamentRound: 3, training: true }),
    false
  );
  assert.equal(
    isLepersChallengeRound({ enabled: false, tournamentRound: 5, training: false }),
    false
  );
  assert.equal(pickLepersTournamentRound(() => 0), 1);
  assert.equal(pickLepersTournamentRound(() => 0.5), 3);
  assert.equal(pickLepersTournamentRound(() => 0.999), 5);
});

test("definition filtering rejects forms, cross references and answer spoilers", () => {
  assert.equal(
    pickLepersDefinition(
      { definition: "Pluriel de balustre.", definitions: [], isFormOf: false },
      "balustres"
    ),
    null
  );
  assert.equal(
    pickLepersDefinition(
      { definition: "Minisérie.", definitions: [], isFormOf: false },
      "miniserie"
    ),
    null
  );
  assert.equal(
    pickLepersDefinition(
      {
        definition: "Indicatif présent de jouer à la deuxième personne du pluriel.",
        definitions: [],
        isFormOf: false,
      },
      "jouez"
    ),
    null
  );
  assert.equal(
    pickLepersDefinition(
      {
        definition: "Nom donné à une personne dans une région précise.",
        definitions: [],
        isFormOf: false,
        partOfSpeech: ["nom propre"],
      },
      "exemple"
    ),
    null
  );
  assert.equal(
    pickLepersDefinition(
      {
        definition: "Désigner par connotation.",
        definitions: [
          "Désigner par connotation.",
          "Dépasser la signification conceptuelle d’un mot et lui ajouter un contenu dépendant du contexte.",
        ],
        isFormOf: false,
      },
      "connoter"
    )?.definition,
    "Dépasser la signification conceptuelle d’un mot et lui ajouter un contenu dépendant du contexte."
  );
});

test("the challenge keeps the requested Questions pour un champion phrasing", () => {
  assert.equal(
    buildLepersInterventionText("Personne à qui s’adresse un énoncé.", "nom"),
    "TOP ! Je suis... un nom signifiant personne à qui s’adresse un énoncé. Je suis, JE SUIS... !"
  );
  assert.equal(
    buildLepersInterventionText("Expression employée pour saluer.", "locution verbale"),
    "TOP ! Je suis... une locution verbale signifiant expression employée pour saluer. Je suis, JE SUIS... !"
  );
  assert.equal(
    buildLepersInterventionText("Terme dont la nature est inconnue."),
    "TOP ! Je suis... un mot signifiant terme dont la nature est inconnue. Je suis, JE SUIS... !"
  );
  assert.deepEqual(buildLepersSolvedIntervention("allocutaire"), {
    text: "Bravo ! C'était « ALLOCUTAIRE » !",
    highlights: ["ALLOCUTAIRE"],
  });
  assert.deepEqual(buildLepersResultIntervention("allocutaire"), {
    text: "« ALLOCUTAIRE », bien sûr !",
    highlights: ["ALLOCUTAIRE"],
  });
});

test("selection uses a rare grid word of at least five letters with a substantive definition", async () => {
  const definitions = new Map([
    ["chat", { definition: "Petit mammifère.", isFormOf: false }],
    [
      "allocutaire",
      {
        definition: "Personne à qui s’adresse un énoncé dans une situation de communication.",
        definitions: [],
        isFormOf: false,
        partOfSpeech: ["nom"],
        source: "wiktionary",
      },
    ],
  ]);
  const challenge = await pickLepersChallenge(
    [{ word: "chat" }, { word: "allocutaire" }],
    {
      loadDefinitionEntry: async (word) => definitions.get(word) || null,
      rarityMetaMap: new Map([
        ["chat", { rarityBucket: "rare", rarityScore: 55 }],
        ["allocutaire", { rarityBucket: "very_rare", rarityScore: 70, playersFound: 3 }],
      ]),
      seed: "round-3",
    }
  );

  assert.equal(challenge?.word, "allocutaire");
  assert.equal(
    challenge?.text,
    "TOP ! Je suis... un nom signifiant personne à qui s’adresse un énoncé dans une situation de communication. Je suis, JE SUIS... !"
  );
});

test("every finder receives the independent Lepers tournament bonus", () => {
  const challenge = { foundBy: new Set(["Alice", "Bob"]) };
  assert.equal(getLepersBonusForNick(challenge, "Alice"), 2);
  assert.equal(getLepersBonusForNick(challenge, "Bob"), 2);
  assert.equal(getLepersBonusForNick(challenge, "Chloé"), 0);
});

const clue = "Petit objet utilisé pour maintenir ensemble plusieurs pièces de tissu.";
function questionPool(words, definition = () => clue) {
  return {
    solutions: words.map(word => ({ word })),
    options: {
      seed: "anti-repeat",
      rarityMetaMap: new Map(words.map(word => [word, { rarityBucket: "rare", playersFound: 3 }])),
      loadDefinitionEntry: async word => ({ definition: definition(word), partOfSpeech: ["nom"] }),
    },
  };
}

test("recent words stay excluded even if their definition changes", async () => {
  const { solutions, options } = questionPool(["agrafe"]);
  assert.equal(await pickLepersChallenge(solutions, {
    ...options, recentQuestions: [{ word: "AGRAFE", definition: "Une ancienne définition." }],
  }), null);
});

test("a shared definition cannot return under another answer or typography", async () => {
  const { solutions, options } = questionPool(["epingle"]);
  assert.equal(await pickLepersChallenge(solutions, {
    ...options, recentQuestions: [{ word: "agrafe", definition: "PETIT OBJET utilise pour maintenir ensemble plusieurs pieces de tissu !" }],
  }), null);
});

test("another eligible sense can replace a recently asked definition", async () => {
  const { solutions, options } = questionPool(["epingle"]);
  const alternative = "Objet servant à retenir une coiffure ou à fixer un ornement.";
  const picked = await pickLepersChallenge(solutions, {
    ...options,
    loadDefinitionEntry: async () => ({ definition: clue, definitions: [alternative] }),
    recentQuestions: [{ word: "agrafe", definition: clue }],
  });
  assert.equal(picked?.definition, alternative);
});

test("recent words do not exhaust the 72 lookups before fresh candidates are inspected", async () => {
  const words = Array.from({ length: 73 }, (_, i) => `lexeme${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`);
  const { solutions, options } = questionPool(words,
    word => `Objet utilisé pour garder des pièces ensemble, modèle ${words.indexOf(word)}.`);
  const initial = await rankLepersChallenges(solutions, options);
  assert.equal(initial.length, 72);
  const expected = words.find(word => !initial.some(question => question.word === word));
  const picked = await pickLepersChallenge(solutions, { ...options, recentQuestions: initial });
  assert.equal(picked?.word, expected);
});

test("final selection rechecks the latest history and uses alternatives beyond the first eight", async () => {
  const words = Array.from({ length: 10 }, (_, i) => `lexeme${String.fromCharCode(97 + i)}`);
  const { solutions, options } = questionPool(words,
    word => `Objet utilisé pour garder des pièces ensemble, modèle ${words.indexOf(word)}.`);
  const prepared = await rankLepersChallenges(solutions, options);
  const recentQuestions = prepared.slice(0, 9);
  assert.equal(selectLepersChallenge(prepared, { recentQuestions })?.word, prepared[9].word);
  assert.equal(selectLepersChallenge(prepared, { recentQuestions: prepared }), null);
});
