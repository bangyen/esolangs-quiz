"""Validation tests for the quiz question pools (src/data/*.json).

These pin, in code, the invariants the quiz was previously verified
against by hand after every edit: option sets are unique and contain
the answer exactly once, Hard fragments are at most 2 lines, reverse
rounds have exactly one matching candidate, Expert two-stage languages
belong to their declared family, the pairing pool is evenly split,
and every pool is at least as large as the number of rounds a run
draws from it (the draws themselves are read out of buildOrder() in
src/quiz.js, so a draw change without a pool change fails here).

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
EXPECTED_DRAWS = {"all": 12, "f": 6, "r": 3, "t": 6, "ei": 6, "eo": 3, "et": 3, "ep": 3}


class TestDrawCounts(unittest.TestCase):
    def test_draw_counts_match_build_order(self):
        self.assertEqual(DRAWS, EXPECTED_DRAWS)


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


class TestExpertPair(unittest.TestCase):
    def test_pairing_rounds(self):
        for q in EXPERT["EXPERT_PAIR"]:
            self.assertEqual(q["kind"], "expert-pair", q["pairLabel"])
            self.assertIsInstance(q["same"], bool, q["pairLabel"])
            self.assertEqual(q["same"], q["langA"] == q["langB"], q["pairLabel"])

    def test_different_entries_have_second_language_options(self):
        # A correct "Different" call now leads to stage 2: name the
        # second excerpt. Each different entry must therefore carry
        # exactly 4 unique name options, excerpt B's language among
        # them exactly once, the other three being distractors.
        for q in EXPERT["EXPERT_PAIR"]:
            if q["same"]:
                continue
            self.assertIn("options", q, q["pairLabel"])
            self.assertEqual(len(q["options"]), 4, q["pairLabel"])
            self.assertEqual(len(set(q["options"])), 4, q["pairLabel"])
            self.assertEqual(q["options"].count(q["langB"]), 1, q["pairLabel"])

    def test_same_entries_have_no_options(self):
        # Same pairs complete on the stage-1 call; they need (and must
        # not carry) a stage-2 option list.
        for q in EXPERT["EXPERT_PAIR"]:
            if q["same"]:
                self.assertNotIn("options", q, q["pairLabel"])

    def test_pool_split_evenly(self):
        same = sum(1 for q in EXPERT["EXPERT_PAIR"] if q["same"])
        self.assertEqual(same * 2, len(EXPERT["EXPERT_PAIR"]))

    def test_pool_covers_draw(self):
        self.assertGreaterEqual(len(EXPERT["EXPERT_PAIR"]), DRAWS["ep"])


class TestCommands(unittest.TestCase):
    """Commands mode data (src/data/commands.json): 80 commands over
    10 languages. The distractors carry the difficulty, so they are
    pinned hard: exactly 3 per command, all four options mutually
    distinct, and no distractor verbatim-equal to ANY true effect in
    the same language (a sibling's effect may only appear reworded —
    otherwise a meaning round would have two defensible answers).
    Cross-language equality is deliberate and NOT pinned against:
    Brainfuck vs Brainbool is the built-in same-symbol trap."""

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

    def test_symbols_unique_per_language(self):
        for lang, cs in self._by_lang().items():
            syms = [c["symbol"] for c in cs]
            self.assertEqual(len(syms), len(set(syms)), lang)

    def test_options_distinct_and_unambiguous(self):
        for lang, cs in self._by_lang().items():
            effects = [c["effect"] for c in cs]
            self.assertEqual(len(effects), len(set(effects)),
                             f"{lang}: two commands share an effect string")
            for c in cs:
                self.assertEqual(len(c["distractors"]), 3,
                                 f"{lang} {c['symbol']}")
                options = [c["effect"]] + c["distractors"]
                self.assertEqual(len(set(options)), 4,
                                 f"{lang} {c['symbol']}: options not distinct")
                for d in c["distractors"]:
                    self.assertNotIn(
                        d, effects,
                        f"{lang} {c['symbol']}: distractor is verbatim a "
                        f"same-language effect: {d!r}")

    def test_reverse_rounds_feasible(self):
        # A reverse round needs the correct symbol plus 3 siblings.
        for lang, cs in self._by_lang().items():
            self.assertGreaterEqual(len(cs), 4, lang)

    def test_answer_length_does_not_identify_the_answer(self):
        # Length must not be a tell. The correct effects are precise
        # canonical clauses and the distractors were originally looser
        # paraphrases, which made the right answer the longest option
        # in 51 of 80 questions (64%, vs 25% by chance; Ook! was 8/8).
        # The distractors were rebalanced by lengthening wrong claims
        # with false detail. Pin the distribution with headroom around
        # the rebalanced numbers (strictly longest 18, strictly
        # shortest 17, ranks 18/26/19/17) so a future command cannot
        # silently reintroduce the tell in either direction.
        ranks = {1: 0, 2: 0, 3: 0, 4: 0}
        strictly_longest = strictly_shortest = 0
        per_lang = {}
        for c in COMMANDS["COMMANDS"]:
            effect_len = len(c["effect"])
            distractor_lens = [len(d) for d in c["distractors"]]
            ranks[1 + sum(1 for n in distractor_lens if n > effect_len)] += 1
            entry = per_lang.setdefault(
                c["lang"], {"n": 0, "longest": 0, "shortest": 0})
            entry["n"] += 1
            if all(n < effect_len for n in distractor_lens):
                strictly_longest += 1
                entry["longest"] += 1
            if all(n > effect_len for n in distractor_lens):
                strictly_shortest += 1
                entry["shortest"] += 1
        self.assertGreaterEqual(strictly_longest, 10)
        self.assertLessEqual(strictly_longest, 26)
        self.assertLessEqual(strictly_shortest, 26)
        for rank, count in ranks.items():
            self.assertGreaterEqual(count, 10, f"length rank {rank}")
            self.assertLessEqual(count, 30, f"length rank {rank}")
        for lang, entry in per_lang.items():
            self.assertLessEqual(entry["longest"] * 2, entry["n"],
                                 f"{lang}: answer too often the longest")
            self.assertLessEqual(entry["shortest"] * 2, entry["n"],
                                 f"{lang}: answer too often the shortest")

    def test_punctuation_does_not_identify_the_answer(self):
        # Punctuation register must not be a tell either. The correct
        # effects were written like specifications, while distractors
        # originally used almost none of the same marks: parentheses,
        # em dashes, and semicolons appeared in effects but in zero
        # distractors, and colons in only two. In total, 37 of 80
        # questions had a mark that appeared only in the correct
        # answer. For each mark below, no question may now have that
        # mark in its effect while none of its distractors has it.
        for mark in ("(", "—", ":", ";"):
            offenders = [
                f"{c['lang']} {c['symbol']}"
                for c in COMMANDS["COMMANDS"]
                if mark in c["effect"]
                and not any(mark in d for d in c["distractors"])
            ]
            self.assertEqual(offenders, [],
                             f"{mark!r} appears only in correct answers")

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
