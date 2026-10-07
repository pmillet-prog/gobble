"""Build a reproducible paired QCM sample from an actually generated candidate lot.

Offline only. Reads dictionary snapshots; does not import or start Gobble.
The Lexique frequency file must be downloaded beforehand (see --help).
"""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import random
import re
import sqlite3
import unicodedata

from rare_quiz_spellings import spelling_candidates


ROOT = Path(__file__).resolve().parents[1]
BUCKETS = {"very_rare", "extreme", "never_found"}
POS = {"nom", "verbe", "adjectif", "adverbe"}
STOPWORDS = set("avec dans pour dont elle elles lui leur leurs une des les aux est sont qui que par sur sous sans entre comme plus moins cette cet ces ses son sa ou et en du de la le un au se ne ce il on d l a s".split())
CROSS_REFERENCE = re.compile(
    r"^(synonyme|variante|graphie|orthographe|ancienne orthographe|autre nom|"
    r"feminin|masculin|pluriel|singulier|premiere personne|deuxieme personne|"
    r"troisieme personne|participe|forme|flexion|diminutif|augmentatif|voir)\b"
)
PROPER_NAME = re.compile(r"\b(noms? propres?|patronymes?|prenoms?|gentiles?|toponymes?|sigles?|acronymes?|commune francaise)\b")


def normalize(text):
    text = str(text).lower().replace("œ", "oe").replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))


def key(text):
    return re.sub(r"[^a-z]", "", normalize(text))


def tokens(text):
    return set(re.findall(r"[a-z]+", normalize(text))) - STOPWORDS


def rng_for(seed, label):
    return random.Random(hashlib.sha256(f"{seed}:{label}".encode()).digest())


def readonly_database(path):
    # Treat the local files as immutable snapshots, without creating WAL/SHM.
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro&immutable=1", uri=True)


def load_frequencies(path):
    frequencies = {}
    known = set()
    with path.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            frequency = max(float(row[name] or 0) for name in (
                "freqlemfilms2", "freqlemlivres", "freqfilms2", "freqlivres"
            ))
            for word in (row["ortho"], row["lemme"]):
                normalized = key(word)
                known.add(normalized)
                frequencies[normalized] = max(frequencies.get(normalized, 0), frequency)
    return frequencies, known


def usable_definition(text, answer):
    text = " ".join(text.split())
    normalized = normalize(text)
    if not 35 <= len(text) <= 160 or not 5 <= len(re.findall(r"\w+", text)) <= 27:
        return False
    if CROSS_REFERENCE.search(normalized) or PROPER_NAME.search(normalized):
        return False
    if any(marker in text for marker in ("http", "{{", "}}", "[", "]", "…")):
        return False
    # Extracted formulas/units can lose superscript exponents. Reject all
    # numerical definitions uniformly rather than repairing individual draws.
    if re.search(r"\d|[=<>]", text):
        return False
    # Do not truncate definitions or select an answer disclosed by its own stem.
    if answer in key(text):
        return False
    if len(answer) >= 7 and answer[:min(len(answer) - 2, 7)] in key(text):
        return False
    return True


def load_entries(frequencies, known, max_frequency, counters):
    with readonly_database(ROOT / "data/word-rarity.sqlite") as database:
        rarity = {key(word): bucket for word, bucket in database.execute(
            "SELECT word, rarity_bucket FROM word_rarity"
        )}
    known.update(key(word) for word in (ROOT / "public/dico.txt").read_text(encoding="utf-8-sig").splitlines())
    entries = []
    with readonly_database(ROOT / "data/definitions-fr.sqlite") as database:
        database.row_factory = sqlite3.Row
        for row in database.execute("SELECT * FROM definitions ORDER BY key"):
            answer = unicodedata.normalize("NFC", row["title"].strip())
            normalized = key(answer)
            known.update((normalized, key(row["key"]), key(row["word"])))
            counters["definitionsScanned"] += 1
            if row["is_form_of"] or row["form_of"]:
                counters["inflectionOrVariant"] += 1
                continue
            if not answer.isalpha() or answer != answer.lower() or not 6 <= len(normalized) <= 14:
                counters["wordShape"] += 1
                continue
            bucket = rarity.get(normalized)
            if bucket not in BUCKETS:
                counters["gameRarity"] += 1
                continue
            frequency = frequencies.get(normalized)
            if frequency is not None and frequency > max_frequency:
                counters["corpusTooFrequent"] += 1
                continue
            parts = json.loads(row["part_of_speech_json"])
            if len(parts) != 1 or parts[0] not in POS:
                counters["ambiguousPartOfSpeech"] += 1
                continue
            categories = " ".join(json.loads(row["categories_json"]))
            if PROPER_NAME.search(normalize(categories)):
                counters["properName"] += 1
                continue
            definitions = list(dict.fromkeys([row["definition"], *json.loads(row["definitions_json"])]))
            definition = next((" ".join(text.split()) for text in definitions
                               if usable_definition(text, normalized)), None)
            if not definition:
                counters["noShortSelfContainedDefinition"] += 1
                continue
            relations = json.loads(row["semantic_relations_json"])
            entries.append({
                "key": normalized, "answer": answer, "definition": definition,
                "definitions": definitions, "definitionKeys": {key(text) for text in definitions},
                "tokens": tokens(definition), "partOfSpeech": parts[0], "rarityBucket": bucket,
                "frequency": frequency, "domains": set(json.loads(row["lexical_domains_json"])),
                "relations": {key(word) for words in relations.values() for word in words},
                "sourceUrl": row["source_url"], "sourceLicense": row["source_license"],
            })
    known.discard("")
    return entries


def allowed_pair(left, right):
    a, b = left["key"], right["key"]
    if a == b or a in b or b in a or a[:5] == b[:5]:
        return False
    if a in right["relations"] or b in left["relations"]:
        return False
    if b in key(left["definition"]) or a in key(right["definition"]):
        return False
    if left["definitionKeys"] & right["definitionKeys"]:
        return False
    intersection = len(left["tokens"] & right["tokens"])
    union = len(left["tokens"] | right["tokens"])
    return intersection / max(1, union) < 0.5


def choose_words(target, by_pos, by_domain, seed):
    rng = rng_for(seed, "words:" + target["key"])
    pool = {}
    for domain in sorted(target["domains"]):
        candidates = by_domain.get((target["partOfSpeech"], domain), [])
        for candidate in rng.sample(candidates, min(160, len(candidates))):
            pool[candidate["key"]] = candidate
    fallback = by_pos[target["partOfSpeech"]]
    for candidate in rng.sample(fallback, min(200, len(fallback))):
        pool[candidate["key"]] = candidate
    ranked = list(pool.values())
    rng.shuffle(ranked)
    # Same domain where available; similar length. No editorial intervention.
    ranked.sort(key=lambda candidate: (
        -len(target["domains"] & candidate["domains"]),
        abs(len(target["key"]) - len(candidate["key"]))
    ))
    chosen = [target]
    for candidate in ranked:
        if abs(len(candidate["key"]) - len(target["key"])) > 3:
            continue
        if all(allowed_pair(candidate, previous) for previous in chosen):
            chosen.append(candidate)
            if len(chosen) == 4:
                rng.shuffle(chosen)
                return chosen
    return None


def histogram(questions, name):
    return dict(sorted(Counter(question[name] for question in questions).items()))


def validate(questions, known):
    assert len({question["id"] for question in questions}) == len(questions)
    assert len({key(question["definition"]) for question in questions}) == len(questions)
    for question in questions:
        for mode in ("words", "spellings"):
            options = question[mode]
            assert len(options) == len(set(map(key, options))) == 4
            assert options.count(question["answer"]) == 1
        assert all(key(word) in known for word in question["words"])
        assert all(key(word) not in known for word in question["spellings"] if word != question["answer"])


def text_sample(questions, mode):
    title = "QUATRE MOTS" if mode == "words" else "QUATRE GRAPHIES"
    lines = [title, "Même tirage de 50 définitions pour les deux formules. Aucune sélection manuelle.", ""]
    for number, question in enumerate(questions, 1):
        lines.extend([f"{number:02d}. {question['definition']}", *[
            f"    {letter}. {word}" for letter, word in zip("ABCD", question[mode])
        ], ""])
    lines.extend(["CORRIGÉ", ""])
    for number, question in enumerate(questions, 1):
        letter = "ABCD"[question[mode].index(question["answer"])]
        lines.append(f"{number:02d}. {letter} — {question['answer']} — {question['sourceUrl']}")
    lines.extend(["", "Définitions : Wiktionnaire, sources individuelles ci-dessus, licence CC BY-SA / GFDL.",
                  "Fréquences : Lexique 3.83, Boris New et Christophe Pallier, CC BY-SA 4.0."])
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lexique", type=Path, default=ROOT / ".tmp/rare-quiz-sources/Lexique383.tsv",
                        help="https://www.lexique.org/databases/Lexique383/Lexique383.tsv")
    parser.add_argument("--seed", default="gobble-rare-qcm-20261006-v1")
    parser.add_argument("--candidates", type=int, default=10000)
    parser.add_argument("--sample-size", type=int, default=50)
    parser.add_argument("--max-frequency", type=float, default=0.05)
    parser.add_argument("--output", type=Path, default=ROOT / "dev/rare-quiz-samples")
    args = parser.parse_args()
    if not 0 < args.sample_size <= args.candidates or args.max_frequency < 0:
        parser.error("Require 0 < sample-size <= candidates and max-frequency >= 0")
    counters = Counter()
    frequencies, known = load_frequencies(args.lexique)
    entries = load_entries(frequencies, known, args.max_frequency, counters)
    print(f"Lexically filtered entries: {len(entries)}", flush=True)
    by_pos, by_domain = defaultdict(list), defaultdict(list)
    for entry in entries:
        by_pos[entry["partOfSpeech"]].append(entry)
        for domain in sorted(entry["domains"]):
            by_domain[entry["partOfSpeech"], domain].append(entry)
    targets = entries.copy()
    rng_for(args.seed, "candidate-order").shuffle(targets)
    questions, seen_definitions = [], set()
    for target in targets:
        counters["targetsAttempted"] += 1
        definition_key = key(target["definition"])
        if definition_key in seen_definitions:
            counters["duplicateDefinition"] += 1
            continue
        variants = []
        variant_keys = set()
        for variant in spelling_candidates(target["answer"]):
            normalized = key(variant["word"])
            if normalized in known:
                counters["spellingCollisionWithKnownWord"] += 1
            elif normalized not in variant_keys:
                variant_keys.add(normalized)
                variants.append(variant)
        if len(variants) < 3:
            counters["fewerThanThreeFalseSpellings"] += 1
            continue
        spelling_rng = rng_for(args.seed, "spellings:" + target["key"])
        selected_variants = spelling_rng.sample(variants, 3)
        spelling_options = [target["answer"], *[variant["word"] for variant in selected_variants]]
        spelling_rng.shuffle(spelling_options)
        word_options = choose_words(target, by_pos, by_domain, args.seed)
        if not word_options:
            counters["fewerThanThreeWordDistractors"] += 1
            continue
        questions.append({
            "id": target["key"], "definition": target["definition"], "answer": target["answer"],
            "partOfSpeech": target["partOfSpeech"], "rarityBucket": target["rarityBucket"],
            "sourceUrl": target["sourceUrl"], "sourceLicense": target["sourceLicense"],
            "corpusFrequencyPerMillion": target["frequency"],
            "words": [entry["answer"] for entry in word_options], "spellings": spelling_options,
            "spellingRules": selected_variants,
            "wordSources": [{"word": entry["answer"], "sourceUrl": entry["sourceUrl"],
                             "definition": entry["definition"],
                             "corpusFrequencyPerMillion": entry["frequency"]} for entry in word_options],
            "sameDomainDistractors": sum(bool(entry["domains"] & target["domains"]) for entry in word_options
                                         if entry["key"] != target["key"]),
        })
        seen_definitions.add(definition_key)
        if len(questions) % 2000 == 0:
            print(f"Generated paired candidates: {len(questions)}", flush=True)
        if len(questions) >= args.candidates:
            break
    if len(questions) < args.sample_size:
        raise RuntimeError(f"Only {len(questions)} paired questions, cannot sample {args.sample_size}.")
    validate(questions, known)
    sample = rng_for(args.seed, "sample").sample(questions, args.sample_size)
    report = {
        "seed": args.seed, "protocolVersion": 2, "requestedCandidates": args.candidates, "generatedCandidates": len(questions),
        "sampleSize": len(sample), "eligibleLexicalEntries": len(entries), "knownWordKeys": len(known),
        "maxCorpusFrequencyPerMillion": args.max_frequency, "counters": dict(counters),
        "candidatePartsOfSpeech": histogram(questions, "partOfSpeech"),
        "samplePartsOfSpeech": histogram(sample, "partOfSpeech"),
        "candidateRarityBuckets": histogram(questions, "rarityBucket"),
        "sampleRarityBuckets": histogram(sample, "rarityBucket"),
        "candidatesAbsentFromLexique": sum(q["corpusFrequencyPerMillion"] is None for q in questions),
        "sampleAbsentFromLexique": sum(q["corpusFrequencyPerMillion"] is None for q in sample),
        "candidateSameDomainDistractors": histogram(questions, "sameDomainDistractors"),
        "sampleSameDomainDistractors": histogram(sample, "sameDomainDistractors"),
        "answerPositions": {mode: dict(Counter("ABCD"[q[mode].index(q["answer"])] for q in sample))
                            for mode in ("words", "spellings")},
        "lexique": {"url": "https://www.lexique.org/databases/Lexique383/Lexique383.tsv",
                    "documentation": "https://openlexicon.fr/datasets-info/Lexique383/README-Lexique.html",
                    "authors": "Boris New et Christophe Pallier", "license": "CC BY-SA 4.0",
                    "sha256": hashlib.sha256(args.lexique.read_bytes()).hexdigest()},
        "rules": [
            "Snapshot local Wiktionnaire, lemmes 6–14 lettres, une seule nature parmi nom/verbe/adjectif/adverbe.",
            "Classes Gobble very_rare/extreme/never_found, puis filtre Lexique sur fréquence maximale mot/lemme, livres/films.",
            "Absence dans Lexique admise comme signal imparfait, jamais assimilée à une fréquence zéro mesurée.",
            "Première définition admissible entière : 35–160 caractères, 5–27 mots, sans chiffres/formules, renvoi ni réponse/racine dévoilée.",
            "Distracteurs réels : même nature, longueur à ±3, priorité aux domaines communs; relations connues et définitions proches exclues.",
            "Graphies : une mutation, aucune différence d'accent seule, rejet de toute forme connue dans les trois sources.",
            "Cibles mélangées par graine, sans classement qualitatif; conserver les premiers candidats compatibles avec les deux formules.",
            "50 cibles tirées uniformément sans remise du lot généré, même définition pour les deux modes, aucune retouche individuelle.",
        ],
        "limitations": [
            "Corpus ancien et incomplet : l'absence de Lexique ne prouve pas qu'un mot soit très rare ou inconnu des joueurs.",
            "Les relations et domaines sont agrégés par entrée; les filtres ne prouvent pas l'unicité sémantique des réponses.",
            "Une graphie absente des sources peut exister ailleurs; plausibilité et difficulté des mutations restent à évaluer.",
            "Le tirage représente ce générateur et ses filtres, pas l'ensemble des mots rares; l'intersection favorise les mots mutables.",
            "Relire les deux modes sur les mêmes cibles aide la comparaison éditoriale mais biaise les temps si la réponse est mémorisée.",
            "Aucun barème ni délai de jeu simulé; échantillon de contenu uniquement, sans intégration au mini-jeu.",
        ],
        "protocolRevision": "Premier lot non livré : seuil 0,5/million trop permissif et exposants perdus dans certaines unités. Règles uniformes resserrées à 0,05, définitions chiffrées rejetées, longueur maximale portée de 13 à 14. Même graine, aucun remplacement individuel.",
        "validation": "4 choix distincts, une réponse attendue, vraies réponses présentes et fausses graphies absentes des sources, définitions uniques : vérifié sur tout le lot.",
    }
    payload = {"seed": args.seed, "generatedAt": datetime.now(timezone.utc).isoformat(),
               "report": report, "questions": sample}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "sample.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for mode, filename in (("words", "50-mots.txt"), ("spellings", "50-graphies.txt")):
        (args.output / filename).write_text(text_sample(sample, mode), encoding="utf-8")
    template = (ROOT / "dev/rare-quiz-samples/template.html").read_text(encoding="utf-8")
    embedded = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    (args.output / "index.html").write_text(template.replace("__QUIZ_DATA__", embedded), encoding="utf-8")
    lot_path = ROOT / ".tmp/rare-quiz-samples/candidates.jsonl"
    lot_path.parent.mkdir(parents=True, exist_ok=True)
    with lot_path.open("w", encoding="utf-8") as stream:
        for question in questions:
            stream.write(json.dumps(question, ensure_ascii=False) + "\n")
    print(json.dumps({"generatedCandidates": len(questions), "sampleSize": len(sample),
                      "output": str(args.output), "rejections": dict(counters)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
