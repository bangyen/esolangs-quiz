"""Validation tests for the quiz question pools (src/data/*.json).

These pin, in code, the invariants the quiz was previously verified
against by hand after every edit: option sets are unique and contain
the answer exactly once, Hard fragments are at most 2 lines, reverse
rounds have exactly one matching candidate, Expert two-stage languages
belong to their declared family, and every pool
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
EXPECTED_DRAWS = {"all": 12, "f": 6, "r": 3, "t": 6, "ei": 6, "eo": 4, "et": 5}


class TestDrawCounts(unittest.TestCase):
    def test_draw_counts_match_build_order(self):
        self.assertEqual(DRAWS, EXPECTED_DRAWS)


class TestExpertPools(unittest.TestCase):
    def test_no_fourth_round_type_pool_remains(self):
        # Pairing and its replacement, discrimination, were both
        # removed: Expert has exactly three round types, so neither
        # pool may creep back into the data.
        self.assertNotIn("EXPERT_PAIR", EXPERT)
        self.assertNotIn("EXPERT_DISC", EXPERT)


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
