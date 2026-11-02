"""Regression tests for the live-playtest findings.

1. Scroll on advance: advancing used scrollIntoView() on #quizView while
   the clicked Next button still held focus and render() had just hidden
   it (display:none) — the browser's focus/anchoring reaction cancelled
   the scroll and landed at the document top on tall rounds. These tests
   pin the structural facts behind that diagnosis (the page header is a
   sibling BEFORE #quizView, never inside it; the scroll target holds
   the stats row) and the fixed mechanism (no scrollIntoView anywhere,
   a window.scrollTo to the anchor's measured offset, blur before
   render, overflow-anchor disabled), plus a Node DOM-stub run of the
   real script asserting the actual scroll calls on advance.
2. Initial stats: first load must show exactly what a restart shows —
   question 1, score 0, streak 0, hints 0 — in the static placeholders
   and through the script's init path.
3. Feedback wording: reverse rounds must name the correct candidate's
   position, pairing rounds must name both languages.

Run:  python3 -m unittest discover -s tests
"""
import json
import re
import shutil
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILT = (ROOT / "index.html").read_text(encoding="utf-8")
SCRIPT = re.search(r"<script>(.*?)</script>", BUILT, re.S).group(1)
STYLE = re.search(r"<style>(.*?)</style>", BUILT, re.S).group(1)


class _Tree(HTMLParser):
    """Tiny DOM tree: tag, attrs, children, document-order index."""

    VOID = {"meta", "link", "img", "br", "hr", "input"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "#root", "attrs": {}, "children": [], "order": -1}
        self._stack = [self.root]
        self._counter = 0
        self.flat = []

    def _add(self, tag, attrs):
        node = {"tag": tag, "attrs": dict(attrs), "children": [],
                "order": self._counter}
        self._counter += 1
        self._stack[-1]["children"].append(node)
        self.flat.append(node)
        return node

    def handle_starttag(self, tag, attrs):
        node = self._add(tag, attrs)
        if tag not in self.VOID:
            self._stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self._add(tag, attrs)

    def handle_endtag(self, tag):
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i]["tag"] == tag:
                del self._stack[i:]
                break


def _find(node, pred):
    if pred(node):
        return node
    for child in node["children"]:
        hit = _find(child, pred)
        if hit is not None:
            return hit
    return None


def _contains(ancestor, pred):
    return _find(ancestor, pred) is not None


class TestScrollStructure(unittest.TestCase):
    """The structural property the old bug hid behind: if the scroll
    target contained or preceded the page header, scrolling to it would
    legitimately reveal the header. It must not — the header is a
    sibling before #quizView, and #quizView starts at the stats row."""

    @classmethod
    def setUpClass(cls):
        # Parse only the body markup, not the style/script text.
        body = re.search(r"<body>(.*?)<script>", BUILT, re.S).group(1)
        cls.tree = _Tree()
        cls.tree.feed(body)
        cls.header = _find(cls.tree.root, lambda n: n["attrs"].get("class") == "site-head")
        cls.quiz = _find(cls.tree.root, lambda n: n["attrs"].get("id") == "quizView")

    def test_header_exists_and_quiz_view_exists(self):
        self.assertIsNotNone(self.header)
        self.assertIsNotNone(self.quiz)

    def test_header_is_not_inside_quiz_view(self):
        self.assertFalse(
            _contains(self.quiz, lambda n: n["attrs"].get("class") == "site-head"),
            "page header inside #quizView — scrolling to the quiz view "
            "would reveal the header by construction")

    def test_header_precedes_quiz_view(self):
        self.assertLess(self.header["order"], self.quiz["order"])

    def test_quiz_view_starts_with_stats_row(self):
        self.assertTrue(
            _contains(self.quiz, lambda n: n["attrs"].get("id") == "statQ"),
            "#quizView must contain the stats row it is scrolled to")


class TestScrollMechanism(unittest.TestCase):
    def test_no_scroll_into_view_anywhere(self):
        # Calls, not mentions: the fix's own comments discuss the old API.
        self.assertNotRegex(SCRIPT, r"\.scrollIntoView\s*\(")

    def test_advance_scrolls_window_to_measured_offset(self):
        self.assertIn("window.scrollTo", SCRIPT)
        self.assertIn("getBoundingClientRect", SCRIPT)
        self.assertNotIn("scrollTo({top: 0", SCRIPT)
        self.assertNotIn("scrollTo(0", SCRIPT)

    def test_next_handler_blurs_before_render(self):
        handler = re.search(
            r"nextBtn\.addEventListener\('click', function\(\)\{(.*?)\}\);",
            SCRIPT, re.S).group(1)
        self.assertIn("blurActive()", handler)
        self.assertLess(handler.index("blurActive()"), handler.index("render()"))

    def test_scroll_anchoring_disabled(self):
        self.assertRegex(STYLE, r"overflow-anchor\s*:\s*none")


class TestInitialStats(unittest.TestCase):
    def test_static_placeholders_are_zeroed(self):
        for el_id in ("statScore", "statStreak", "statHints"):
            m = re.search(rf'id="{el_id}">([^<]*)<', BUILT)
            self.assertIsNotNone(m, el_id)
            self.assertEqual(m.group(1), "0", f"{el_id} placeholder")
        m = re.search(r'id="statQ">([^<]*)<', BUILT)
        self.assertEqual(m.group(1), "1 / 12")


@unittest.skipUnless(shutil.which("node"), "node not available — DOM harness skipped")
class TestDomHarness(unittest.TestCase):
    """Runs the built page's real script in the stub DOM
    (tests/dom_harness.js): fixed stub geometry makes the one correct
    advance scroll window.scrollTo(top=1140), i.e. the quiz anchor's
    document offset (240 + 900) — never the document top (0)."""

    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["node", str(ROOT / "tests/dom_harness.js"), str(ROOT / "index.html")],
            capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        cls.out = json.loads(result.stdout.strip().splitlines()[-1])

    def test_first_load_stats_match_restart_stats(self):
        fresh = {"q": "1 / 12", "score": "0", "streak": "0", "hints": "0"}
        self.assertEqual(self.out["afterLoad"], fresh)
        self.assertEqual(self.out["afterRestart"], fresh)

    def test_advance_scrolls_to_quiz_anchor_not_document_top(self):
        events = self.out["events"]
        self.assertFalse([e for e in events if e["kind"] == "scrollIntoView"],
                         "advance must not use scrollIntoView")
        scrolls = [e for e in events if e["kind"] == "scrollTo"]
        self.assertTrue(scrolls, "advance must scroll the window")
        for e in scrolls:
            self.assertEqual(e["top"], 1140)
            self.assertNotEqual(e["top"], 0)

    def test_focused_button_is_blurred_before_the_scroll(self):
        kinds = [e["kind"] for e in self.out["events"]]
        self.assertIn("blur", kinds)
        self.assertIn("scrollTo", kinds)
        self.assertLess(kinds.index("blur"), kinds.index("scrollTo"))

    def test_advance_actually_advanced(self):
        self.assertEqual(self.out["afterAdvance"]["q"], "2 / 12")


class TestFeedbackWording(unittest.TestCase):
    def test_reverse_feedback_names_candidate_position(self):
        self.assertIn("was candidate '+correctPos+'", SCRIPT)
        self.assertIn("you picked the '+name+' snippet", SCRIPT)

    def test_pairing_feedback_names_both_languages(self):
        self.assertIn("q.langA+' vs '+q.langB", SCRIPT)

    def test_misleading_captions_fixed(self):
        hard = (ROOT / "src/data/hard.json").read_text(encoding="utf-8")
        expert = (ROOT / "src/data/expert.json").read_text(encoding="utf-8")
        self.assertNotIn("theatrical function definition", hard)
        self.assertIn("written to be sung like a ballad", hard)
        self.assertNotIn("s, k and i are the only functions", expert)
        self.assertIn("i = s k k", expert)


if __name__ == "__main__":
    unittest.main()
