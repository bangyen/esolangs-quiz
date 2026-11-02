// DOM-stub harness used by tests/test_regressions.py (skipped when node
// is unavailable). It runs the built page's real inline script against a
// minimal stub DOM and prints one JSON object describing:
//   afterLoad     stats (q / score / streak / hints) right after page load
//   events        ordered scroll-related events during answer -> Next,
//                 with the Next button holding focus, as a real click does
//   afterAdvance  stats after advancing to round 2
//   keyboardEvents / afterKeyboardAdvance
//                 events and focus state for an Enter-key advance to
//                 round 3: the scroll must still be scrollTo(1140), and
//                 focus must then land on the question prompt (qTitle)
//   srAfterLoad / srAfterAdvance
//                 the visually hidden live region's text (A1 announcements)
//   afterRestart  stats after clicking Play again (restart)
//   modePressed   aria-pressed on the three mode buttons after setMode('hard')
//   normalTimersAfterAnswer
//                 pending fake timers after answering a Normal round
//                 (auto-advance is Hard/Expert only: must be [])
//   hard*         Hard auto-advance: one 1200 ms timer after answering;
//                 firing it advances exactly one round (re-firing the
//                 consumed handle is a no-op); a manual Next during the
//                 delay advances once and the cancelled timer firing
//                 later does not advance again
//   expertTwoStage
//                 Expert two-stage: a correct family pick schedules NO
//                 timer (the round continues); completing the round
//                 schedules one, and firing it advances
//   modeSwitchCancel / restartCancel
//                 a pending timer is cancelled by setMode / restart, and
//                 firing the stale handle afterwards is a no-op
//   expertDraws   500 drawn Expert runs for the draw simulation
//                 (composition 6 identification + 4 odd-one-out +
//                 5 two-stage every run, and no language repeated
//                 within a run — each round's entry identified from
//                 the page's own injected pools by its code)
//   commands*     Commands mode: aria-pressed across all four tabs; a
//                 fully instrumented flow run (+100 scoring, the single
//                 −25 hint and its refusal, one 1200 ms timer, the
//                 results review showing a command fact); and 200
//                 drawn runs for the draw simulation (composition
//                 9 meaning + 3 reverse, no repeated command, ≤ 3 per
//                 language, and every meaning round's option set: the
//                 asked effect plus 3 verbatim effects of same-language
//                 commands outside the run's drawn set)
//   study*        Study view: the rendered reference content (language
//                 entries and command groups, read straight off the
//                 built DOM); entering Study with a Hard auto-advance
//                 timer pending cancels it (firing the stale handle
//                 afterwards changes nothing and leaves Study up);
//                 aria-pressed across all five header controls in and
//                 out of Study; returning via a mode tab hides Study,
//                 shows the quiz and starts a normal run
//
// Timers are fake: setTimeout/clearTimeout are injected into the script
// scope and recorded in a registry; nothing fires unless fireTimer(id)
// is called, and a cleared or already-fired handle never runs.
//
// Stub geometry is fixed: every element's getBoundingClientRect().top is
// 240 and window.pageYOffset is 900, so a correct advance scroll must be
// window.scrollTo with top == 1140 — never 0, never scrollIntoView.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const events = [];

function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', children: [],
    style: {}, disabled: false, _handlers: {}, _qs: {},
    _classes: new Set(), _text: '', _html: '',
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { this._handlers[t] = fn; },
    setAttribute(k, v) { this['_attr_' + k] = v; },
    getAttribute(k) { return this['_attr_' + k]; },
    querySelector(sel) { if (!this._qs[sel]) this._qs[sel] = makeEl('span'); return this._qs[sel]; },
    querySelectorAll(sel) { return this.children.slice(); },
    scrollIntoView(opts) { events.push({ kind: 'scrollIntoView', target: this.id || this.tagName }); },
    blur() {
      events.push({ kind: 'blur', target: this.id || this.tagName });
      if (document.activeElement === this) document.activeElement = null;
    },
    focus() {
      events.push({ kind: 'focus', target: this.id || this.tagName });
      document.activeElement = this;
    },
    click() { if (this._handlers.click) this._handlers.click(); },
    getBoundingClientRect() { return { top: 240, left: 0, width: 600, height: 40 }; },
  };
  Object.defineProperty(el, 'className', {
    get() { return Array.from(this._classes).join(' '); },
    set(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  el.classList = {
    add: (...cs) => cs.forEach(c => el._classes.add(c)),
    remove: (...cs) => cs.forEach(c => el._classes.delete(c)),
    contains: (c) => el._classes.has(c),
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); this._html = ''; },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html || this._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    set(v) { this._html = String(v); if (v === '') this.children = []; },
  });
  return el;
}

const byId = {};
const document = {
  activeElement: null,
  _handlers: {},
  getElementById(id) { if (!byId[id]) byId[id] = makeEl('div', id); return byId[id]; },
  createElement(tag) { return makeEl(tag); },
  addEventListener(t, fn) { this._handlers[t] = fn; },
};
const window = {
  matchMedia() { return { matches: false }; },
  pageYOffset: 900,
  scrollTo(opts) { events.push({ kind: 'scrollTo', top: opts && opts.top }); },
};

const stats = () => ({
  q: document.getElementById('statQ').textContent,
  score: document.getElementById('statScore').textContent,
  streak: document.getElementById('statStreak').textContent,
  hints: document.getElementById('statHints').textContent,
});

// Fake timer registry (see header). pendingTimers() lists handles a real
// browser would still fire; fireTimer() models the browser firing one —
// a cleared or consumed handle can never fire.
const timers = new Map();
let nextTimerId = 1;
function fakeSetTimeout(fn, ms) {
  const id = nextTimerId++;
  timers.set(id, { fn, ms, cleared: false, fired: false });
  return id;
}
function fakeClearTimeout(id) {
  const t = timers.get(id);
  if (t) t.cleared = true;
}
function pendingTimers() {
  return Array.from(timers.entries())
    .filter(([, t]) => !t.cleared && !t.fired)
    .map(([id, t]) => ({ id, ms: t.ms }));
}
function fireTimer(id) {
  const t = timers.get(id);
  if (!t || t.cleared || t.fired) return false;
  t.fired = true;
  t.fn();
  return true;
}

new Function('document', 'window', 'setTimeout', 'clearTimeout', script)(
  document, window, fakeSetTimeout, fakeClearTimeout);

const srText = () => document.getElementById('srStatus').textContent;

const out = { afterLoad: stats(), events: null, afterAdvance: null, afterRestart: null,
              keyboardEvents: null, afterKeyboardAdvance: null,
              srAfterLoad: srText(), srAfterAdvance: null, modePressed: null,
              // F1: the default mode's line + score label must be set at
              // startup (from MODE_INFO), not only by a mode-tab click.
              modeNoteAfterLoad: document.getElementById('modeNote').textContent,
              scoreLabelAfterLoad: document.getElementById('scoreLabel').textContent };

const nextBtn = document.getElementById('nextBtn');
document.getElementById('optionsEl').children[0].click();  // answer round 1
out.normalTimersAfterAnswer = pendingTimers();             // Normal: no auto-advance
document.activeElement = nextBtn;                          // a real click leaves it focused
nextBtn.click();                                           // advance (pointer)
out.events = events.slice();
out.afterAdvance = stats();
out.srAfterAdvance = srText();

// Advance round 2 -> 3 by keyboard: answer, focus on <body>, press Enter.
document.getElementById('optionsEl').children[0].click();  // answer round 2
document.activeElement = null;
const evStart = events.length;
document._handlers.keydown({ key: 'Enter', preventDefault() {} });
out.keyboardEvents = events.slice(evStart);
out.afterKeyboardAdvance = {
  q: stats().q,
  focusId: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
};

document.getElementById('restartBtn').click();
out.afterRestart = stats();

document.getElementById('modeHardBtn').click();            // setMode('hard')
out.modePressed = {
  normal: document.getElementById('modeNormalBtn').getAttribute('aria-pressed'),
  hard: document.getElementById('modeHardBtn').getAttribute('aria-pressed'),
  expert: document.getElementById('modeExpertBtn').getAttribute('aria-pressed'),
};

// --- Auto-advance (Hard/Expert only) -------------------------------------
const optionsEl = document.getElementById('optionsEl');
const qTag = document.getElementById('qTag');

// Hard: answering schedules exactly one 1200 ms timer; firing it
// advances exactly one round; re-firing the consumed handle is a no-op.
optionsEl.children[0].click();                             // answer Hard round 1
out.hardTimersAfterAnswer = pendingTimers();
out.hardHintDisabledAfterAnswer =
  document.getElementById('hintBtn').disabled;             // S6: expect true
const hardTimer = pendingTimers()[0];
if (hardTimer) fireTimer(hardTimer.id);
out.hardAfterTimerFire = { q: stats().q, pending: pendingTimers().length };
if (hardTimer) fireTimer(hardTimer.id);
out.hardAfterTimerRefire = { q: stats().q };

// Hard: a manual Next during the delay advances once, and the timer it
// cancelled cannot advance the run again when it would have fired.
optionsEl.children[0].click();                             // answer Hard round 2
out.hardSecondTimer = pendingTimers();
const staleAfterManual = pendingTimers()[0];
nextBtn.click();                                           // manual advance -> round 3
out.hardAfterManualNext = { q: stats().q, pending: pendingTimers().length };
if (staleAfterManual) fireTimer(staleAfterManual.id);
out.hardAfterStaleFire = { q: stats().q };

// S7: a KEYBOARD player's timer advance must land focus on the new
// prompt, like their manual Enter advance does. Answer this round by
// digit key (the keydown handler records the keyboard modality), then
// fire the pending timer and watch the focus events.
const kbEvStart = events.length;
document._handlers.keydown({ key: '1', preventDefault() {} });  // answer by key
out.kbAnswerByKey = {
  timers: pendingTimers().length,
  hintDisabled: document.getElementById('hintBtn').disabled,
};
const kbTimer = pendingTimers()[0];
if (kbTimer) fireTimer(kbTimer.id);
out.kbAfterTimerFire = {
  q: stats().q,
  focusTargets: events.slice(kbEvStart)
    .filter(e => e.kind === 'focus').map(e => e.target),
  focusId: document.activeElement
    ? (document.activeElement.id || document.activeElement.tagName) : null,
};

// Expert two-stage: play forward until a two-stage round. The correct
// family is read from the page's own injected EXPERT_TWO data, matched
// by the displayed code — no guessing.
const twoData = JSON.parse(
  script.match(/var EXPERT_TWO = (\[[\s\S]*?\n\]);/)[1]);
document.getElementById('modeExpertBtn').click();          // setMode('expert')
let twoStage = null;
for (let step = 0; step < 15 && !twoStage; step++) {
  if (qTag.textContent.indexOf('Two-stage') >= 0) {
    const entry = twoData.find(
      e => e.code === document.getElementById('codeEl').textContent);
    const famBtn = optionsEl.children.find(
      b => b.getAttribute('data-name') === entry.family);
    famBtn.click();                                        // correct family (stage 1)
    twoStage = {
      family: entry.family,
      pendingAfterFamily: pendingTimers(),
      titleAfterFamily: document.getElementById('qTitle').textContent,
      srAfterFamily: srText(),  // F5: stage 2 must be announced like a new question
    };
    optionsEl.children[0].click();                         // exact language (stage 2)
    twoStage.pendingAfterComplete = pendingTimers();
    const t = pendingTimers()[0];
    if (t) fireTimer(t.id);
    twoStage.qAfterTimerFire = stats().q;
  } else {
    optionsEl.children[0].click();                         // answer this round
    nextBtn.click();                                       // manual advance (cancels timer)
  }
}
out.expertTwoStage = twoStage;

// A pending timer is cancelled by a mode switch; firing the stale
// handle afterwards must not touch the fresh run. The current Expert
// round here is the run's SECOND two-stage round (the hunt above ends
// on the round after the first two-stage, and buildOrder deals Expert
// phases in ID / odd / two-stage order, two-stage last): a blind
// first click may be only a stage-1 family pick, and a CORRECT family
// pick completes nothing — it swaps in stage 2 and schedules no
// timer. So click through a possible stage-2 swap-in: this setup must
// guarantee a genuinely pending timer, whatever the shuffle dealt.
// (Regression: this flaked in CI whenever the shuffled first family
// button was the correct one.)
optionsEl.children[0].click();                             // answer current Expert round
if (!pendingTimers().length) optionsEl.children[0].click();  // finish a stage-2 swap-in
const staleAfterSwitch = pendingTimers()[0];
out.modeSwitchHadTimer = !!staleAfterSwitch;
document.getElementById('modeHardBtn').click();            // setMode('hard')
out.modeSwitchPendingAfter = pendingTimers();
if (staleAfterSwitch) fireTimer(staleAfterSwitch.id);
out.modeSwitchAfterStaleFire = { q: stats().q, tag: qTag.textContent };

// Same for Play again (restart) in Hard, where the answered round's
// timer is pending at the moment of the restart. Hard round 1 is
// always a fragment (buildOrder deals fragments first) and any
// fragment answer completes the round, so one click already
// guarantees the timer; the guarded second click is defence in depth
// mirroring the mode-switch setup — a no-op while that order holds.
optionsEl.children[0].click();                             // answer Hard round 1
if (!pendingTimers().length) optionsEl.children[0].click();  // finish a stage-2 swap-in
const staleAfterRestart = pendingTimers()[0];
out.restartHadTimer = !!staleAfterRestart;
document.getElementById('restartBtn').click();
out.restartPendingAfter = pendingTimers();
if (staleAfterRestart) fireTimer(staleAfterRestart.id);
out.restartAfterStaleFire = { q: stats().q, tag: qTag.textContent };

// --- Expert round helpers -------------------------------------------------
// Shared by the family-error hunt and the draw simulation below:
// read the scoreboard back, and play a round with blind answers (a
// correct two-stage family pick swaps in stage 2 — complete it too).
const scoreNow = () => parseInt(document.getElementById('statScore').textContent, 10);
const titleNow = () => document.getElementById('qTitle').textContent;
const feedbackNow = () => document.getElementById('feedbackEl').innerHTML;

function playGenericRound() {
  optionsEl.children[0].click();
  // A correct two-stage family pick swaps in stage 2: complete it too.
  if (titleNow().indexOf('Family correct') === 0) optionsEl.children[0].click();
  nextBtn.click();
}

// --- Expert two-stage family error (F7) -----------------------------------
// A wrong family pick must log a unit-consistent review entry: the
// correct answer names the language AND its family ("Jot
// (Combinators)"), not the bare language against a family pick. Hunt
// a two-stage round in fresh Expert runs, pick a wrong family, play
// the run out, and search the serialized review for the entry.
let famErr = null;
{
  let runs = 0;
  while (!famErr && runs < 20) {
    runs++;
    document.getElementById('modeExpertBtn').click();  // fresh Expert run
    for (let round = 0; round < 15; round++) {
      if (qTag.textContent.indexOf('Two-stage') >= 0) {
        const entry = twoData.find(
          e => e.code === document.getElementById('codeEl').textContent);
        optionsEl.children.find(
          b => b.getAttribute('data-name') !== entry.family).click();
        famErr = { lang: entry.lang, family: entry.family };
        nextBtn.click();
      } else {
        playGenericRound();
      }
    }
  }
  if (famErr) {
    // The review markup is built with escapeHtml(); escape the needle
    // the same way (family names contain '&').
    const esc = s => s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    famErr.reviewHit = document.getElementById('reviewEl').innerHTML
      .indexOf(esc(famErr.lang + ' (' + famErr.family + ')')) >= 0;
  }
}
out.expertFamilyError = famErr;

// --- Expert draw simulation -------------------------------------------------
// 500 fresh Expert runs, played out with blind answers. Each round's
// entry is identified from the page's own injected pools — the tag
// selects the pool, the displayed code the entry within it (odd
// entries all share one generic prompt as their code, so they are
// matched by the snippet languages on the option buttons instead) —
// so the Python tests can assert the composition (6 identification +
// 4 odd-one-out + 5 two-stage) and the no-language-twice rule over
// exactly what buildOrder dealt.
const idData = JSON.parse(
  script.match(/var EXPERT_ID = (\[[\s\S]*?\n\]);/)[1]);
const oddData = JSON.parse(
  script.match(/var EXPERT_ODD = (\[[\s\S]*?\n\]);/)[1]);
const expertDraws = [];
for (let run = 0; run < 500; run++) {
  document.getElementById('modeExpertBtn').click();  // fresh Expert run
  const drawn = [];
  for (let round = 0; round < 15; round++) {
    const code = document.getElementById('codeEl').textContent;
    const tag = qTag.textContent;
    let entry;
    if (tag.indexOf('Odd one out') >= 0) {
      const names = optionsEl.children
        .map(b => b.getAttribute('data-name')).sort().join('|');
      entry = oddData.find(e => e.snippets
        .map(s => s.lang).sort().join('|') === names);
    } else {
      const poolSim = tag.indexOf('Identification') >= 0 ? idData : twoData;
      entry = poolSim.find(e => e.code === code);
    }
    if (!entry) throw new Error('expert round not identifiable: ' + tag);
    drawn.push([entry.kind, entry.lang]);
    playGenericRound();
  }
  expertDraws.push(drawn);
}
out.expertDraws = expertDraws;

// --- Commands mode --------------------------------------------------------
// Identify the current round's entry from the page's own injected
// COMMANDS data, matched by the rendered title + code block (meaning
// rounds show the symbol, reverse rounds show the ask phrase) — the
// same no-guessing technique as the two-stage hunt above.
const cmdData = JSON.parse(
  script.match(/var COMMANDS = (\[[\s\S]*?\n\]);/)[1]);
out.commandsPoolSize = cmdData.length;
const cmdTitle = () => document.getElementById('qTitle').textContent;
const cmdEntry = () => {
  const code = document.getElementById('codeEl').textContent;
  return cmdData.find(c =>
    (cmdTitle() === c.lang + ' — what does this command do?' && code === c.symbol) ||
    (cmdTitle() === 'In ' + c.lang + ', which command ' + c.ask + '?' && code === c.ask));
};
const cmdKind = () => qTag.textContent.indexOf('Reverse') >= 0 ? 'reverse' : 'meaning';
const cmdOpts = () => optionsEl.children.map(b => b.getAttribute('data-name'));
const cmdCorrectBtn = (entry) => optionsEl.children.find(
  b => b.getAttribute('data-name') === (cmdKind() === 'reverse' ? entry.symbol : entry.effect));

// Flow run, fully instrumented: correct answer = +100 and exactly one
// 1200 ms timer; the single hint costs 25 and the streak, and a second
// hint is refused; the results review shows a command fact.
document.getElementById('modeCommandsBtn').click();       // setMode('commands')
out.commandsPressed = {
  normal: document.getElementById('modeNormalBtn').getAttribute('aria-pressed'),
  hard: document.getElementById('modeHardBtn').getAttribute('aria-pressed'),
  expert: document.getElementById('modeExpertBtn').getAttribute('aria-pressed'),
  commands: document.getElementById('modeCommandsBtn').getAttribute('aria-pressed'),
};
const cmdFlow = {};
const cmdDraws = [];
{
  const runDraw = [];
  let firstFact = null;
  const meaningShorts = [];
  for (let round = 0; round < 12; round++) {
    const entry = cmdEntry();
    if (!entry) throw new Error('commands round not identifiable: ' + cmdTitle());
    if (round === 0) firstFact = entry.fact;
    if (cmdKind() === 'meaning') meaningShorts.push(entry.short);
    runDraw.push({ lang: entry.lang, sym: entry.symbol, kind: cmdKind(),
                   opts: cmdKind() === 'meaning' ? cmdOpts() : null });
    const before = scoreNow();
    if (round === 1) {
      document.getElementById('hintBtn').click();          // the run's one hint
      cmdFlow.hintDelta = scoreNow() - before;             // expect -25
      cmdFlow.hintStreak = stats().streak;                 // expect '0'
      cmdFlow.hintsStatAfterHint = stats().hints;          // expect '1 / 1'
    }
    if (round === 2) {
      document.getElementById('hintBtn').click();          // second hint: refused
      cmdFlow.secondHintDelta = scoreNow() - before;       // expect 0
    }
    cmdCorrectBtn(entry).click();
    if (round === 0) {
      cmdFlow.firstDelta = scoreNow() - before;            // expect +100
      cmdFlow.timersAfterFirst = pendingTimers();
    }
    nextBtn.click();
  }
  cmdDraws.push(runDraw);
  cmdFlow.finalScore = document.getElementById('finalScore').textContent;
  cmdFlow.bdCorrect = document.getElementById('bdCorrect').textContent;
  cmdFlow.srAtResults = srText();                          // S2: results announced
  // reviewEl.innerHTML is SERIALIZED html: quiz.js builds the review
  // with escapeHtml(), so a fact containing & < > appears escaped
  // (&amp; &lt; &gt;) in the markup. Searching for the RAW fact fails
  // whenever such a command is drawn first (≈2 in 45 suite runs —
  // SNUSP '>' and the two ><> facts are the live cases). Escape the
  // needle with the same rules before the containment check; the
  // assertion still pins the exact fact text of the drawn round.
  const escapeForHtml = s => s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  cmdFlow.reviewHasFact =
    document.getElementById('reviewEl').innerHTML
      .indexOf(escapeForHtml(firstFact)) >= 0;
  // F13: every meaning round was answered correctly, so each one's
  // review meta line must carry the command's SHORT effect form
  // (9 meaning rounds are guaranteed per run — deterministic).
  const reviewHtml = document.getElementById('reviewEl').innerHTML;
  cmdFlow.reviewShortsAllPresent = meaningShorts.length === 9 &&
    meaningShorts.every(s => reviewHtml.indexOf(escapeForHtml(s)) >= 0);
}
out.commandsFlow = cmdFlow;

// Draw simulation: 199 more fresh Commands runs, answered correctly
// (with the flow run above that makes 200 simulated runs).
for (let run = 0; run < 199; run++) {
  document.getElementById('modeCommandsBtn').click();
  const runDraw = [];
  for (let round = 0; round < 12; round++) {
    const entry = cmdEntry();
    if (!entry) throw new Error('commands round not identifiable: ' + cmdTitle());
    runDraw.push({ lang: entry.lang, sym: entry.symbol, kind: cmdKind(),
                   opts: cmdKind() === 'meaning' ? cmdOpts() : null });
    cmdCorrectBtn(entry).click();
    nextBtn.click();
  }
  cmdDraws.push(runDraw);
}
out.commandsDraws = cmdDraws;

// --- Study view -----------------------------------------------------------
// The reference content is rendered once at load; read it straight off
// the built DOM (section = h3 + code-wrap>pre + fact paragraph for
// languages; h3 + table for commands, header row then one row per
// command in stored order).
out.studyLangEntries = document.getElementById('studyLangs').children.map(sec => ({
  name: sec.children[0].textContent,
  code: sec.children[1].children[0].textContent,
  fact: sec.children[2].textContent,
}));
out.studyCmdGroups = document.getElementById('studyCmds').children.map(sec => ({
  lang: sec.children[0].textContent,
  rows: sec.children[1].children.slice(1)
    .filter(tr => tr.className !== 'fact-row')
    .map(tr => [tr.children[0].textContent, tr.children[1].textContent]),
  // S3: each command row is followed by a muted fact row (colspan cell).
  facts: sec.children[1].children.slice(1)
    .filter(tr => tr.className === 'fact-row')
    .map(tr => tr.children[0].textContent),
}));
const pressedAll = () => ({
  normal: document.getElementById('modeNormalBtn').getAttribute('aria-pressed'),
  hard: document.getElementById('modeHardBtn').getAttribute('aria-pressed'),
  expert: document.getElementById('modeExpertBtn').getAttribute('aria-pressed'),
  commands: document.getElementById('modeCommandsBtn').getAttribute('aria-pressed'),
  study: document.getElementById('studyBtn').getAttribute('aria-pressed'),
});
const studyShown = () => document.getElementById('studyView').classList.contains('show');

// Entering Study mid-run cancels a pending auto-advance timer: answer
// a Hard fragment (always completes its round, so a timer is pending),
// switch to Study, and firing the stale handle must do nothing.
document.getElementById('modeHardBtn').click();           // fresh Hard run
optionsEl.children[0].click();                            // answer round 1
const studyStale = pendingTimers()[0];
document.getElementById('studyBtn').click();              // enter Study
out.studyEnter = {
  hadTimer: !!studyStale,
  pendingAfter: pendingTimers(),
  pressed: pressedAll(),
  studyShown: studyShown(),
  quizDisplay: document.getElementById('quizView').style.display,
  modeNote: document.getElementById('modeNote').textContent,
  sr: srText(),
};
if (studyStale) fireTimer(studyStale.id);
out.studyAfterStaleFire = { q: stats().q, studyShown: studyShown() };

// Study Back-to-quiz resume (F2): enter Study mid-feedback on a Hard
// run, come Back, and the round must be exactly as left — same
// question, feedback, score and Next state — then advance normally.
// (Entering Study cleared the auto-advance timer, so the round waits
// for the manual Next click below.)
document.getElementById('modeHardBtn').click();           // fresh Hard run (from Study: always allowed)
optionsEl.children[0].click();                            // answer round 1: feedback visible
const resumeBefore = {
  q: stats().q, score: stats().score,
  title: document.getElementById('qTitle').textContent,
  feedback: feedbackNow(),
  nextShown: nextBtn.classList.contains('show'),
};
document.getElementById('studyBtn').click();              // enter Study mid-feedback
document.getElementById('studyBackBtn').click();          // Back: resume as left
out.studyResume = {
  before: resumeBefore,
  after: {
    q: stats().q, score: stats().score,
    title: document.getElementById('qTitle').textContent,
    feedback: feedbackNow(),
    nextShown: nextBtn.classList.contains('show'),
    studyShown: studyShown(),
    quizDisplay: document.getElementById('quizView').style.display,
    modeNote: document.getElementById('modeNote').textContent,
    pressed: pressedAll(),
    sr: srText(),
  },
};
nextBtn.click();                                          // the resumed run advances normally
out.studyResume.afterNextQ = stats().q;

// Returning via a mode tab: Study hides, the quiz view is back, the
// pressed states flip back, and a fresh run starts normally.
document.getElementById('studyBtn').click();              // enter Study again
document.getElementById('modeNormalBtn').click();
out.studyReturn = {
  q: stats().q,
  studyShown: studyShown(),
  quizDisplay: document.getElementById('quizView').style.display,
  pressed: pressedAll(),
};

// --- Same-mode tab guard (F12) --------------------------------------------
// Clicking the already-active tab mid-run must be a complete no-op
// (question, score and even the pending auto-advance timer survive);
// the same click on the results screen restarts like play-again.
document.getElementById('modeHardBtn').click();           // fresh Hard run (different mode)
optionsEl.children[0].click();                            // answer round 1 (timer pending)
const guardBefore = { q: stats().q, score: stats().score, pending: pendingTimers().length };
document.getElementById('modeHardBtn').click();           // same tab mid-run: no-op
out.sameTabMidRun = {
  before: guardBefore,
  after: { q: stats().q, score: stats().score, pending: pendingTimers().length },
};
nextBtn.click();                                          // -> round 2 (cancels the timer)
for (let i = 0; i < 14; i++) {                            // play rounds 2..15 out
  if (document.getElementById('resultsView').classList.contains('show')) break;
  optionsEl.children[0].click();
  nextBtn.click();
}
out.sameTabResultsShown =
  document.getElementById('resultsView').classList.contains('show');
document.getElementById('modeHardBtn').click();           // same tab on results: fresh run
out.sameTabAfterResultsClick = {
  q: stats().q, score: stats().score,
  resultsShown: document.getElementById('resultsView').classList.contains('show'),
};

console.log(JSON.stringify(out));
