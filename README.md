# Esolangs Quiz

![Esolangs Quiz](assets/og-image.svg)

**Name that Hello World** — guess the esoteric programming language from its
"Hello, World!" program.

Play it live: **https://bangyen.github.io/esolangs-quiz/**

No timer, no typing — every round is tap/click only (keys 1–8 work on a
keyboard). Answers give one short line of feedback; outside Normal the
explanatory fact about each language is saved for the results review, so a
fact from one round can't help with a later one.

## Modes

| Mode | Rounds per run | Pools (size → drawn) | Options | Hints | Scoring |
| --- | --- | --- | --- | --- | --- |
| Normal | 12 | Questions 30 → 12 | 4 | Free, unlimited | 1 point per correct answer |
| Hard | 15 | Fragments 24 → 6 · Reverse 14 → 3 · Wide 18 → 6 | 4 (fragments, reverse) · 8 (wide) | 1 per run, −25 pts and your streak | +100 per correct answer |
| Expert | 15 | Identification 24 → 6 · Odd-one-out 14 → 4 · Two-stage 16 → 5 | 8 (identification) | None | +100 correct · −50 wrong |
| Commands | 12 | Commands 80 → 12 (9 meaning + 3 reverse) | 4 | 1 per run, −25 pts and your streak | +100 per correct answer |

- **Normal** — famous esolangs (Brainfuck, LOLCODE, Shakespeare, Chef, …),
  full programs, plain name-only options.
- **Hard** — the telltales are cut: fragments are a 1–2 line middle excerpt
  (no `HAI`, no recipe header, no `IT'S SHOWTIME`), and every option comes
  from the same close family. Reverse rounds name a language and offer four
  genuine candidates from other languages in its family. Wide rounds offer
  8 options, including Piet as an actual program image and raw, invisible
  Whitespace.
- **Expert** — a deep pool of obscure languages (Thue, FALSE, SNUSP,
  Brainbool, Smallfuck, `///`, Underload, Iota, Jot, Lazy K, …), plus
  odd-one-out rounds (four snippets, one not of the family), two-stage
  rounds (commit to a family first — wrong family ends the round — then
  the exact language).
- **Commands** — not whole programs but single instructions: 80 commands
  across 10 languages (Brainfuck, COW, Ook!, Befunge, Whitespace, FALSE,
  SNUSP, `><>`, Brainbool, INTERCAL). Meaning rounds show one command and
  ask what it does, with the tempting wrong answers drawn from sibling
  commands and from the same symbol's meaning in another language
  (Brainfuck's byte-wise `+` against Brainbool's bit-wise one); reverse
  rounds name an effect and ask which command does it. Like Hard and
  Expert, a finished round advances itself after a short pause.

Alongside the modes, the header's **Study** toggle opens a reference
view — not a fifth mode, with no scoring or state: every Normal-pool
language's Hello World and fact, alphabetical, and a command table
for each Commands language (symbol → effect, verbatim from the same
data the quiz draws from). Entering Study mid-run cancels any pending
auto-advance; its **Back to quiz** button resumes the run exactly as
left, while picking a mode tab returns to the quiz with a fresh run,
exactly like a mode switch.

## How the draws work

Every pool is larger than the number of rounds it serves. Each run draws
its rounds at random from the pool, preferring entries the previous run
of that phase did not serve, and Hard/Expert additionally avoid repeating
a language across phases within a run where the pools allow it — so a
replay is a genuinely different set of questions, not the same fixed set
reshuffled.

## Building and testing

The site is a single self-contained `index.html` at the repo root, which
is what GitHub Pages serves (legacy publishing from `main`). That file is
**generated** — edit the sources, not the output:

```
src/shell.html    page shell (tokens are replaced at build time)
src/style.css     the stylesheet
src/quiz.js       game logic
src/data/*.json   the question pools (normal / hard / expert / commands)
scripts/build.py  zero-dependency build (Python 3 standard library)
assets/           the Piet program image, favicon, and social image
```

```sh
python3 scripts/build.py            # rebuild index.html from src/
python3 scripts/build.py --check    # fail if index.html is stale
python3 -m unittest discover -s tests
```

The tests pin the pool invariants (unique option sets containing the
answer exactly once, fragments ≤ 2 lines, exactly one matching reverse
candidate, two-stage languages in their declared families, pool sizes ≥ draw
counts read out of `buildOrder()`), a 500-run Expert draw simulation
(always 6 identification + 4 odd-one-out + 5 two-stage rounds, no
language spent twice in a run), and for Commands: 80 commands
with mutually distinct options, no distractor verbatim-equal to a
same-language effect, and a unique reverse question per command —
plus a 40-run draw simulation (always 9 meaning + 3 reverse rounds,
no repeated command, at most 3 rounds from one language),
check that the built page is fresh and its script parses, and pin the
playtest regressions: advancing scrolls the window to the quiz area
(never the document top, and never via a focused button that a render
is about to hide), first-load stats match restart stats, reverse
feedback names the candidate position. They
also pin the accessibility audit fixes: live-region announcements of
verdicts and question changes, focus landing on the question prompt
after a keyboard advance, `aria-pressed` on the mode buttons, and every
stylesheet text colour pair passing WCAG AA contrast. They also pin
the Study view: it renders all 30 Normal languages and all 80 command
rows from the data files (effects verbatim), and entering it cancels a
pending auto-advance timer. CI runs
both on every push and pull request to `main`.

To play a local build, open `index.html` in a browser or serve the repo
root, e.g. `python3 -m http.server`.

## License

MIT — see [LICENSE](LICENSE).
