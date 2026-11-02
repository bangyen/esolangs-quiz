// DOM-stub harness used by tests/test_regressions.py (skipped when node
// is unavailable). It runs the built page's real inline script against a
// minimal stub DOM and prints one JSON object describing:
//   afterLoad     stats (q / score / streak / hints) right after page load
//   events        ordered scroll-related events during answer -> Next,
//                 with the Next button holding focus, as a real click does
//   afterAdvance  stats after advancing to round 2
//   afterRestart  stats after clicking Play again (restart)
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
    focus() {},
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
  getElementById(id) { if (!byId[id]) byId[id] = makeEl('div', id); return byId[id]; },
  createElement(tag) { return makeEl(tag); },
  addEventListener(t, fn) {},
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

new Function('document', 'window', script)(document, window);

const out = { afterLoad: stats(), events: null, afterAdvance: null, afterRestart: null };

const nextBtn = document.getElementById('nextBtn');
document.getElementById('optionsEl').children[0].click();  // answer round 1
document.activeElement = nextBtn;                          // a real click leaves it focused
nextBtn.click();                                           // advance
out.events = events.slice();
out.afterAdvance = stats();

document.getElementById('restartBtn').click();
out.afterRestart = stats();

console.log(JSON.stringify(out));
