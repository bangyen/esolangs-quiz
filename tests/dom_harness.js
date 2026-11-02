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
//   pairing       Expert pairing scenarios, collected over fresh Expert
//                 runs until all five have been seen: a correct Same
//                 completes at once (+100, no stage 2); a correct
//                 Different moves to stage 2 with NO score change and
//                 NO timer, then naming excerpt B scores +100 (one
//                 timer) or a wrong name −50; a wrong stage-1 call in
//                 either direction ends the round at −50 with the
//                 named-pair feedback
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
              srAfterLoad: srText(), srAfterAdvance: null, modePressed: null };

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
// phases in ID / odd / two-stage / pairing order): a blind first click
// is only a stage-1 family pick, and a CORRECT family pick completes
// nothing — it swaps in stage 2 and schedules no timer (the same is
// true of a correct pairing "Different"). So click through a possible
// stage-2 swap-in: this setup must guarantee a genuinely pending
// timer, whatever the shuffle dealt. (Regression: this flaked in CI
// whenever the shuffled first family button was the correct one.)
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

// --- Expert pairing (two-stage format) -----------------------------------
// Play fresh Expert runs until all five scenarios have been collected
// (the pool is 8 same / 8 different, drawn 3 per run with a preference
// against the previous run's entries, so a handful of runs suffices).
// The current entry is identified from the page's own injected
// EXPERT_PAIR data, matched by the displayed excerpts — no guessing.
const pairData = JSON.parse(
  script.match(/var EXPERT_PAIR = (\[[\s\S]*?\n\]);/)[1]);
const pairScen = {};
const scoreNow = () => parseInt(document.getElementById('statScore').textContent, 10);
const titleNow = () => document.getElementById('qTitle').textContent;
const feedbackNow = () => document.getElementById('feedbackEl').innerHTML;

function playGenericRound() {
  optionsEl.children[0].click();
  // A correct two-stage family pick swaps in stage 2: complete it too.
  if (titleNow().indexOf('Family correct') === 0) optionsEl.children[0].click();
  nextBtn.click();
}

function handlePairRound() {
  const entry = pairData.find(e =>
    document.getElementById('codeEl').textContent ===
    '— EXCERPT A —\n' + e.codeA + '\n\n— EXCERPT B —\n' + e.codeB);
  const byName = n => optionsEl.children.find(b => b.getAttribute('data-name') === n);
  const before = scoreNow();
  if (!entry) { byName('Yes').click(); nextBtn.click(); return; }
  if (entry.same) {
    if (!pairScen.sameCorrect) {
      byName('Yes').click();
      pairScen.sameCorrect = {
        delta: scoreNow() - before,
        stage2Shown: titleNow() === 'What language is the second excerpt?',
        pendingAfter: pendingTimers().length,
      };
    } else if (!pairScen.wrongDiffCallOnSame) {
      byName('No').click();
      pairScen.wrongDiffCallOnSame = {
        delta: scoreNow() - before,
        feedback: feedbackNow(),
        pendingAfter: pendingTimers().length,
      };
    } else {
      byName('Yes').click();
    }
  } else {
    if (!pairScen.diffStage) {
      byName('No').click();
      const mid = {
        midDelta: scoreNow() - before,
        midPending: pendingTimers().length,
        midTitle: titleNow(),
        langB: entry.langB,
      };
      byName(entry.langB).click();
      pairScen.diffStage = Object.assign(mid, {
        finalDelta: scoreNow() - before,
        pendingAfter: pendingTimers().length,
      });
    } else if (!pairScen.diffWrongName) {
      byName('No').click();
      optionsEl.children.find(
        b => b.getAttribute('data-name') !== entry.langB).click();
      pairScen.diffWrongName = {
        finalDelta: scoreNow() - before,
        feedback: feedbackNow(),
        pendingAfter: pendingTimers().length,
        langB: entry.langB,
      };
    } else if (!pairScen.wrongSameCallOnDifferent) {
      byName('Yes').click();
      pairScen.wrongSameCallOnDifferent = {
        delta: scoreNow() - before,
        feedback: feedbackNow(),
        pendingAfter: pendingTimers().length,
      };
    } else {
      byName('No').click();
      byName(entry.langB).click();
    }
  }
  nextBtn.click();  // advance (cancels any pending auto-advance timer)
}

let pairRuns = 0;
while (Object.keys(pairScen).length < 5 && pairRuns < 20) {
  pairRuns++;
  document.getElementById('modeExpertBtn').click();  // fresh Expert run
  for (let round = 0; round < 15; round++) {
    if (qTag.textContent.indexOf('Pairing') >= 0) handlePairRound();
    else playGenericRound();
  }
}
out.pairing = pairScen;
out.pairingRuns = pairRuns;

console.log(JSON.stringify(out));
