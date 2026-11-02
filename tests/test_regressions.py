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
4. Scoped UI/UX audit fixes (2026-11-01): feedback is a live region and
   question changes are announced (A1); a keyboard advance lands focus
   on the question prompt while a pointer advance keeps the blur +
   measured-scroll behaviour above (A2); mode buttons carry
   aria-pressed (A3); every CSS text pair passes WCAG AA contrast,
   computed from the stylesheet (A4); mode toggles are 44px targets
   and the dead .pair-* CSS is gone (M2/M5); Normal's mode line states
   the premise and Hard's states its scoring (N1/N2); the best streak
   is shown on the results screen (N4); the dead REVERSE_PROMPT /
   EXPERT_ODD_PROMPT strings are no longer shipped (N5).
5. Auto-advance: in Hard/Expert a completed round advances itself
   after 1200 ms (Normal never does; an Expert family pick is not a
   completed round). One centralized scheduler, and every exit path —
   manual Next, restart, mode switch — cancels the pending handle, so
   an advance happens exactly once. Source pins plus harness runs
   with fake timers pin all of it.
6. Pairing format: a "Different" call must also name the second
   language. Stage 1 behaves as before except that a correct
   "Different" is a transition, not a completion — no score, no log
   entry, no finishRound, no timer — and stage 2 (4 name options from
   the entry's own data) is the round's single +100 / −50 point.
7. Commands mode (fourth tab): 12 rounds drawn from the 80-command
   pool — 9 meaning + 3 reverse, no command repeated, at most 3
   rounds per language — scored +100 / 0 with exactly one −25 hint
   per run, completing through finishRound() so the 1.2 s
   auto-advance applies (the scheduler's only guard is Normal).
8. Study view (a view switch in the header, not a fifth mode): the
   reference content is rendered from the same pools — every Normal
   language (alphabetical, with its Hello World and fact) and every
   Commands language with each command's effect verbatim — entering
   Study cancels a pending auto-advance timer through the same
   clearAutoAdvance path as a mode switch, aria-pressed stays
   coherent across all five header controls, and returning via a
   mode tab starts a run as a mode switch does.

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

    def test_keyboard_advance_lands_focus_on_question_prompt(self):
        events = self.out["keyboardEvents"]
        scrolls = [e for e in events if e["kind"] == "scrollTo"]
        self.assertTrue(scrolls, "keyboard advance must still scroll")
        for e in scrolls:
            self.assertEqual(e["top"], 1140)
        focuses = [e for e in events if e["kind"] == "focus"]
        self.assertEqual(len(focuses), 1)
        self.assertEqual(focuses[0]["target"], "qTitle")
        kinds = [e["kind"] for e in events]
        self.assertLess(kinds.index("scrollTo"), kinds.index("focus"),
                        "focus must land after the scroll, with preventScroll")
        self.assertEqual(self.out["afterKeyboardAdvance"]["focusId"], "qTitle")
        self.assertEqual(self.out["afterKeyboardAdvance"]["q"], "3 / 12")

    def test_pointer_advance_does_not_move_focus_to_prompt(self):
        # The pointer path is the original scroll fix: blur, then scroll,
        # and nothing else — no focus() call at all.
        self.assertFalse([e for e in self.out["events"] if e["kind"] == "focus"])

    def test_question_changes_are_announced(self):
        self.assertTrue(self.out["srAfterLoad"].startswith("Question 1 of 12"))
        self.assertTrue(self.out["srAfterAdvance"].startswith("Question 2 of 12"))

    def test_mode_buttons_aria_pressed_updates(self):
        self.assertEqual(self.out["modePressed"],
                         {"normal": "false", "hard": "true", "expert": "false"})

    def test_normal_answer_schedules_no_timer(self):
        self.assertEqual(self.out["normalTimersAfterAnswer"], [])

    def test_hard_answer_schedules_exactly_one_1200ms_timer(self):
        timers = self.out["hardTimersAfterAnswer"]
        self.assertEqual(len(timers), 1)
        self.assertEqual(timers[0]["ms"], 1200)

    def test_hard_timer_advances_exactly_once(self):
        self.assertEqual(self.out["hardAfterTimerFire"],
                         {"q": "2 / 15", "pending": 0})
        self.assertEqual(self.out["hardAfterTimerRefire"], {"q": "2 / 15"})

    def test_manual_next_during_delay_cancels_the_timer(self):
        self.assertEqual(len(self.out["hardSecondTimer"]), 1)
        self.assertEqual(self.out["hardAfterManualNext"],
                         {"q": "3 / 15", "pending": 0})
        # Firing the cancelled handle later does not advance again.
        self.assertEqual(self.out["hardAfterStaleFire"], {"q": "3 / 15"})

    def test_expert_two_stage_family_pick_schedules_no_timer(self):
        two = self.out["expertTwoStage"]
        self.assertIsNotNone(two, "harness never reached a two-stage round")
        self.assertEqual(two["pendingAfterFamily"], [])
        self.assertTrue(two["titleAfterFamily"].startswith("Family correct"))
        self.assertEqual(len(two["pendingAfterComplete"]), 1)
        self.assertEqual(two["pendingAfterComplete"][0]["ms"], 1200)

    def test_mode_switch_cancels_a_pending_timer(self):
        self.assertTrue(self.out["modeSwitchHadTimer"])
        self.assertEqual(self.out["modeSwitchPendingAfter"], [])
        after = self.out["modeSwitchAfterStaleFire"]
        self.assertEqual(after["q"], "1 / 15")
        self.assertTrue(after["tag"].startswith("Hard"))

    def test_restart_cancels_a_pending_timer(self):
        self.assertTrue(self.out["restartHadTimer"])
        self.assertEqual(self.out["restartPendingAfter"], [])
        after = self.out["restartAfterStaleFire"]
        self.assertEqual(after["q"], "1 / 15")
        self.assertTrue(after["tag"].startswith("Hard"))

    # --- Pairing two-stage format (harness scenarios) ---

    def test_pairing_scenarios_all_collected(self):
        self.assertEqual(set(self.out["pairing"]),
                         {"sameCorrect", "wrongDiffCallOnSame", "diffStage",
                          "diffWrongName", "wrongSameCallOnDifferent"},
                         f"harness pairing runs: {self.out['pairingRuns']}")

    def test_pairing_same_call_completes_immediately(self):
        s = self.out["pairing"]["sameCorrect"]
        self.assertEqual(s["delta"], 100)          # +100 at once
        self.assertFalse(s["stage2Shown"])         # no stage 2 appears
        self.assertEqual(s["pendingAfter"], 1)     # round done: one timer

    def test_pairing_different_call_reaches_stage_two_unscored(self):
        d = self.out["pairing"]["diffStage"]
        # Stage 1 correct "Different": no score change, no timer, and
        # the stage-2 question replaces the Same/Different buttons.
        self.assertEqual(d["midDelta"], 0)
        self.assertEqual(d["midPending"], 0)
        self.assertEqual(d["midTitle"], "What language is the second excerpt?")
        # Naming excerpt B correctly completes the round: exactly +100
        # in total and exactly one auto-advance timer.
        self.assertEqual(d["finalDelta"], 100)
        self.assertEqual(d["pendingAfter"], 1)

    def test_pairing_stage_two_wrong_name_scores_minus_50(self):
        w = self.out["pairing"]["diffWrongName"]
        self.assertEqual(w["finalDelta"], -50)
        self.assertIn("the second excerpt is " + w["langB"], w["feedback"])
        self.assertEqual(w["pendingAfter"], 1)  # completed: Next/timer work

    def test_pairing_wrong_stage_one_calls_end_the_round(self):
        a = self.out["pairing"]["wrongDiffCallOnSame"]
        self.assertEqual(a["delta"], -50)
        self.assertIn("the same language", a["feedback"])
        self.assertEqual(a["pendingAfter"], 1)
        b = self.out["pairing"]["wrongSameCallOnDifferent"]
        self.assertEqual(b["delta"], -50)
        self.assertIn("different languages", b["feedback"])
        self.assertEqual(b["pendingAfter"], 1)


    # --- Commands mode (harness) ---

    def test_commands_pool_is_injected(self):
        self.assertEqual(self.out["commandsPoolSize"], 80)

    def test_commands_tab_aria_pressed(self):
        self.assertEqual(self.out["commandsPressed"],
                         {"normal": "false", "hard": "false",
                          "expert": "false", "commands": "true"})

    def test_commands_flow_scoring_hint_and_timer(self):
        flow = self.out["commandsFlow"]
        self.assertEqual(flow["firstDelta"], 100)        # +100 correct
        self.assertEqual(len(flow["timersAfterFirst"]), 1)
        self.assertEqual(flow["timersAfterFirst"][0]["ms"], 1200)
        self.assertEqual(flow["hintDelta"], -25)          # the one hint
        self.assertEqual(flow["hintStreak"], "0")         # costs the streak
        self.assertEqual(flow["hintsStatAfterHint"], "1 / 1")
        self.assertEqual(flow["secondHintDelta"], 0)      # second refused
        # 12 correct answers, one −25 hint: 1200 − 25.
        self.assertEqual(flow["finalScore"], "1175")
        self.assertEqual(flow["bdCorrect"], "12 / 12")

    def test_commands_results_review_shows_a_fact(self):
        self.assertTrue(self.out["commandsFlow"]["reviewHasFact"])

    # --- Study view (harness) ---

    def test_study_renders_every_normal_language(self):
        entries = self.out["studyLangEntries"]
        questions = json.loads(
            (ROOT / "src/data/normal.json").read_text(encoding="utf-8"))["QUESTIONS"]
        expected = sorted(questions, key=lambda q: q["lang"])
        self.assertEqual([e["name"] for e in entries],
                         [q["lang"] for q in expected])
        for entry, q in zip(entries, expected):
            self.assertEqual(entry["code"], q["code"],
                             f"study code for {q['lang']}")
            self.assertEqual(entry["fact"], q["fact"],
                             f"study fact for {q['lang']}")

    def test_study_renders_every_command_effect_verbatim(self):
        groups = self.out["studyCmdGroups"]
        commands = json.loads(
            (ROOT / "src/data/commands.json").read_text(encoding="utf-8"))["COMMANDS"]
        by_lang = {}
        for c in commands:
            by_lang.setdefault(c["lang"], []).append(c)
        self.assertEqual([g["lang"] for g in groups], sorted(by_lang))
        total = 0
        for g in groups:
            self.assertEqual(
                g["rows"],
                [[c["symbol"], c["effect"]] for c in by_lang[g["lang"]]],
                f"study rows for {g['lang']}")
            total += len(g["rows"])
        self.assertEqual(total, len(commands))

    def test_entering_study_cancels_a_pending_timer(self):
        enter = self.out["studyEnter"]
        self.assertTrue(enter["hadTimer"])
        self.assertEqual(enter["pendingAfter"], [])
        # Firing the stale handle afterwards advances nothing and
        # leaves the Study view up.
        after = self.out["studyAfterStaleFire"]
        self.assertEqual(after["q"], "1 / 15")
        self.assertTrue(after["studyShown"])

    def test_study_pressed_states_and_announcement(self):
        enter = self.out["studyEnter"]
        self.assertEqual(enter["pressed"],
                         {"normal": "false", "hard": "false",
                          "expert": "false", "commands": "false",
                          "study": "true"})
        self.assertTrue(enter["studyShown"])
        self.assertEqual(enter["quizDisplay"], "none")
        self.assertTrue(enter["sr"].startswith("Study view."))

    def test_returning_from_study_starts_a_run(self):
        ret = self.out["studyReturn"]
        self.assertEqual(ret["q"], "1 / 12")
        self.assertFalse(ret["studyShown"])
        self.assertEqual(ret["quizDisplay"], "")
        self.assertEqual(ret["pressed"],
                         {"normal": "true", "hard": "false",
                          "expert": "false", "commands": "false",
                          "study": "false"})

    def test_commands_draw_simulation(self):
        draws = self.out["commandsDraws"]
        self.assertEqual(len(draws), 40)
        for run in draws:
            self.assertEqual(len(run), 12)
            kinds = [r["kind"] for r in run]
            self.assertEqual(kinds.count("meaning"), 9)
            self.assertEqual(kinds.count("reverse"), 3)
            keys = [(r["lang"], r["sym"]) for r in run]
            self.assertEqual(len(set(keys)), 12,
                             f"repeated command in run: {keys}")
            per_lang = {}
            for r in run:
                per_lang[r["lang"]] = per_lang.get(r["lang"], 0) + 1
            self.assertLessEqual(max(per_lang.values()), 3,
                                 f"language cap broken: {per_lang}")


class TestStudyView(unittest.TestCase):
    """Study view source pins: the toggle and view exist in the shell
    with sane heading structure, the content renders from the pools
    (no authored copies), entering Study cancels the auto-advance
    timer, setMode leaves Study coherently, and the quiz keys are
    inert while studying."""

    def test_toggle_and_view_structure(self):
        self.assertRegex(BUILT, r'id="studyBtn"[^>]*aria-pressed="false"[^>]*>Study<')
        self.assertRegex(BUILT, r'<div class="study" id="studyView">')
        self.assertIn("<h2>Languages</h2>", BUILT)
        self.assertIn("<h2>Commands</h2>", BUILT)
        self.assertIn(".study{display:none", STYLE)
        self.assertIn(".study.show{display:block", STYLE)

    def test_study_renders_from_the_pools(self):
        body = re.search(r"function buildStudy\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("QUESTIONS.slice().sort(byLang)", body)
        self.assertIn("q.code", body)
        self.assertIn("q.fact", body)
        self.assertIn("COMMANDS.forEach", body)
        # Effects reach the table verbatim — no rewording layer.
        self.assertIn("tdE.textContent = c.effect;", body)

    def test_entering_study_cancels_auto_advance(self):
        body = re.search(r"function showStudy\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("clearAutoAdvance();", body)
        self.assertIn("studyView.classList.add('show')", body)
        self.assertIn("setAttribute('aria-pressed', 'true')", body)

    def test_set_mode_leaves_study(self):
        body = re.search(r"function setMode\(m\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("studyView.classList.remove('show')", body)
        self.assertIn("studyBtn.setAttribute('aria-pressed', 'false')", body)

    def test_study_mode_line_and_announcement(self):
        self.assertIn("Reference — every Hello World and command in the quiz.",
                      SCRIPT)
        body = re.search(r"function showStudy\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("srStatus.textContent = 'Study view.", body)

    def test_quiz_keys_are_inert_in_study(self):
        self.assertIn("if(view==='study') return;", SCRIPT)


class TestCommandsMode(unittest.TestCase):
    """Commands mode source pins: the fourth tab exists, its mode line
    states its rules, rounds complete through the shared finishRound()
    (hence the auto-advance), and the draw enforces its caps."""

    def test_four_mode_tabs_in_the_shell(self):
        self.assertEqual(len(re.findall(r'id="mode\w+Btn"', BUILT)), 4)
        self.assertRegex(BUILT, r'id="modeCommandsBtn"[^>]*aria-pressed="false"')
        self.assertIn("setMode('commands')", SCRIPT)

    def test_mode_line_states_the_rules(self):
        self.assertIn("What does it do? · +100 per correct · 1 hint per run "
                      "(−25 pts) · facts at results.", SCRIPT)

    def test_commands_rounds_complete_through_finish_round(self):
        body = re.search(r"function answerCommand\(picked, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("points+=100", body)
        self.assertNotIn("points-=", body)
        self.assertIn("finishRound(correct, line);", body)

    def test_hint_limit_covers_commands(self):
        self.assertIn("(mode==='hard' || mode==='commands') && hintsUsed>=1", SCRIPT)
        self.assertIn("mode==='commands') ? (hintsUsed+' / 1')", SCRIPT)

    def test_draw_enforces_language_cap_and_reverse_count(self):
        body = re.search(r"function pickCommands\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("(perLang[lang]||0)>=3", body)
        self.assertIn("marked>=3", body)
        self.assertIn("commandsReverse = designations;", body)


class TestPairingFormat(unittest.TestCase):
    """Pairing format pins: the stage-1 prompt states the full job; a
    correct "Different" call is a transition, not a completion (it must
    not score, log, finish the round or schedule the auto-advance);
    stage 2 is the round's single scoring point and records the full
    claim ('Different — second: X') in the review log."""

    def test_stage_one_buttons_route_to_the_pairing_handler(self):
        self.assertIn("answerPair(optDef[0], b)", SCRIPT)

    def test_prompt_states_the_full_job_up_front(self):
        self.assertIn("Same language — or different? If different, "
                      "name the second one.", SCRIPT)
        self.assertIn("What language is the second excerpt?", SCRIPT)

    def test_stage_two_options_come_from_the_entry(self):
        body = re.search(r"function answerPair\(call, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("shuffle(q.options.slice())", body)

    def test_correct_different_transition_never_finishes_the_round(self):
        body = re.search(r"function answerPair\(call, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertNotIn("finishRound(", body)
        self.assertNotIn("scheduleAutoAdvance", body)
        self.assertNotIn("resultsLog.push", body)
        self.assertNotIn("points+=", body)
        self.assertNotIn("points-=", body)
        # A wrong call, or a correct "Same", routes to the ordinary
        # pairing answer (which does finish the round, as before).
        self.assertIn("answer(call, btn)", body)

    def test_stage_two_scores_once_and_finishes(self):
        body = re.search(r"function answerPairSecond\(name, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("points+=100", body)
        self.assertIn("points-=50", body)
        self.assertIn("finishRound(correct, line);", body)
        self.assertIn("the second excerpt is '+q.langB+', not '+name", body)

    def test_review_log_records_the_full_claim(self):
        body = re.search(r"function answerPairSecond\(name, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("picked:'Different — second: '+name", body)
        self.assertIn("correctAnswer:'Different — second: '+q.langB", body)


class TestAutoAdvancePins(unittest.TestCase):
    """Auto-advance (Hard/Expert only, 1.2 s): the scheduling is
    centralized — one setTimeout call site, reached only from the
    round-completion point — and every exit path cancels the handle."""

    def test_delay_is_a_named_1200ms_constant(self):
        self.assertIn("var AUTO_ADVANCE_MS = 1200;", SCRIPT)
        self.assertIn("}, AUTO_ADVANCE_MS);", SCRIPT)

    def test_single_timer_call_site(self):
        self.assertEqual(SCRIPT.count("setTimeout("), 1)
        self.assertEqual(SCRIPT.count("clearTimeout("), 1)

    def test_scheduler_is_normal_guarded_and_clears_first(self):
        body = re.search(r"function scheduleAutoAdvance\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("if(mode==='normal') return;", body)
        self.assertLess(body.index("clearAutoAdvance()"),
                        body.index("setTimeout("))

    def test_scheduled_from_the_round_completion_point_only(self):
        finish = re.search(r"function finishRound\(correct, lineText\)\{(.*?)\n\}",
                           SCRIPT, re.S).group(1)
        self.assertIn("scheduleAutoAdvance();", finish)
        # The Expert family gate is the one path that shows feedback
        # WITHOUT completing a round; its only finishRound call is the
        # wrong-family branch, which precedes the stage-2 swap.
        gate = re.search(r"function answerExpertFamily\(fam, btn\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertEqual(gate.count("finishRound("), 1)
        self.assertLess(gate.index("finishRound("), gate.index("expertStage=1"))

    def test_timer_fires_the_pointer_advance_path(self):
        body = re.search(r"function scheduleAutoAdvance\(\)\{(.*?)\n\}",
                         SCRIPT, re.S).group(1)
        self.assertIn("nextBtn.click();", body)

    def test_every_exit_path_cancels(self):
        handler = re.search(
            r"nextBtn\.addEventListener\('click', function\(\)\{(.*?)\}\);",
            SCRIPT, re.S).group(1)
        self.assertLess(handler.index("clearAutoAdvance()"),
                        handler.index("render()"))
        for fn in ("startQuiz", "setMode"):
            body = re.search(rf"function {fn}\([^)]*\)\{{(.*?)\n\}}",
                             SCRIPT, re.S)
            self.assertIsNotNone(body, fn)
            self.assertIn("clearAutoAdvance();", body.group(1), fn)
        self.assertIn("function restart(){ clearAutoAdvance();", SCRIPT)


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


def _luminance(hexcolor):
    h = hexcolor.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
           for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _contrast(fg, bg):
    hi, lo = sorted((_luminance(fg), _luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _scheme_vars(dark):
    if dark:
        block = re.search(
            r"prefers-color-scheme: dark\)\{\s*:root\{(.*?)\}", STYLE, re.S).group(1)
    else:
        block = STYLE.split("@media (prefers-color-scheme: dark)")[0]
    return dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})", block))


# Foreground/background variable pairs that carry text in each scheme.
# The disabled-Hint and dimmed-option blends are excluded on purpose:
# WCAG exempts genuinely inactive components, and their information is
# repeated in the feedback line (itself a pair below). The accent is a
# non-text graphic (progress bar), held to the 3:1 bar instead.
TEXT_PAIRS = [("ink", "bg"), ("ink", "good-bg"), ("ink", "bad-bg"),
              ("code-ink", "code-bg"), ("code-dim", "code-bg"),
              ("muted", "bg"), ("muted", "surface-2"),
              ("good", "bg"), ("bad", "bg"), ("bg", "ink")]


class TestAuditAccessibility(unittest.TestCase):
    def test_feedback_is_a_live_region(self):
        self.assertRegex(BUILT, r'id="feedbackEl"[^>]*aria-live="polite"')

    def test_question_live_region_and_announcement(self):
        self.assertRegex(BUILT, r'id="srStatus"[^>]*role="status"')
        self.assertIn("srStatus.textContent = 'Question '", SCRIPT)
        self.assertIn(".sr-only{", STYLE)

    def test_mode_buttons_start_with_aria_pressed(self):
        self.assertRegex(BUILT, r'id="modeNormalBtn"[^>]*aria-pressed="true"')
        self.assertRegex(BUILT, r'id="modeHardBtn"[^>]*aria-pressed="false"')
        self.assertRegex(BUILT, r'id="modeExpertBtn"[^>]*aria-pressed="false"')
        self.assertIn("setAttribute('aria-pressed'", SCRIPT)

    def test_focus_visible_styled_and_prompt_is_anchor(self):
        self.assertIn(":focus-visible{outline:2px solid var(--accent)", STYLE)
        self.assertRegex(BUILT, r'id="qTitle"[^>]*tabindex="-1"')
        self.assertIn("focus({preventScroll:true})", SCRIPT)

    def test_all_text_pairs_pass_aa_contrast(self):
        for dark in (False, True):
            vars_ = _scheme_vars(dark)
            for fg, bg in TEXT_PAIRS:
                ratio = _contrast(vars_["--" + fg], vars_["--" + bg])
                self.assertGreaterEqual(
                    ratio, 4.5,
                    f"{'dark' if dark else 'light'} --{fg} on --{bg}: {ratio:.2f}")
            self.assertGreaterEqual(
                _contrast(vars_["--accent"], vars_["--bg"]), 3.0,
                "accent progress bar is a graphic: 3:1 non-text bar")

    def test_code_dim_value_is_the_fixed_one(self):
        self.assertEqual(_scheme_vars(False)["--code-dim"], "#6f6f6c")

    def test_snippet_buttons_get_candidate_labels(self):
        # Both snippet renderers (reverse + odd-one-out), so feedback's
        # "candidate 3" has an accessible name to refer to (A6).
        self.assertEqual(SCRIPT.count("setAttribute('aria-label', 'Candidate '"), 2)


class TestAuditMobileAndCopy(unittest.TestCase):
    def test_mode_toggle_targets_are_44px(self):
        rule = re.search(r"\.mode-toggle button\{(.*?)\}", STYLE).group(1)
        self.assertIn("min-height:44px", rule)

    def test_dead_pair_css_removed(self):
        self.assertNotIn("pair-label", STYLE)
        self.assertNotIn("pair-block", STYLE)

    def test_normal_mode_line_states_the_premise(self):
        self.assertIn("Every program prints Hello, World! — name the language.", SCRIPT)

    def test_hard_mode_line_states_its_scoring(self):
        self.assertIn("Excerpts only · +100 per correct · 1 hint per run (−25 pts)"
                      " · facts at results.", SCRIPT)

    def test_streak_is_explained_and_best_streak_shown(self):
        self.assertIn('title="Questions answered correctly in a row"', BUILT)
        self.assertIn('id="bdBestStreak"', BUILT)
        self.assertIn("getElementById('bdBestStreak')", SCRIPT)

    def test_dead_prompt_strings_no_longer_ship(self):
        self.assertNotIn("REVERSE_PROMPT", BUILT)
        self.assertNotIn("EXPERT_ODD_PROMPT", BUILT)
        for name in ("hard.json", "expert.json"):
            data = (ROOT / "src/data" / name).read_text(encoding="utf-8")
            self.assertNotIn("REVERSE_PROMPT", data)
            self.assertNotIn("EXPERT_ODD_PROMPT", data)


if __name__ == "__main__":
    unittest.main()
