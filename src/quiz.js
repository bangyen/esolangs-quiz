// Esolangs Quiz — game logic.
// The question pools are NOT defined here: scripts/build.py injects them
// above this file from src/data/*.json (var QUESTIONS, HARD_*, EXPERT_*).

var EXPERT_ALL = EXPERT_ID.concat(EXPERT_ODD, EXPERT_TWO, EXPERT_PAIR);

var HARD_ALL = HARD_FRAGMENTS.concat(HARD_REVERSE, HARD_WIDE);

function shuffle(arr){
  var a = arr.slice();
  for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}

var mode = 'normal';
var order = shuffle(QUESTIONS.map(function(_,i){return i;}));
var idx = 0, score = 0, streak = 0, bestStreak = 0, hintsUsed = 0, answered = false, hintShown = false;
var points = 0, correctCount = 0;
var resultsLog = [];

var codeEl=document.getElementById('codeEl'), codeNote=document.getElementById('codeNote'),
    optionsEl=document.getElementById('optionsEl'), hintBtn=document.getElementById('hintBtn'), hintBox=document.getElementById('hintBox'),
    feedbackEl=document.getElementById('feedbackEl'), nextBtn=document.getElementById('nextBtn'),
    statQ=document.getElementById('statQ'), statScore=document.getElementById('statScore'), statStreak=document.getElementById('statStreak'), statHints=document.getElementById('statHints'),
    progressBar=document.getElementById('progressBar'),
    qTitle=document.getElementById('qTitle');
var qTag=document.getElementById('qTag'), codeImg=document.getElementById('codeImg'),
    modeNote=document.getElementById('modeNote'), hintsStat=document.getElementById('hintsStat'),
    srStatus=document.getElementById('srStatus');
var studyBtn=document.getElementById('studyBtn'), studyView=document.getElementById('studyView');

// Per-mode header chrome: the one-line mode description and the score
// label ("Score" in Normal, "Points" in the points modes). This table
// is the single source for both — setMode() applies it on a mode
// switch and the startup tail applies it once for the default mode.
// Before this existed the line lived only inside setMode(), so the
// default (Normal) line never appeared on first load: the shell's
// #modeNote starts empty and nothing but a tab click ever set it (F1).
var MODE_INFO = {
  normal: { line: 'Every program prints Hello, World! — name the language.', scoreLabel: 'Score' },
  hard: { line: 'Excerpts only · +100 pts per correct · 1 hint per run (−25 pts) · facts at results.', scoreLabel: 'Points' },
  expert: { line: 'No hints · +100 pts correct · −50 pts wrong · facts at results.', scoreLabel: 'Points' },
  commands: { line: 'Name what a command does · +100 pts per correct · 1 hint per run (−25 pts) · facts at results.', scoreLabel: 'Points' }
};
function applyModeChrome(){
  modeNote.textContent = MODE_INFO[mode].line;
  document.getElementById('scoreLabel').textContent = MODE_INFO[mode].scoreLabel;
}

function pool(){ return mode==='expert' ? EXPERT_ALL : (mode==='hard' ? HARD_ALL : (mode==='commands' ? COMMANDS : QUESTIONS)); }
function currentQ(){ return pool()[order[idx]]; }
function total(){ return order.length; }
var prevWideLangs = [];
var prevNormalLangs = [];
var prevFragmentLangs = [];
var prevReverseLangs = [];
var prevExpertId = [];
var prevExpertOdd = [];
var prevExpertTwo = [];
var prevExpertPair = [];
var expertStage = 0;
var pairStage = 0;
// Commands mode: the drawn entries (pool indices into COMMANDS), which
// of them are reverse rounds (parallel to `order`), and the entry keys
// the previous Commands run served, for the fresh-draw preference.
var commandsReverse = [];
var prevCommandsKeys = [];
// Every pool is larger than the number of rounds it serves. Each run draws
// its rounds at random from the pool, preferring entries the previous run
// of that phase did not serve — so a replay gets a genuinely different set
// of questions, not the same fixed set in a reshuffled order.
function drawFrom(poolIndices, count, prevLangs, poolArr, excludeLangs){
  excludeLangs = excludeLangs || [];
  var shuffled = shuffle(poolIndices);
  // Rank candidates: fresh (not served last run) and not already used
  // earlier in this run first; last run's repeats next; a language already
  // used in this run only as a last resort, so no language is asked twice
  // in one run unless the pool leaves no alternative.
  var scored = shuffled.map(function(i){
    var lang = poolArr[i].pairLabel || poolArr[i].lang;
    var s = (prevLangs.indexOf(lang)!==-1 ? 1 : 0) + (excludeLangs.indexOf(lang)!==-1 ? 2 : 0);
    return { i:i, s:s };
  });
  scored.sort(function(a,b){ return a.s-b.s; });
  return scored.slice(0, Math.min(count, poolIndices.length)).map(function(x){ return x.i; });
}
// Commands draw: 12 entries from the 80-command pool, at most 3 from
// any one language, no command twice, preferring entries the previous
// Commands run did not serve. Exactly 3 of the 12 (from distinct
// languages where the draw allows) are marked as reverse rounds; the
// designation is shuffled, so reverse rounds are interleaved through
// the run rather than dealt as a block.
function pickCommands(){
  var shuffled = shuffle(COMMANDS.map(function(_,i){ return i; }));
  var fresh = shuffled.filter(function(i){
    return prevCommandsKeys.indexOf(COMMANDS[i].lang+'|'+COMMANDS[i].symbol)===-1;
  });
  var stale = shuffled.filter(function(i){
    return prevCommandsKeys.indexOf(COMMANDS[i].lang+'|'+COMMANDS[i].symbol)!==-1;
  });
  var picked = [], perLang = {};
  fresh.concat(stale).forEach(function(i){
    if(picked.length>=12) return;
    var lang = COMMANDS[i].lang;
    if((perLang[lang]||0)>=3) return;
    perLang[lang] = (perLang[lang]||0)+1;
    picked.push(i);
  });
  prevCommandsKeys = picked.map(function(i){ return COMMANDS[i].lang+'|'+COMMANDS[i].symbol; });
  var designations = picked.map(function(){ return 'meaning'; });
  var seenLangs = {}, marked = 0;
  shuffle(picked.map(function(_,pos){ return pos; })).forEach(function(pos){
    if(marked>=3) return;
    var lang = COMMANDS[picked[pos]].lang;
    if(seenLangs[lang]) return;
    seenLangs[lang] = true;
    designations[pos] = 'reverse';
    marked++;
  });
  // Distinct languages may not cover all 3 reverse slots if the draw
  // was language-poor; fill the rest from any remaining positions.
  if(marked<3){
    designations.forEach(function(d, pos){
      if(marked>=3) return;
      if(d==='meaning'){ designations[pos]='reverse'; marked++; }
    });
  }
  commandsReverse = designations;
  return picked;
}
function buildOrder(){
  if(mode==='commands'){
    return pickCommands();
  }
  if(mode==='expert'){
    var ei=[], eo=[], et=[], ep=[];
    EXPERT_ALL.forEach(function(q,i){ if(q.kind==='expert-odd') eo.push(i); else if(q.kind==='expert-two') et.push(i); else if(q.kind==='expert-pair') ep.push(i); else ei.push(i); });
    var eiPicked = drawFrom(ei, 6, prevExpertId, EXPERT_ALL);
    prevExpertId = eiPicked.map(function(i){ return EXPERT_ALL[i].lang; });
    var used = prevExpertId.slice();
    var eoPicked = drawFrom(eo, 3, prevExpertOdd, EXPERT_ALL, used);
    prevExpertOdd = eoPicked.map(function(i){ return EXPERT_ALL[i].lang; });
    used = used.concat(prevExpertOdd);
    var etPicked = drawFrom(et, 3, prevExpertTwo, EXPERT_ALL, used);
    prevExpertTwo = etPicked.map(function(i){ return EXPERT_ALL[i].lang; });
    used = used.concat(prevExpertTwo);
    var epPicked = drawFrom(ep, 3, prevExpertPair, EXPERT_ALL, used);
    prevExpertPair = epPicked.map(function(i){ return EXPERT_ALL[i].pairLabel; });
    return eiPicked.concat(eoPicked, etPicked, epPicked);
  }
  if(mode!=='hard'){
    var all = QUESTIONS.map(function(_,i){return i;});
    var picked = drawFrom(all, 12, prevNormalLangs, QUESTIONS);
    prevNormalLangs = picked.map(function(i){ return QUESTIONS[i].lang; });
    return picked;
  }
  var f=[], r=[], t=[];
  HARD_ALL.forEach(function(q,i){ if(q.kind==='reverse') r.push(i); else if(q.kind==='wide') t.push(i); else f.push(i); });
  var fPicked = drawFrom(f, 6, prevFragmentLangs, HARD_ALL);
  prevFragmentLangs = fPicked.map(function(i){ return HARD_ALL[i].lang; });
  var usedLangs = prevFragmentLangs.slice();
  var rPicked = drawFrom(r, 3, prevReverseLangs, HARD_ALL, usedLangs);
  prevReverseLangs = rPicked.map(function(i){ return HARD_ALL[i].lang; });
  usedLangs = usedLangs.concat(prevReverseLangs);
  var tPicked = drawFrom(t, 6, prevWideLangs, HARD_ALL, usedLangs);
  prevWideLangs = tPicked.map(function(i){ return HARD_ALL[i].lang; });
  return fPicked.concat(rPicked, tPicked);
}
function render(){
  var q = currentQ();
  answered=false; hintShown=false; expertStage=0; pairStage=0;
  var isHard = mode==='hard';
  var isExpert = mode==='expert';
  var kind = (isHard || isExpert) ? (q.kind||'fragment') : 'normal';
  if(mode==='commands') kind = commandsReverse[idx]==='reverse' ? 'cmd-reverse' : 'cmd-meaning';

  if(kind==='cmd-meaning'){
    qTag.textContent='Commands · Meaning';
    qTitle.textContent=q.lang+' — what does this command do?';
  } else if(kind==='cmd-reverse'){
    qTag.textContent='Commands · Reverse';
    qTitle.textContent='In '+q.lang+', which command '+q.ask+'?';
  } else if(kind==='expert-id'){
    qTag.textContent='Expert · Identification';
    qTitle.textContent='What language is this?';
  } else if(kind==='expert-odd'){
    qTag.textContent='Expert · Odd one out';
    qTitle.textContent='Tap the one that doesn’t belong.';
  } else if(kind==='expert-two'){
    qTag.textContent='Expert · Two-stage · Family';
    qTitle.textContent='Which family is this from?';
  } else if(kind==='expert-pair'){
    qTag.textContent='Expert · Pairing';
    qTitle.textContent='Same language — or different? If different, name the second one.';
  } else if(kind==='reverse'){
    qTag.textContent='Hard · Reverse';
    qTitle.textContent='Which excerpt is '+q.lang+'?';
  } else if(kind==='wide'){
    qTag.textContent='Hard · 8 options';
    qTitle.textContent='What language is this?';
  } else if(isHard){
    qTag.textContent='Hard · Excerpt';
    qTitle.textContent='What language is this?';
  } else {
    qTag.textContent='Normal';
    qTitle.textContent='What language is this?';
  }

  if(kind==='wide' && q.type==='image'){
    codeEl.style.display='none'; codeImg.classList.add('show');
  } else if(kind==='expert-pair'){
    codeEl.style.display=''; codeImg.classList.remove('show');
    codeEl.textContent = '— EXCERPT A —\n' + q.codeA + '\n\n— EXCERPT B —\n' + q.codeB;
  } else if(kind==='cmd-meaning'){
    codeEl.style.display=''; codeImg.classList.remove('show');
    codeEl.textContent = q.symbol;
  } else if(kind==='cmd-reverse'){
    codeEl.style.display=''; codeImg.classList.remove('show');
    codeEl.textContent = q.ask;
  } else {
    codeEl.style.display=''; codeImg.classList.remove('show');
    codeEl.textContent = q.code;
  }
  codeNote.textContent = q.note;
  hintBox.className='hint-box'; hintBox.innerHTML='';
  var limitedHint = isHard || mode==='commands';
  var hardHintLeft = !limitedHint || hintsUsed < 1;
  hintBtn.disabled = !hardHintLeft;
  hintBtn.style.display = isExpert ? 'none' : '';
  hintBtn.textContent = limitedHint ? (hardHintLeft ? 'Hint (−25 pts)' : 'Hint used') : 'Hint';
  hintsStat.style.display = isExpert ? 'none' : '';
  feedbackEl.className='feedback'; feedbackEl.innerHTML='';
  nextBtn.className='btn-next';
  nextBtn.textContent = (idx===order.length-1) ? 'See results' : 'Next';

  optionsEl.innerHTML='';
  if(kind==='expert-odd'){
    optionsEl.className='options snippets';
    var osnips = shuffle(q.snippets.map(function(sn,i){ return {sn:sn, orig:i}; }));
    osnips.forEach(function(item, pos){
      var b=document.createElement('button');
      b.type='button'; b.className='opt snippet'; b.setAttribute('data-name', item.sn.lang);
      b.setAttribute('aria-label', 'Candidate '+(pos+1));
      var pre=document.createElement('pre'); pre.textContent=item.sn.code;
      b.appendChild(pre);
      b.addEventListener('click', function(){ answer(item.sn.lang, b); });
      optionsEl.appendChild(b);
    });
  } else if(kind==='expert-pair'){
    optionsEl.className='options';
    [['Yes','Yes — same language'],['No','No — different languages']].forEach(function(optDef){
      var b=document.createElement('button');
      b.type='button'; b.className='opt'; b.setAttribute('data-name', optDef[0]);
      b.innerHTML='<span class="name"></span>';
      b.querySelector('.name').textContent=optDef[1];
      b.addEventListener('click', function(){ answerPair(optDef[0], b); });
      optionsEl.appendChild(b);
    });
  } else if(kind==='expert-two'){
    optionsEl.className='options';
    var fams = shuffle(Object.keys(EXPERT_FAMILIES));
    fams.forEach(function(fam){
      var b=document.createElement('button');
      b.type='button'; b.className='opt'; b.setAttribute('data-name', fam);
      b.innerHTML='<span class="name"></span>';
      b.querySelector('.name').textContent=fam;
      b.addEventListener('click', function(){ answerExpertFamily(fam, b); });
      optionsEl.appendChild(b);
    });
  } else if(kind==='cmd-meaning'){
    optionsEl.className='options';
    shuffle([q.effect].concat(q.distractors)).forEach(function(text){
      var b=document.createElement('button');
      b.type='button'; b.className='opt'; b.setAttribute('data-name', text);
      b.innerHTML='<span class="name"></span>';
      b.querySelector('.name').textContent=text;
      b.addEventListener('click', function(){ answerCommand(text, b); });
      optionsEl.appendChild(b);
    });
  } else if(kind==='cmd-reverse'){
    optionsEl.className='options';
    var sibs = shuffle(COMMANDS.filter(function(c){ return c.lang===q.lang && c.symbol!==q.symbol; }))
      .slice(0,3).map(function(c){ return c.symbol; });
    shuffle([q.symbol].concat(sibs)).forEach(function(sym){
      var b=document.createElement('button');
      b.type='button'; b.className='opt'; b.setAttribute('data-name', sym);
      b.innerHTML='<span class="name"></span>';
      b.querySelector('.name').textContent=sym;
      b.addEventListener('click', function(){ answerCommand(sym, b); });
      optionsEl.appendChild(b);
    });
  } else if(kind==='reverse'){
    optionsEl.className='options snippets';
    var snips = shuffle(q.snippets.map(function(sn,i){ return {sn:sn, orig:i}; }));
    snips.forEach(function(item, pos){
      var b=document.createElement('button');
      b.type='button'; b.className='opt snippet'; b.setAttribute('data-name', item.sn.lang);
      b.setAttribute('aria-label', 'Candidate '+(pos+1));
      var pre=document.createElement('pre'); pre.textContent=item.sn.code;
      b.appendChild(pre);
      b.addEventListener('click', function(){ answer(item.sn.lang, b); });
      optionsEl.appendChild(b);
    });
  } else {
    optionsEl.className = (kind==='wide' || kind==='expert-id') ? 'options wide' : 'options';
    var names = (isHard || kind==='expert-id') ? shuffle(q.options.slice()) : shuffle([q.lang].concat(DISTRACTORS[q.lang]||[]));
    names.forEach(function(name){
      var b=document.createElement('button');
      b.type='button'; b.className='opt'; b.setAttribute('data-name', name);
      // Name only, in every mode — no per-option captions.
      b.innerHTML='<span class="name"></span>';
      b.querySelector('.name').textContent=name;
      b.addEventListener('click', function(){ answer(name, b); });
      optionsEl.appendChild(b);
    });
  }
  updateStats();
  // Announce the new question to assistive tech (visually hidden live
  // region); the verdict itself is announced via #feedbackEl's
  // aria-live. Without this, a screen-reader run changes silently.
  srStatus.textContent = 'Question '+(idx+1)+' of '+total()+'. '+qTitle.textContent;
}

// Bring the quiz area (stats + card) to the top of the viewport — never the
// whole page. This used to scroll #quizView into view natively, and a live
// playtest showed advancing still landed at the document top on tall
// Hard/Expert rounds. Root cause: the clicked Next button still holds focus
// when render() strips its .show class, leaving a focused element at
// display:none; the browser's focus/scroll-anchoring reaction to that
// cancels the in-flight smooth scrollIntoView and drops the page at the
// document top (invisible on short rounds, where the top is the quiz area
// anyway). The header is a sibling before #quizView, not inside it, so
// target alignment was never the problem. Fix: callers blur the active
// element before rendering (see the Next/restart handlers), and this
// helper scrolls the window directly to the element's measured document
// offset instead of relying on scrollIntoView; style.css also sets
// overflow-anchor:none so scroll anchoring cannot fight the scroll.
function scrollToEl(el){
  if(!el) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var y = el.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0);
  window.scrollTo({top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth'});
}

// The advance/restart buttons hide themselves (or their whole view) as
// part of the transition; a focused element must never be the one that
// disappears, per the scroll bug above.
function blurActive(){
  var a = document.activeElement;
  if(a && a.blur) a.blur();
}

// Focus landing after an advance. Pointer users keep the blur-to-body
// behaviour above (focus must be off the vanishing Next button before
// render, or the scroll breaks). A keyboard advance instead lands focus
// on the question prompt (tabindex="-1": a landing point, not a tab
// stop) AFTER the scroll, with preventScroll so the focus call itself
// cannot move the page — the prompt is never hidden, so focusing it
// cannot reintroduce the hidden-focused-element scroll bug, and Tab
// from it continues into the new round's options instead of restarting
// from the page top every round.
var advanceByKeyboard = false;
function focusQuestionPrompt(){
  if(qTitle && qTitle.focus) qTitle.focus({preventScroll:true});
}

// Auto-advance (Hard/Expert only): when a round completes, move on after
// a short pause so the verdict line can register — Normal keeps its
// manual Next because its feedback carries a fact paragraph to read.
// Exactly one timer can be pending: scheduling clears any old handle,
// and every other path out of a round (manual Next, restart, mode
// switch, a new run) clears it too, so a stale timer can never advance
// a fresh run or double-advance the current one. The timer fires the
// Next button itself, so a timer advance is literally the pointer
// advance path (blur, measured scroll, no focus jump) — never the
// keyboard path, and never a second copy of the advance logic.
var AUTO_ADVANCE_MS = 1200;
var autoAdvanceTimer = null;
function clearAutoAdvance(){
  if(autoAdvanceTimer!==null){ clearTimeout(autoAdvanceTimer); autoAdvanceTimer=null; }
}
function scheduleAutoAdvance(){
  if(mode==='normal') return;
  clearAutoAdvance();
  autoAdvanceTimer=setTimeout(function(){
    autoAdvanceTimer=null;
    nextBtn.click();
  }, AUTO_ADVANCE_MS);
}

function updateStats(){
  statQ.textContent=(Math.min(idx+1, total()))+' / '+total();
  statScore.textContent = mode==='normal' ? score : points;
  statStreak.textContent=streak;
  statHints.textContent = (mode==='hard' || mode==='commands') ? (hintsUsed+' / 1') : hintsUsed;
  progressBar.style.width=Math.round((idx/total())*100)+'%';
}

hintBtn.addEventListener('click', function(){
  if(hintShown || answered) return;
  if(mode==='expert') return;
  if((mode==='hard' || mode==='commands') && hintsUsed>=1) return;
  var q=currentQ();
  hintShown=true; hintsUsed++;
  if(mode==='hard' || mode==='commands'){
    points=Math.max(0, points-25);
    streak=0;
    hintBox.innerHTML='<strong>Hint — </strong>'+escapeHtml(q.weakHint||'');
    hintBtn.textContent='Hint used';
  } else {
    hintBox.innerHTML='<strong>Hint — </strong>'+escapeHtml(q.hint);
    hintBtn.textContent='Hint shown';
  }
  hintBox.classList.add('show');
  hintBtn.disabled=true;
  updateStats();
});
function escapeHtml(s){var d=document.createElement('div'); d.textContent=s; return d.innerHTML;}

function finishRound(correct, lineText){
  var q=currentQ();
  feedbackEl.className='feedback show '+(correct?'good':'bad');
  // One short line. Facts stay where each mode already puts them: Normal
  // shows its fact here; Hard/Expert facts wait for the results review.
  var html = escapeHtml(lineText);
  if(mode==='normal' && q.fact){
    html += '<span class="fact">'+escapeHtml(q.fact)+'</span>';
  }
  feedbackEl.innerHTML = html;
  progressBar.style.width=Math.round(((idx+1)/total())*100)+'%';
  nextBtn.classList.add('show');
  updateStats();
  // The single round-completion point: every finished round (any Hard
  // kind; Expert identification / odd / pairing / two-stage, including
  // a wrong family pick, which also ends its round in finishRound)
  // passes through here. A correct Expert family pick does NOT — it
  // sets its feedback inline and the round continues — so it can never
  // start the timer. No-op in Normal (see scheduleAutoAdvance).
  scheduleAutoAdvance();
}

// Expert two-stage rounds, stage 1: the family gate. A wrong family ends
// the round immediately at −50; a right one swaps the options in place for
// stage 2 (exact language) without advancing the round counter.
function answerExpertFamily(fam, btn){
  if(answered || expertStage!==0) return;
  var q=currentQ();
  if(fam!==q.family){
    answered=true;
    points-=50; streak=0;
    // The review compares like with like: the pick was a family, so
    // the correct answer names the language AND its family (F7).
    resultsLog.push({lang:q.lang, picked:fam, correctAnswer:q.lang+' ('+q.family+')', correct:false, usedHint:false, fact:q.fact, kind:q.kind});
    var buttons=optionsEl.querySelectorAll('.opt');
    buttons.forEach(function(b){
      b.disabled=true;
      var n=b.getAttribute('data-name');
      if(n===q.family) b.classList.add('correct');
      else if(b===btn) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    finishRound(false, '✕ Wrong family (−50 pts) — it was '+q.lang+' ('+q.family+').');
    return;
  }
  expertStage=1;
  var btns=optionsEl.querySelectorAll('.opt');
  btns.forEach(function(b){ b.disabled=true; if(b===btn) b.classList.add('correct'); else b.classList.add('dim'); });
  qTag.textContent='Expert · Two-stage · Language';
  qTitle.textContent='Family correct — which language exactly?';
  feedbackEl.className='feedback show good';
  feedbackEl.textContent='✓ Family correct — '+q.family+'.';
  // Announce the new stage like a new question (mirrors answerPair).
  srStatus.textContent='Question '+(idx+1)+' of '+total()+'. '+qTitle.textContent;
  optionsEl.innerHTML='';
  optionsEl.className='options wide';
  shuffle(EXPERT_FAMILIES[q.family].slice()).forEach(function(name){
    var b=document.createElement('button');
    b.type='button'; b.className='opt'; b.setAttribute('data-name', name);
    b.innerHTML='<span class="name"></span>';
    b.querySelector('.name').textContent=name;
    b.addEventListener('click', function(){ answer(name, b); });
    optionsEl.appendChild(b);
  });
}

// Expert pairing rounds, stage 1: the Same/Different call. A wrong call
// ends the round at once (−50), and a correct "Same" completes it (+100) —
// both are exactly the old pairing answer, so they route through answer().
// A correct "Different" scores NOTHING yet: the round continues to stage 2,
// where the player must name the second excerpt's language for the same
// single +100 / −50. The transition below deliberately does not touch
// answered, the score, the log or finishRound() — so it cannot schedule
// the auto-advance timer either.
function answerPair(call, btn){
  if(answered || pairStage!==0) return;
  var q=currentQ();
  var correctCall = q.same ? 'Yes' : 'No';
  if(call!==correctCall || q.same){ answer(call, btn); return; }
  pairStage=1;
  qTag.textContent='Expert · Pairing · Name the second';
  qTitle.textContent='What language is the second excerpt?';
  feedbackEl.className='feedback show good';
  feedbackEl.textContent='✓ Different languages — now name the second excerpt.';
  // Announce the new stage like a new question (same live region render uses).
  srStatus.textContent='Question '+(idx+1)+' of '+total()+'. '+qTitle.textContent;
  optionsEl.innerHTML='';
  optionsEl.className='options';
  shuffle(q.options.slice()).forEach(function(name){
    var b=document.createElement('button');
    b.type='button'; b.className='opt'; b.setAttribute('data-name', name);
    b.innerHTML='<span class="name"></span>';
    b.querySelector('.name').textContent=name;
    b.addEventListener('click', function(){ answerPairSecond(name, b); });
    optionsEl.appendChild(b);
  });
}

// Expert pairing rounds, stage 2: name excerpt B's language. This is the
// round's only scoring point on the Different path — exactly one +100 or
// −50 per pairing round, however it was reached.
function answerPairSecond(name, btn){
  if(answered || pairStage!==1) return;
  answered=true;
  var q=currentQ();
  var correct = name===q.langB;
  if(correct){ points+=100; correctCount++; streak++; if(streak>bestStreak) bestStreak=streak; } else { points-=50; streak=0; }
  resultsLog.push({lang:q.pairLabel, picked:'Different — second: '+name, correctAnswer:'Different — second: '+q.langB, correct:correct, usedHint:hintShown, fact:q.fact, kind:q.kind});
  var buttons=optionsEl.querySelectorAll('.opt');
  buttons.forEach(function(b){
    b.disabled=true;
    var n=b.getAttribute('data-name');
    if(n===q.langB) b.classList.add('correct');
    else if(b===btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  var pts = correct ? ' (+100 pts)' : ' (−50 pts)';
  var line = correct ? '✓ Correct — the second excerpt is '+q.langB+pts
                     : '✕ Wrong — the second excerpt is '+q.langB+', not '+name+pts;
  finishRound(correct, line);
}

// Commands rounds (both kinds) complete here: meaning rounds are
// answered with an effect string, reverse rounds with a symbol. One
// scoring point per round (+100 / 0, Hard-style streak rules), the
// feedback line names the correct answer in short form (meaning) or
// by symbol (reverse), and the command's fact waits for the review —
// so completion flows through finishRound() and the Hard/Expert
// auto-advance applies unchanged.
function answerCommand(picked, btn){
  if(answered) return;
  answered=true;
  var q=currentQ();
  var isReverse = commandsReverse[idx]==='reverse';
  var correctAnswer = isReverse ? q.symbol : q.effect;
  var correct = picked===correctAnswer;
  if(correct){ points+=100; correctCount++; streak++; if(streak>bestStreak) bestStreak=streak; } else { streak=0; }
  // Review meta lines stay scannable (F13): for meaning rounds log
  // the command's short effect form instead of the full effect
  // sentences that live feedback uses. A distractor pick has no short
  // form of its own, so it is logged as written; the correct side
  // always uses the entry's `short` (falling back to the full effect
  // for any entry that lacks one — currently none do).
  var logPicked = picked, logCorrect = correctAnswer;
  if(!isReverse){
    logCorrect = q.short || q.effect;
    if(picked===q.effect) logPicked = logCorrect;
  }
  resultsLog.push({lang:q.lang+' — '+q.symbol, picked:logPicked,
    correctAnswer:logCorrect, correct:correct, usedHint:hintShown,
    fact:q.fact, kind:'command'});
  var buttons=optionsEl.querySelectorAll('.opt');
  buttons.forEach(function(b){
    b.disabled=true;
    var n=b.getAttribute('data-name');
    if(n===correctAnswer) b.classList.add('correct');
    else if(b===btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  var line;
  if(isReverse){
    line = correct ? '✓ Correct — the command is '+q.symbol+' (+100 pts)'
                   : '✕ Wrong — the command is '+q.symbol;
  } else {
    line = correct ? '✓ Correct — '+q.symbol+' '+q.short+' (+100 pts)'
                   : '✕ Wrong — '+q.symbol+' '+q.short;
  }
  finishRound(correct, line);
}

function answer(name, btn){
  if(answered) return;
  answered=true;
  var q=currentQ();
  var isExpert = mode==='expert';
  // For pairing rounds the "correct name" is Yes/No, not a language; for
  // odd-one-out rounds q.lang already holds the odd language.
  var correctName = q.kind==='expert-pair' ? (q.same ? 'Yes' : 'No') : q.lang;
  var correct = name===correctName;
  if(isExpert){
    if(correct){ points+=100; correctCount++; streak++; if(streak>bestStreak) bestStreak=streak; } else { points-=50; streak=0; }
  } else if(mode==='hard'){
    if(correct){ points+=100; correctCount++; streak++; if(streak>bestStreak) bestStreak=streak; } else { streak=0; }
  } else {
    if(correct){ score++; streak++; if(streak>bestStreak) bestStreak=streak; } else { streak=0; }
  }
  var buttons = optionsEl.querySelectorAll('.opt');
  // Display positions of the correct option and the player's pick, for
  // snippet rounds whose feedback must say WHICH candidate was right —
  // "answer: Labyrinth" alone leaves the player hunting for a green border.
  var btnArr = Array.prototype.slice.call(buttons);
  var correctPos = 0, pickedPos = 0;
  btnArr.forEach(function(b, i){
    if(b.getAttribute('data-name')===correctName) correctPos = i+1;
    if(b===btn) pickedPos = i+1;
  });

  var logLang = q.kind==='expert-pair' ? q.pairLabel : (q.kind==='expert-odd' ? q.lang+' — odd one out' : q.lang);
  var logPicked = name, logCorrect = correctName;
  if(q.kind==='expert-pair'){
    // Name the pair and record the player's actual claim, not just Yes/No.
    logPicked = name==='Yes' ? 'Same language' : 'Different languages';
    logCorrect = (q.same ? 'Same language' : 'Different languages')+' ('+q.langA+' vs '+q.langB+')';
  } else if(q.kind==='reverse'){
    logPicked = name+' (candidate '+pickedPos+')';
    logCorrect = q.lang+' (candidate '+correctPos+')';
  }
  resultsLog.push({lang:logLang, picked:logPicked, correctAnswer:logCorrect, correct:correct, usedHint:hintShown, fact:q.fact, kind:q.kind||'fragment'});

  buttons.forEach(function(b){
    b.disabled=true;
    var n=b.getAttribute('data-name');
    if(n===correctName) b.classList.add('correct');
    else if(b===btn) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  var pts = isExpert ? (correct ? ' (+100 pts)' : ' (−50 pts)') : (mode==='hard' && correct ? ' (+100 pts)' : '');
  var line;
  if(q.kind==='expert-pair'){
    line = correct ? '✓ Correct — '+q.langA+' vs '+q.langB+': '+(q.same ? 'same language' : 'different languages')+pts
                   : '✕ Wrong — '+q.langA+' vs '+q.langB+' are '+(q.same ? 'the same language' : 'different languages')+pts;
  } else if(q.kind==='reverse'){
    line = correct ? '✓ Correct — '+q.lang+' (candidate '+correctPos+')'+pts
                   : '✕ Wrong — '+q.lang+' was candidate '+correctPos+' · you picked the '+name+' excerpt'+pts;
  } else if(q.kind==='expert-odd'){
    line = correct ? '✓ Correct — odd one out: '+q.lang+pts
                   : '✕ Wrong — odd one out: '+q.lang+pts;
  } else if(correct){
    line = '✓ Correct — '+q.lang+pts;
  } else {
    line = '✕ Wrong — answer: '+q.lang+pts;
  }
  finishRound(correct, line);
}

nextBtn.addEventListener('click', function(){
  // Any manual advance cancels a pending auto-advance, so the round
  // moves on exactly once however the player got here.
  clearAutoAdvance();
  var keyboardAdvance = advanceByKeyboard;
  advanceByKeyboard = false;
  blurActive();
  if(idx < order.length-1){
    idx++; render(); scrollToEl(document.getElementById('quizView'));
    if(keyboardAdvance) focusQuestionPrompt();
  }
  else { showResults(); }
});

document.addEventListener('keydown', function(e){
  // In the Study view the quiz keys (digits to answer, Enter to
  // advance) must not reach the hidden run.
  if(view==='study') return;
  if(document.getElementById('resultsView').classList.contains('show')){
    if(e.key==='Enter'){ restart(); focusQuestionPrompt(); } return;
  }
  if(!answered && ['1','2','3','4','5','6','7','8'].indexOf(e.key)>=0){
    var n=parseInt(e.key,10)-1;
    var btns=optionsEl.querySelectorAll('.opt');
    if(btns[n]) btns[n].click();
  } else if(answered && (e.key==='Enter' || e.key===' ')){
    if(document.activeElement && document.activeElement.tagName==='BUTTON') return;
    e.preventDefault(); advanceByKeyboard = true; nextBtn.click();
  }
});

function showResults(){
  document.getElementById('quizView').style.display='none';
  var rv=document.getElementById('resultsView'); rv.classList.add('show');
  var isPoints = mode!=='normal';
  var count = isPoints ? correctCount : score;
  document.getElementById('finalScore').textContent = isPoints ? points : score;
  document.getElementById('finalDenom').textContent = isPoints ? ' pts' : ' / '+total();
  document.getElementById('bdCorrect').textContent = count+' / '+total();
  document.getElementById('bdBestStreak').textContent = bestStreak;
  document.getElementById('restartBtn').textContent = 'Play again';

  var rev=document.getElementById('reviewEl');
  var html = '<h2>Review</h2>';
  resultsLog.forEach(function(h){
    html+='<div class="review-item"><div><strong>'+escapeHtml(h.lang)+'</strong> <span class="'+(h.correct?'ok':'no')+'">'+(h.correct?'✓ Correct':'✕ Wrong')+'</span></div>'
      + '<div class="rmeta">Your answer: '+escapeHtml(h.picked)+' · Correct answer: '+escapeHtml(h.correctAnswer||h.lang)+'</div>'
      + (h.fact ? '<span class="rfact">'+escapeHtml(h.fact)+'</span>' : '') +'</div>';
  });
  rev.innerHTML=html;
  scrollToEl(rv);
}

function startQuiz(){
  clearAutoAdvance();
  order=buildOrder();
  idx=0; score=0; points=0; correctCount=0; streak=0; bestStreak=0; hintsUsed=0; resultsLog=[];
  document.getElementById('resultsView').classList.remove('show');
  document.getElementById('quizView').style.display='';
  render();
}
function restart(){ clearAutoAdvance(); blurActive(); startQuiz(); scrollToEl(document.getElementById('quizView')); }
document.getElementById('restartBtn').addEventListener('click', restart);

// Study view content: rendered once from the same pools the quiz
// draws from — the Normal pool's languages (alphabetical) with the
// Hello World and fact the quiz itself shows for each, and the
// Commands pool grouped by language (alphabetical; commands in their
// stored order) with each command's effect verbatim. No content is
// authored here; Study is a reference rendering of the quiz data.
function buildStudy(){
  var byLang = function(a, b){ return a.lang < b.lang ? -1 : (a.lang > b.lang ? 1 : 0); };
  var langBox = document.getElementById('studyLangs');
  QUESTIONS.slice().sort(byLang).forEach(function(q){
    var sec = document.createElement('section');
    var h = document.createElement('h3'); h.textContent = q.lang;
    var wrap = document.createElement('div'); wrap.className = 'code-wrap';
    var pre = document.createElement('pre'); pre.textContent = q.code;
    wrap.appendChild(pre);
    var fact = document.createElement('p'); fact.className = 'study-fact';
    fact.textContent = q.fact;
    sec.appendChild(h); sec.appendChild(wrap); sec.appendChild(fact);
    langBox.appendChild(sec);
  });
  var cmdBox = document.getElementById('studyCmds');
  var groups = {}, names = [];
  COMMANDS.forEach(function(c){
    if(!groups[c.lang]){ groups[c.lang] = []; names.push(c.lang); }
    groups[c.lang].push(c);
  });
  names.sort();
  names.forEach(function(lang){
    var sec = document.createElement('section');
    var h = document.createElement('h3'); h.textContent = lang;
    var table = document.createElement('table'); table.className = 'cmd-table';
    var head = document.createElement('tr');
    var thS = document.createElement('th'); thS.textContent = 'Command';
    var thE = document.createElement('th'); thE.textContent = 'Effect';
    head.appendChild(thS); head.appendChild(thE);
    table.appendChild(head);
    groups[lang].forEach(function(c){
      var tr = document.createElement('tr');
      var tdS = document.createElement('td'); tdS.className = 'sym';
      tdS.textContent = c.symbol;
      var tdE = document.createElement('td'); tdE.textContent = c.effect;
      tr.appendChild(tdS); tr.appendChild(tdE);
      table.appendChild(tr);
    });
    sec.appendChild(h); sec.appendChild(table);
    cmdBox.appendChild(sec);
  });
}

// Study is a VIEW, not a fifth mode. Entering it cancels any pending
// auto-advance (the same clearAutoAdvance path a mode switch uses),
// hides both quiz views, and leaves the run state untouched — the
// quiz view's DOM is only display:none'd, never rebuilt. Returning
// via the Back button (backToQuiz) therefore resumes the run exactly
// as left; returning via a mode tab goes through setMode(), which
// starts a fresh run exactly as a mode switch does today.
var view = 'quiz';
// Which screen Study was entered from, so Back can restore it:
// true = the results screen, false = a run in progress.
var studyFromResults = false;
function showStudy(){
  clearAutoAdvance();
  studyFromResults = document.getElementById('resultsView').classList.contains('show');
  view = 'study';
  document.getElementById('quizView').style.display = 'none';
  document.getElementById('resultsView').classList.remove('show');
  studyView.classList.add('show');
  ['modeNormalBtn', 'modeHardBtn', 'modeExpertBtn', 'modeCommandsBtn'].forEach(function(id){
    var b = document.getElementById(id);
    b.className = '';
    b.setAttribute('aria-pressed', 'false');
  });
  studyBtn.classList.add('active');
  studyBtn.setAttribute('aria-pressed', 'true');
  modeNote.textContent = 'Reference — every Hello World and command in the quiz.';
  // Announce the view switch on the same live region questions use.
  srStatus.textContent = 'Study view. Reference — every Hello World and command in the quiz.';
}

// Mirror the active mode into the tab classes + aria-pressed (the
// active mode must not be colour alone). Used by setMode() and by
// backToQuiz(), which restores the tabs for the mode still in play.
var MODE_TAB_IDS = { normal:'modeNormalBtn', hard:'modeHardBtn', expert:'modeExpertBtn', commands:'modeCommandsBtn' };
function syncModeTabs(){
  Object.keys(MODE_TAB_IDS).forEach(function(m){
    var b = document.getElementById(MODE_TAB_IDS[m]);
    b.className = m===mode ? 'active' : '';
    b.setAttribute('aria-pressed', m===mode ? 'true' : 'false');
  });
}

// Back to quiz: hide Study and re-show whichever screen was up when
// Study was entered, exactly as left — same question, feedback, score
// and Next state, because nothing rebuilt the quiz DOM meanwhile.
// Nothing is cancelled or restarted here: the auto-advance timer was
// already cleared on entering Study, so a round left mid-feedback
// simply waits for Next.
function backToQuiz(){
  view = 'quiz';
  studyView.classList.remove('show');
  studyBtn.classList.remove('active');
  studyBtn.setAttribute('aria-pressed', 'false');
  syncModeTabs();
  applyModeChrome();
  if(studyFromResults){
    document.getElementById('resultsView').classList.add('show');
    srStatus.textContent = 'Back to the quiz results.';
  } else {
    document.getElementById('quizView').style.display = '';
    srStatus.textContent = 'Back to the quiz. Question '+(idx+1)+' of '+total()+'. '+qTitle.textContent;
  }
}
document.getElementById('studyBackBtn').addEventListener('click', backToQuiz);

function setMode(m){
  // Clicking the already-active tab while its run is on screen used
  // to restart silently (a stray tap wiped score/streak/progress).
  // Ignore it (F12) — before clearAutoAdvance, so even a pending
  // auto-advance survives untouched. The same click on the results
  // screen still restarts (it acts as play-again), and returning
  // from Study or switching modes behaves as always.
  if(m===mode && view==='quiz' && !document.getElementById('resultsView').classList.contains('show')) return;
  clearAutoAdvance();
  view = 'quiz';
  studyView.classList.remove('show');
  studyBtn.classList.remove('active');
  studyBtn.setAttribute('aria-pressed', 'false');
  mode=m;
  syncModeTabs();
  applyModeChrome();
  startQuiz();
}
document.getElementById('modeNormalBtn').addEventListener('click', function(){ setMode('normal'); });
document.getElementById('modeHardBtn').addEventListener('click', function(){ setMode('hard'); });
document.getElementById('modeExpertBtn').addEventListener('click', function(){ setMode('expert'); });
document.getElementById('modeCommandsBtn').addEventListener('click', function(){ setMode('commands'); });
studyBtn.addEventListener('click', showStudy);

// Start through startQuiz (not a bare render) so the very first run is also
// a random draw from the pools, not the full pool in shuffled order.
// applyModeChrome() initialises the default mode's line + score label
// from MODE_INFO — without it they would only ever be set by a mode-tab
// click, i.e. Normal's line never appeared on first load (F1).
buildStudy();
applyModeChrome();
startQuiz();
