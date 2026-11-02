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
    modeNote=document.getElementById('modeNote'), hintsStat=document.getElementById('hintsStat');

function pool(){ return mode==='expert' ? EXPERT_ALL : (mode==='hard' ? HARD_ALL : QUESTIONS); }
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
function buildOrder(){
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
  answered=false; hintShown=false; expertStage=0;
  var isHard = mode==='hard';
  var isExpert = mode==='expert';
  var kind = (isHard || isExpert) ? (q.kind||'fragment') : 'normal';

  if(kind==='expert-id'){
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
    qTitle.textContent='Same language, or not?';
  } else if(kind==='reverse'){
    qTag.textContent='Hard · Reverse';
    qTitle.textContent='Which snippet is '+q.lang+'?';
  } else if(kind==='wide'){
    qTag.textContent='Hard · 8 options';
    qTitle.textContent='What language is this?';
  } else if(isHard){
    qTag.textContent='Hard · Fragment';
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
  } else {
    codeEl.style.display=''; codeImg.classList.remove('show');
    codeEl.textContent = q.code;
  }
  codeNote.textContent = q.note;
  hintBox.className='hint-box'; hintBox.innerHTML='';
  var hardHintLeft = !isHard || hintsUsed < 1;
  hintBtn.disabled = !hardHintLeft;
  hintBtn.style.display = isExpert ? 'none' : '';
  hintBtn.textContent = isHard ? (hardHintLeft ? 'Hint (−25 pts)' : 'Hint used') : 'Hint';
  hintsStat.style.display = isExpert ? 'none' : '';
  feedbackEl.className='feedback'; feedbackEl.innerHTML='';
  nextBtn.className='btn-next';
  nextBtn.textContent = (idx===order.length-1) ? 'See results' : 'Next';

  optionsEl.innerHTML='';
  if(kind==='expert-odd'){
    optionsEl.className='options snippets';
    var osnips = shuffle(q.snippets.map(function(sn,i){ return {sn:sn, orig:i}; }));
    osnips.forEach(function(item){
      var b=document.createElement('button');
      b.type='button'; b.className='opt snippet'; b.setAttribute('data-name', item.sn.lang);
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
      b.addEventListener('click', function(){ answer(optDef[0], b); });
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
  } else if(kind==='reverse'){
    optionsEl.className='options snippets';
    var snips = shuffle(q.snippets.map(function(sn,i){ return {sn:sn, orig:i}; }));
    snips.forEach(function(item){
      var b=document.createElement('button');
      b.type='button'; b.className='opt snippet'; b.setAttribute('data-name', item.sn.lang);
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
}

// Bring the quiz area (stats + card) to the top of the viewport — never the
// whole page. Scrolling to document top on every round forced Hard Mode
// players back past the header, mode toggle and rules box after each answer.
function scrollToEl(el){
  if(!el) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({block:'start', behavior: reduce ? 'auto' : 'smooth'});
}

function updateStats(){
  statQ.textContent=(Math.min(idx+1, total()))+' / '+total();
  statScore.textContent = mode==='normal' ? score : points;
  statStreak.textContent=streak;
  statHints.textContent = mode==='hard' ? (hintsUsed+' / 1') : hintsUsed;
  progressBar.style.width=Math.round((idx/total())*100)+'%';
}

hintBtn.addEventListener('click', function(){
  if(hintShown || answered) return;
  if(mode==='expert') return;
  if(mode==='hard' && hintsUsed>=1) return;
  var q=currentQ();
  hintShown=true; hintsUsed++;
  if(mode==='hard'){
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
    resultsLog.push({lang:q.lang, picked:fam, correctAnswer:q.lang, correct:false, usedHint:false, fact:q.fact, kind:q.kind});
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
  var logLang = q.kind==='expert-pair' ? q.pairLabel : (q.kind==='expert-odd' ? q.lang+' — odd one out' : q.lang);
  var logPicked = q.kind==='expert-pair' ? name+' ('+(q.same?'they are the same language':'they are different languages')+')' : name;
  resultsLog.push({lang:logLang, picked:logPicked, correctAnswer:correctName, correct:correct, usedHint:hintShown, fact:q.fact, kind:q.kind||'fragment'});

  var buttons = optionsEl.querySelectorAll('.opt');
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
    line = correct ? '✓ Correct — '+(q.same ? 'same language' : 'different languages')+pts
                   : '✕ Wrong — answer: '+(q.same ? 'Yes, same language' : 'No, different languages')+pts;
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
  if(idx < order.length-1){ idx++; render(); scrollToEl(document.getElementById('quizView')); }
  else { showResults(); }
});

document.addEventListener('keydown', function(e){
  if(document.getElementById('resultsView').classList.contains('show')){
    if(e.key==='Enter'){ restart(); } return;
  }
  if(!answered && ['1','2','3','4','5','6','7','8'].indexOf(e.key)>=0){
    var n=parseInt(e.key,10)-1;
    var btns=optionsEl.querySelectorAll('.opt');
    if(btns[n]) btns[n].click();
  } else if(answered && (e.key==='Enter' || e.key===' ')){
    if(document.activeElement && document.activeElement.tagName==='BUTTON') return;
    e.preventDefault(); nextBtn.click();
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
  order=buildOrder();
  idx=0; score=0; points=0; correctCount=0; streak=0; bestStreak=0; hintsUsed=0; resultsLog=[];
  document.getElementById('resultsView').classList.remove('show');
  document.getElementById('quizView').style.display='';
  render();
}
function restart(){ startQuiz(); scrollToEl(document.getElementById('quizView')); }
document.getElementById('restartBtn').addEventListener('click', restart);

function setMode(m){
  mode=m;
  document.getElementById('modeNormalBtn').className = m==='normal' ? 'active' : '';
  document.getElementById('modeHardBtn').className = m==='hard' ? 'active' : '';
  document.getElementById('modeExpertBtn').className = m==='expert' ? 'active' : '';
  modeNote.textContent = m==='expert'
    ? 'No hints · +100 correct · −50 wrong · facts at results.'
    : (m==='hard' ? 'Excerpts only · 1 hint per run (−25 pts) · facts at results.' : '');
  document.getElementById('scoreLabel').textContent = m==='normal' ? 'Score' : 'Points';
  startQuiz();
}
document.getElementById('modeNormalBtn').addEventListener('click', function(){ setMode('normal'); });
document.getElementById('modeHardBtn').addEventListener('click', function(){ setMode('hard'); });
document.getElementById('modeExpertBtn').addEventListener('click', function(){ setMode('expert'); });

// Start through startQuiz (not a bare render) so the very first run is also
// a random draw from the pools, not the full pool in shuffled order.
startQuiz();
