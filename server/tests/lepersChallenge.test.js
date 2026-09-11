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
