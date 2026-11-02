"""Validation tests for the quiz question pools (src/data/*.json).

These pin, in code, the invariants the quiz was previously verified
against by hand after every edit: option sets are unique and contain
the answer exactly once, Hard fragments are at most 2 lines, reverse
rounds have exactly one matching candidate, Expert two-stage languages
belong to their declared family, the discrimination pool pairs each
target with a genuine lookalike at comparable scale, and every pool
is at least as large as the number of rounds a run draws from it
(the draws themselves are read out of buildOrder() in src/quiz.js,
so a draw change without a pool change fails here).

Run:  python3 -m unittest discover -s tests
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    return json.loads((ROOT / "src/data" / name).read_text(encoding="utf-8"))


NORMAL = load("normal.json")
HARD = load("hard.json")
EXPERT = load("expert.json")
COMMANDS = load("commands.json")
QUIZ_JS = (ROOT / "src/quiz.js").read_text(encoding="utf-8")

# Draw counts per pool variable, as used by buildOrder() in src/quiz.js.
DRAWS = {
    m.group(1): int(m.group(2))
    for m in re.finditer(r"drawFrom\((\w+),\s*(\d+)", QUIZ_JS)
}
EXPECTED_DRAWS = {"all": 12, "f": 6, "r": 3, "t": 6, "ei": 6, "eo": 3, "et": 3}

# The discrimination phase draws through drawDisc(), not drawFrom():
# an entry consumes both of its languages, so it needs its own picker.
DISC_DRAW = int(re.search(r"drawDisc\(ed,\s*(\d+)", QUIZ_JS).group(1))


class TestDrawCounts(unittest.TestCase):
    def test_draw_counts_match_build_order(self):
        self.assertEqual(DRAWS, EXPECTED_DRAWS)

    def test_discrimination_draw_is_three(self):
        self.assertEqual(DISC_DRAW, 3)


class TestNormal(unittest.TestCase):
    def test_languages_unique(self):
        langs = [q["lang"] for q in NORMAL["QUESTIONS"]]
        self.assertEqual(len(langs), len(set(langs)))

    def test_distractors(self):
        langs = {q["lang"] for q in NORMAL["QUESTIONS"]}
        self.assertEqual(set(NORMAL["DISTRACTORS"]), langs)
        for lang, distractors in NORMAL["DISTRACTORS"].items():
            self.assertEqual(len(distractors), 3, lang)
            self.assertEqual(len(set(distractors)), 3, lang)
            self.assertNotIn(lang, distractors, lang)

    def test_every_question_has_a_caption(self):
        for q in NORMAL["QUESTIONS"]:
            self.assertIn(q["lang"], NORMAL["SUBS"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(NORMAL["QUESTIONS"]), DRAWS["all"])


class TestHardFragments(unittest.TestCase):
    def test_fragments(self):
        for q in HARD["HARD_FRAGMENTS"]:
            self.assertEqual(q["kind"], "fragment", q["lang"])
            self.assertTrue(q["family"], q["lang"])
            self.assertLessEqual(len(q["code"].split("\n")), 2, q["lang"])
            self.assertEqual(len(q["options"]), 4, q["lang"])
            self.assertEqual(len(set(q["options"])), 4, q["lang"])
            self.assertEqual(q["options"].count(q["lang"]), 1, q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(HARD["HARD_FRAGMENTS"]), DRAWS["f"])


class TestHardReverse(unittest.TestCase):
    def test_reverse_rounds(self):
        for q in HARD["HARD_REVERSE"]:
            self.assertEqual(q["kind"], "reverse", q["lang"])
            langs = [s["lang"] for s in q["snippets"]]
            self.assertEqual(len(langs), 4, q["lang"])
            self.assertEqual(len(set(langs)), 4, q["lang"])
            self.assertEqual(langs.count(q["lang"]), 1, q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(HARD["HARD_REVERSE"]), DRAWS["r"])


class TestHardWide(unittest.TestCase):
    def test_wide_rounds(self):
        for q in HARD["HARD_WIDE"]:
            self.assertEqual(q["kind"], "wide", q["lang"])
            self.assertTrue(q["family"], q["lang"])
            self.assertEqual(len(q["options"]), 8, q["lang"])
            self.assertEqual(len(set(q["options"])), 8, q["lang"])
            self.assertEqual(q["options"].count(q["lang"]), 1, q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(HARD["HARD_WIDE"]), DRAWS["t"])


class TestExpertId(unittest.TestCase):
    def test_identification_rounds(self):
        # The entry's own `family` field declares the family its option
        # set is drawn from. (EXPERT_FAMILIES is the two-stage pool's
        # stage-1 map only — it is not a taxonomy for this pool, and
        # must not be cross-checked here: e.g. Whitespace is an ID
        # entry under "Tape & bit cells" but is not in that stage-1
        # list.)
        for q in EXPERT["EXPERT_ID"]:
            self.assertEqual(q["kind"], "expert-id", q["lang"])
            self.assertTrue(q["family"], q["lang"])
            self.assertEqual(len(q["options"]), 8, q["lang"])
            self.assertEqual(len(set(q["options"])), 8, q["lang"])
            self.assertEqual(q["options"].count(q["lang"]), 1, q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(EXPERT["EXPERT_ID"]), DRAWS["ei"])


class TestExpertOdd(unittest.TestCase):
    def test_odd_one_out(self):
        for q in EXPERT["EXPERT_ODD"]:
            self.assertEqual(q["kind"], "expert-odd", q["lang"])
            langs = [s["lang"] for s in q["snippets"]]
            self.assertEqual(len(langs), 4, q["lang"])
            self.assertEqual(len(set(langs)), 4, q["lang"])
            self.assertEqual(langs.count(q["lang"]), 1, q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(EXPERT["EXPERT_ODD"]), DRAWS["eo"])


class TestExpertTwo(unittest.TestCase):
    def test_language_belongs_to_declared_family(self):
        families = EXPERT["EXPERT_FAMILIES"]
        for q in EXPERT["EXPERT_TWO"]:
            self.assertEqual(q["kind"], "expert-two", q["lang"])
            self.assertIn(q["family"], families, q["lang"])
            self.assertIn(q["lang"], families[q["family"]], q["lang"])

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(EXPERT["EXPERT_TWO"]), DRAWS["et"])


def _pool_languages():
    """Every language the quiz's data pools already use — entry
    languages and snippet languages across all four data files.
    Discrimination introduces no new languages: a target or decoy
    outside this set would be a language the quiz nowhere else knows
    (and Study could not be consistent with)."""
    langs = {q["lang"] for q in NORMAL["QUESTIONS"]}
    langs |= {c["lang"] for c in COMMANDS["COMMANDS"]}
    for pool in HARD.values():
        for q in pool:
            langs.add(q["lang"])
            langs |= {s["lang"] for s in q.get("snippets", [])}
    for key in ("EXPERT_ID", "EXPERT_TWO", "EXPERT_ODD"):
        for q in EXPERT[key]:
            langs.add(q["lang"])
            langs |= {s["lang"] for s in q.get("snippets", [])}
    return langs


POOL_LANGUAGES = _pool_languages()

# Confusable pairs that no EXPERT_FAMILIES family covers, pinned
# explicitly with their shared surface class. Every other
# discrimination pair must share at least one declared family.
SURFACE_PAIRS = {
    frozenset(("Chef", "Shakespeare Programming Language")),  # prose joke languages
    frozenset(("Piet", "Velato")),                            # art/media source languages
    frozenset(("COW", "Blub")),                               # one-word Brainfuck re-encodings
    frozenset(("Chicken", "Blub")),                           # one-word vocabularies
}


class TestExpertDisc(unittest.TestCase):
    """Discrimination rounds (replacing pairing): "Which excerpt is
    X?" — one excerpt in the target language, one in its closest
    lookalike, both genuine Hello World code harvested from the
    pools. The old same-pair failure mode (two excerpts so alike the
    call was a texture match — one Fractran excerpt literally
    contained the other) is pinned out by the scale/substring test."""

    def test_no_pairing_pool_remains(self):
        self.assertNotIn("EXPERT_PAIR", EXPERT)

    def test_discrimination_rounds(self):
        self.assertEqual(len(EXPERT["EXPERT_DISC"]), 16)
        for q in EXPERT["EXPERT_DISC"]:
            self.assertEqual(q["kind"], "expert-disc", q["lang"])
            for field in ("lang", "decoy", "code", "codeTarget",
                          "codeDecoy", "note", "fact"):
                self.assertTrue(q[field].strip(),
                                f"{q['lang']}: empty {field}")

    def test_targets_distinct_and_decoy_differs(self):
        targets = [q["lang"] for q in EXPERT["EXPERT_DISC"]]
        self.assertEqual(len(targets), len(set(targets)))
        for q in EXPERT["EXPERT_DISC"]:
            self.assertNotEqual(q["lang"], q["decoy"], q["lang"])

    def test_languages_come_from_the_existing_pools(self):
        for q in EXPERT["EXPERT_DISC"]:
            self.assertIn(q["lang"], POOL_LANGUAGES, q["lang"])
            self.assertIn(q["decoy"], POOL_LANGUAGES, q["decoy"])

    def test_excerpts_are_comparable_in_scale(self):
        for q in EXPERT["EXPERT_DISC"]:
            a, b = q["codeTarget"], q["codeDecoy"]
            self.assertNotEqual(a, b, q["lang"])
            self.assertNotIn(a, b, q["lang"])
            self.assertNotIn(b, a, q["lang"])
            ratio = max(len(a), len(b)) / min(len(a), len(b))
            self.assertLessEqual(ratio, 2.5,
                                 f"{q['lang']}: excerpt ratio {ratio:.2f}")

    def test_decoy_is_a_genuine_confusable(self):
        families = EXPERT["EXPERT_FAMILIES"].values()
        for q in EXPERT["EXPERT_DISC"]:
            pair = {q["lang"], q["decoy"]}
            shares_family = any(pair <= set(members) for members in families)
            self.assertTrue(
                shares_family or frozenset(pair) in SURFACE_PAIRS,
                f"{q['lang']} vs {q['decoy']}: neither family nor "
                "pinned surface class makes them confusable")

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(EXPERT["EXPERT_DISC"]), DISC_DRAW)


class TestCommands(unittest.TestCase):
    """Commands mode data (src/data/commands.json): 80 commands over
    10 languages. There are NO stored distractors: a meaning round's
    options are assembled at draw time from the verbatim effects of
    sibling commands in the same language (see pickCommands() in
    src/quiz.js — three blind options-only tests showed any option
    set with exactly one true statement is expert-solvable, so every
    option is now a true statement). What the data must therefore
    guarantee is: no `distractors` field, effects unique within each
    language (option distinctness depends on it), and every language
    pool at the feasibility floor for the draw (pool − 3 max drawn
    ≥ 3 distractor siblings). The old stored-distractor pins (option
    distinctness, the verbatim ban, and the length/punctuation
    fairness bands) are gone with the field they measured — surface
    fairness is no longer a data property, and the blind options-only
    test is its arbiter now."""

    LANG_COUNTS = {"Brainfuck": 8, "COW": 8, "Ook!": 8, "Befunge": 12,
                   "Whitespace": 8, "FALSE": 8, "SNUSP": 8, "><>": 6,
                   "Brainbool": 8, "INTERCAL": 6}

    def _by_lang(self):
        grouped = {}
        for c in COMMANDS["COMMANDS"]:
            grouped.setdefault(c["lang"], []).append(c)
        return grouped

    def test_pool_total_and_language_counts(self):
        self.assertEqual(len(COMMANDS["COMMANDS"]), 80)
        self.assertEqual(
            {lang: len(cs) for lang, cs in self._by_lang().items()},
            self.LANG_COUNTS)

    def test_entry_shape(self):
        for c in COMMANDS["COMMANDS"]:
            self.assertEqual(c["kind"], "command", c["symbol"])
            for field in ("lang", "symbol", "effect", "short", "ask",
                          "weakHint", "fact", "note"):
                self.assertTrue(c[field].strip(),
                                f"{c['lang']} {c['symbol']}: empty {field}")

    def test_no_distractors_field(self):
        # Options are assembled at draw time from sibling effects;
        # a stored distractor field must not creep back in.
        for c in COMMANDS["COMMANDS"]:
            self.assertNotIn("distractors", c,
                             f"{c['lang']} {c['symbol']}")

    def test_symbols_unique_per_language(self):
        for lang, cs in self._by_lang().items():
            syms = [c["symbol"] for c in cs]
            self.assertEqual(len(syms), len(set(syms)), lang)

    def test_effects_unique_per_language(self):
        # A meaning round's options are the asked effect plus three
        # sibling effects; if two commands in a language shared an
        # effect string, a round could show the same option twice (or
        # a distractor identical to the answer).
        for lang, cs in self._by_lang().items():
            effects = [c["effect"] for c in cs]
            self.assertEqual(len(effects), len(set(effects)),
                             f"{lang}: two commands share an effect string")

    def test_reverse_rounds_feasible(self):
        # A reverse round needs the correct symbol plus 3 siblings.
        for lang, cs in self._by_lang().items():
            self.assertGreaterEqual(len(cs), 4, lang)

    def test_language_pools_meet_the_sibling_floor(self):
        # Draw-time option assembly takes 3 distractor siblings from
        # the asked command's language, excluding every command in
        # the run — and a run holds at most 3 commands per language
        # (the pickCommands cap). So each pool needs at least
        # 3 drawn + 3 siblings = 6 commands, or some run could not
        # assemble a meaning round without leaking a run-mate's
        # effect into the options.
        for lang, cs in self._by_lang().items():
            self.assertGreaterEqual(len(cs), 6, lang)

    def test_ask_phrases_unique_per_language(self):
        # The ask phrase IS the reverse question; if two commands in a
        # language shared one, the round would have two right answers.
        # (Brainbool's + and - both toggle — their asks differ by the
        # operation, adding vs subtracting modulo 2.)
        for lang, cs in self._by_lang().items():
            asks = [c["ask"] for c in cs]
            self.assertEqual(len(asks), len(set(asks)), lang)


if __name__ == "__main__":
    unittest.main()
