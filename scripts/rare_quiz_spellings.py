"""Deterministic, single-edit spelling distractor proposals for French words.

These are proposals, not certified misspellings. The caller must reject every
candidate found in its dictionary (including inflections and accepted variants),
using accent-insensitive comparison, and discard questions with fewer than three
remaining candidates. No arbitrary fallback fills that shortfall.
"""

import re
import unicodedata


_VOWELS = "aàâäeéèêëiîïoôöuùûüyÿœæ"
_CONSONANTS = "bcdfghjklmnpqrstvwxz"
_FRONT_VOWELS = "eéèêëiîïyÿ"

# Lookarounds restrict the context without making it part of the mutation.
# Each match replaces only the indicated grapheme, never the entire word.
_RULES = (
    ("ph_to_f", r"ph", "f"),
    ("th_to_t", r"th", "t"),
    ("rh_to_r", r"rh", "r"),
    ("y_to_i", rf"(?<=[{_CONSONANTS}])y(?=[{_CONSONANTS}])", "i"),
    ("i_to_y", rf"(?<=[{_CONSONANTS}])i(?=[{_CONSONANTS}])", "y"),
    ("f_to_ph", rf"(?<![fp])f(?=[{_VOWELS}])", "ph"),
    # Avoid -tion, -tien, -tial, -tieux and other ti + vowel spellings.
    ("t_to_th", rf"(?<![ts])t(?=[aàâäeéèêëoôöuùûü])", "th"),
    ("initial_r_to_rh", rf"^r(?=[{_VOWELS}])", "rh"),
    ("hard_c_to_k", r"c(?=[aàâäoôöuùûü])", "k"),
    ("hard_c_to_qu", r"(?<!c)c(?=[aàâäoôöuùûü])", "qu"),
    ("qu_to_k", rf"qu(?=[{_VOWELS}])", "k"),
    ("qu_to_c", r"qu(?=[aàâäoôöuùûü])", "c"),
    ("k_to_qu", rf"k(?=[{_FRONT_VOWELS}])", "qu"),
    ("k_to_c", r"k(?=[aàâäoôöuùûü])", "c"),
    ("soft_g_to_j", rf"g(?=[{_FRONT_VOWELS}])", "j"),
    ("j_to_soft_g", rf"j(?=[{_FRONT_VOWELS}])", "g"),
    # Preserve /s/ when c becomes s: intervocalic s would instead suggest /z/.
    ("soft_c_to_ss", rf"(?<=[{_VOWELS}])c(?=[{_FRONT_VOWELS}])", "ss"),
    ("soft_c_to_s", rf"(?<![{_VOWELS}c])c(?=[{_FRONT_VOWELS}])", "s"),
    ("ss_to_soft_c", rf"(?<=[{_VOWELS}])ss(?=[{_FRONT_VOWELS}])", "c"),
    ("s_to_soft_c", rf"(?<![{_VOWELS}s])s(?=[{_FRONT_VOWELS}])", "c"),
    ("s_to_z", rf"(?<=[{_VOWELS}])s(?=[{_VOWELS}])", "z"),
    ("z_to_s", rf"(?<=[{_VOWELS}])z(?=[{_VOWELS}])", "s"),
    ("nasal_m_to_n", rf"(?<=[{_VOWELS}])m(?=[bp])", "n"),
    ("nasal_n_to_m", rf"(?<=[{_VOWELS}])n(?=[bp])", "m"),
    ("ai_to_ei", rf"ai(?=[{_CONSONANTS}].)", "ei"),
    ("ei_to_ai", rf"ei(?=[{_CONSONANTS}].)", "ai"),
    # Internal vowel sequences only; leave endings such as -eau/-eaux alone.
    ("eau_to_au", rf"eau(?=[{_CONSONANTS}].)", "au"),
    ("au_to_o", rf"(?<!e)au(?=[{_CONSONANTS}].)", "o"),
    # Exclude nasal o + m/n and open-syllable words where the analogy is weaker.
    ("o_to_au", r"(?<=[bcdfghjklmpqrstvwxz])o(?=[bcdfgjklpqrstvwxz].)", "au"),
)
_COMPILED_RULES = tuple(
    (name, re.compile(pattern), replacement)
    for name, pattern, replacement in _RULES
)
_DOUBLE_CONSONANT = re.compile(r"([bcdfglmnprstz])\1")
_SINGLE_CONSONANT = re.compile(
    rf"(?<=[{_VOWELS}])([bdfglmnprst])(?=[{_VOWELS}])"
)


def spelling_candidates(word: str) -> list[dict[str, str]]:
    """Return unique nearby forms in stable rule/position order.

    Every result changes one grapheme occurrence in the original word, never a
    preceding proposal. Compound words are left out. Rules describe spelling
    analogies, not a phonetic model; some results remain less plausible than
    others, and short/unusual words may have too few usable alternatives.
    """
    word = unicodedata.normalize("NFC", word)
    if len(word) < 4 or not word.isalpha() or word != word.lower():
        return []

    candidates: list[dict[str, str]] = []
    seen = {word}

    def add(start: int, end: int, replacement: str, rule: str) -> None:
        candidate = word[:start] + replacement + word[end:]
        if candidate not in seen:
            seen.add(candidate)
            candidates.append({"word": candidate, "rule": rule})

    for rule, pattern, replacement in _COMPILED_RULES:
        for match in pattern.finditer(word):
            add(match.start(), match.end(), replacement, rule)

    for match in _DOUBLE_CONSONANT.finditer(word):
        # Do not alter terminal consonants, which may mark inflection.
        if match.end() < len(word):
            add(match.start(), match.end(), match[1], "double_to_single")

    for match in _SINGLE_CONSONANT.finditer(word):
        add(match.start(), match.end(), match[1] * 2, "single_to_double")

    return candidates
