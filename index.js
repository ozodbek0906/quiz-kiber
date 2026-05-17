/* Quiz app: parse custom format, store in localStorage, run quiz */
'use strict';

const LS_KEY = 'quiz_questions_v1';

// DOM
// (import textarea and DB buttons removed; questions load from questions.json)
const qIndexEl = document.getElementById('qIndex');
const qTotalEl = document.getElementById('qTotal');
const questionText = document.getElementById('questionText');
const choicesForm = document.getElementById('choicesForm');
const btnNext = document.getElementById('btnNext');
const btnPrev = document.getElementById('btnPrev');
const resultEl = document.getElementById('result');
const scoreEl = document.getElementById('score');
const totalCountEl = document.getElementById('totalCount');
const scorePreviewVal = document.getElementById('scorePreviewVal');
const reviewEl = document.getElementById('review');
const btnRestart = document.getElementById('btnRestart');
const quizSection = document.getElementById('quizSection');
const homeSection = document.getElementById('home');
const btnStart = document.getElementById('btnStart');

// Result screen elements
const resultScreen = document.getElementById('resultScreen');
const resTotal = document.getElementById('resTotal');
const resCorrect = document.getElementById('resCorrect');
const resWrong = document.getElementById('resWrong');
const resPercent = document.getElementById('resPercent');
const resultPartLabelEl = document.getElementById('resultPartLabel');
const resReview = document.getElementById('resReview');
const btnRestartPart = document.getElementById('btnRestartPart');
const btnBackToParts = document.getElementById('btnBackToParts');
const btnShowDetails = document.getElementById('btnShowDetails');
const btnNextPart = document.getElementById('btnNextPart');
const btnExportPDF = document.getElementById('btnExportPDF');
const loadingEl = document.getElementById('loading');

function showEl(el){ if (!el) return; el.classList.remove('hidden'); el.setAttribute('aria-hidden','false'); }
function hideEl(el){ if (!el) return; el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); }

function showToast(msg, timeout=1600){
  const t = document.createElement('div');
  t.className = 'app-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  // schedule hide and remove
  setTimeout(()=> t.classList.add('hide'), Math.max(0, timeout - 260));
  setTimeout(()=> t.remove(), timeout);
}

async function exportResultPDF(){
  if (typeof window.html2pdf !== 'function'){
    alert('PDF kutubxonasi yuklanmadi. Internetga ulanganligingizni tekshiring.');
    return;
  }
  const el = document.querySelector('.result-card');
  if (!el) return alert('Natija elementi topilmadi');

  // clone and sanitize the result for a clean PDF output
  const clone = el.cloneNode(true);
  // remove interactive controls from the clone
  const actions = clone.querySelectorAll('.result-actions, .part-btn, button');
  actions.forEach(a => a.remove());
  // remove confetti overlays if present
  const conf = clone.querySelector('.confetti'); if (conf) conf.remove();
  // ensure readable font sizes for print
  clone.style.boxShadow = 'none';
  clone.style.padding = '18px';
  const wrapper = document.createElement('div'); wrapper.style.background = '#fff'; wrapper.style.padding = '20px'; wrapper.appendChild(clone);

  const opt = {
    margin: 12,
    filename: `test_result_qism_${currentPart}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  try{
    showToast('PDF tayyorlanmoqda...');
    await window.html2pdf().set(opt).from(wrapper).save();
    showToast('PDF saqlandi');
  }catch(e){
    console.error(e);
    alert('PDF yaratishda xato: '+ e.message);
  }
}

let questions = [];
let allQuestions = [];
let PART_SIZE = 40;
let parts = [];
let currentPart = 0;
let currentIndex = 0;
let answers = {}; // qIndex -> choiceIndex

// Sample questions as fallback
const SAMPLE = `+++++
Iqtisodiyot nedir?
====
#Tanzim qilingan ishlari
====
Tabiiy resurslar
====
Jamiyatning ehtiyojlari
====
Davlat xizmatlari
+++++
Bozor tizimi qanday xususiyatga ega?
====
#Erkin raqobat
====
Davlat nazorati
====
Mintaqaviy bozorlar
====
Xalqaro savdosi`;

function buildParts(){
  parts = [];
  for (let i=0;i<allQuestions.length;i+=PART_SIZE){
    parts.push(allQuestions.slice(i, i+PART_SIZE));
  }
}

function renderPartsList(){
  const partsListEl = document.getElementById('partsList');
  if (!partsListEl) return;
  partsListEl.innerHTML = '';
  if (!parts.length){
    partsListEl.textContent = 'Savollar topilmadi.'; return;
  }
  // ensure buttons are enabled and accessible
  partsListEl.querySelectorAll('.part-btn').forEach(b=> b.disabled = false);
  parts.forEach((p, idx) => {
    const btn = document.createElement('button');
    btn.className = 'part-btn';
    btn.textContent = `${idx+1}-qism (${p.length} savol)`;
    btn.setAttribute('aria-label', `Qism ${idx+1} — ${p.length} savol`);
    btn.dataset.partIndex = idx;
    btn.addEventListener('click', () => startPart(idx));
    btn.style.animation = 'pop .34s var(--ease) both';
    btn.style.animationDelay = (idx * 60) + 'ms';
    partsListEl.appendChild(btn);
  });
}

function startPart(idx){
  if (!parts[idx]) return;
  questions = parts[idx];
  currentPart = idx+1;
  currentIndex = 0;
  answers = {};
  // update UI
  document.getElementById('partLabel').textContent = `Qism ${currentPart}/${parts.length}`;
  document.getElementById('qTotal').textContent = questions.length;
  hideEl(homeSection);
  showEl(quizSection);
  renderQuestion(0);
  updateScorePreview();
}



// Parse input format into questions
function parseQuestions(raw) {
  const parts = raw.split(/\+{4,}/);
  const qlist = [];
  
  for (let block of parts) {
    block = block.trim();
    if (!block) continue;

    const lines = block.split(/\r?\n/);
    if (lines.length === 0) continue;

    // First line is the question
    let qline = lines[0].trim();
    if (!qline) continue;

    const choices = [];
    let correctIndex = -1;

    // Process remaining lines - they should be between ==== separators
    // Each ==== marks a choice below it
    let i = 1;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Skip empty lines and look for ==== separators
      if (line === '====' || line === '=====' || line.match(/^=+$/)) {
        i++;
        // Next non-empty line is the choice
        while (i < lines.length) {
          const choiceLine = lines[i].trim();
          if (!choiceLine) {
            i++;
            continue;
          }
          
          // Check if this choice is marked as correct with #
          let isCorrect = false;
          let choiceText = choiceLine;
          
          if (choiceText.startsWith('#')) {
            isCorrect = true;
            correctIndex = choices.length;
          }
          
          // Remove all # characters from the text
          choiceText = choiceText.replace(/#/g, '').trim();
          // Clean up trailing semicolons if present
          choiceText = choiceText.replace(/;\s*$/, '').trim();
          
          if (choiceText) {
            choices.push(choiceText);
          }
          i++;
          break;
        }
      } else {
        i++;
      }
    }

    if (choices.length > 0 && correctIndex >= 0) {
      qlist.push({ text: qline, choices, correctIndex });
    }
  }
  return qlist;
}

function saveQuestions(qs) {
  localStorage.setItem(LS_KEY, JSON.stringify(qs));
}
function loadQuestions() {
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(e){console.warn(e);return null}
}

// UI render
function renderQuestion(idx) {
  const q = questions[idx];
  if (!q) return;
  qIndexEl.textContent = idx + 1;
  qTotalEl.textContent = questions.length;
  questionText.textContent = q.text;
  choicesForm.innerHTML = '';
  // subtle entry animation for question box
  const qBox = document.getElementById('questionBox');
  if (qBox){
    qBox.classList.remove('pulse-in');
    void qBox.offsetWidth; // force reflow
    qBox.classList.add('pulse-in');
    qBox.addEventListener('animationend', ()=> qBox.classList.remove('pulse-in'), {once:true});
  }

  // build shuffled choices with correctness flag
  const renderChoices = q.choices.map((c, i) => ({ text: c, isCorrect: i === q.correctIndex }));
  for (let i = renderChoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [renderChoices[i], renderChoices[j]] = [renderChoices[j], renderChoices[i]];
  }

  renderChoices.forEach((rc, i) => {
    const id = `q${idx}_c${i}`;
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'choice';
    input.value = i;
    input.id = id;
    input.dataset.correct = rc.isCorrect ? '1' : '0';
    input.dataset.text = rc.text;

    // pre-select if user already answered this question
    if (answers[idx] && answers[idx].selectedText === rc.text) input.checked = true;

    input.addEventListener('change', () => {
      const isCorrect = input.dataset.correct === '1';
      answers[idx] = { selectedText: rc.text, correct: isCorrect };
      updateScorePreview();
      // disable inputs
      const inputs = choicesForm.querySelectorAll('input');
      inputs.forEach(inp => inp.disabled = true);
      label.classList.add('disabled');

      if (isCorrect) {
        // visual pop for correct answer
        label.classList.add('correct', 'anim-pop');
        label.addEventListener('animationend', () => label.classList.remove('anim-pop'), { once: true });
        // advance after 1s
        setTimeout(() => {
          if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion(currentIndex);
          } else {
            showResults();
          }
        }, 1000);
      } else {
        // wrong gives shake + reveal correct
        label.classList.add('wrong', 'anim-shake');
        label.addEventListener('animationend', () => label.classList.remove('anim-shake'), { once: true });
        const correctInput = choicesForm.querySelector('input[data-correct="1"]');
        if (correctInput) {
          const correctLabel = correctInput.closest('.choice') || correctInput.parentElement;
          if (correctLabel) {
            correctLabel.classList.add('correct', 'anim-pop');
            correctLabel.addEventListener('animationend', () => correctLabel.classList.remove('anim-pop'), { once: true });
          }
        }
        // advance after 2s
        setTimeout(() => {
          if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion(currentIndex);
          } else {
            showResults();
          }
        }, 2000);
      }
    });

    const span = document.createElement('span');
    span.textContent = rc.text;
    label.appendChild(input);
    label.appendChild(span);
    choicesForm.appendChild(label);
  });
}

function updateScorePreview(){
  let score = 0;
  questions.forEach((q, i) => {
    if (answers[i] && answers[i].correct) score++;
  });
  scorePreviewVal.textContent = score;
}

function showResults(){
  // compute stats
  const total = questions.length;
  let correct = 0;
  for (let i=0;i<total;i++){
    if (answers[i] && answers[i].correct) correct++;
  }
  const wrong = total - correct;
  const percent = Math.round((correct/total)*100);

  // set UI
  resTotal.textContent = total;
  resCorrect.textContent = correct;
  resWrong.textContent = wrong;
  resPercent.textContent = `${percent}%`;
  resultPartLabelEl.textContent = `Qism: ${currentPart}/${parts.length}`;

  // add a badge / mood to the result card for clearer feedback
  const rc = document.querySelector('.result-card');
  if (rc){
    rc.querySelectorAll('.result-badge').forEach(n=>n.remove());
    if (percent >= 85){
      rc.classList.remove('result-ok','result-bad'); rc.classList.add('result-good');
      const b = document.createElement('div'); b.className = 'result-badge'; b.textContent = 'Ajoyib! 🎉'; rc.prepend(b);
    } else if (percent >= 60){
      rc.classList.remove('result-good','result-bad'); rc.classList.add('result-ok');
      const b = document.createElement('div'); b.className = 'result-badge'; b.textContent = 'Yaxshi — biroz mashq qiling'; rc.prepend(b);
    } else {
      // Low scores: keep result card neutral (no badge)
      rc.classList.remove('result-good','result-ok','result-bad');
    }
  }

  // hide quiz and show result screen
  hideEl(quizSection);
  showEl(resultScreen);

  // optional celebration confetti for high scores
  if (percent >= 80){
    const card = document.querySelector('.result-card');
    if (card){
      const conf = document.createElement('div');
      conf.className = 'confetti';
      const colors = ['#60a5fa','#7c3aed','#34d399','#fb923c','#f97316'];
      for (let i=0;i<20;i++){
        const s = document.createElement('span');
        s.style.left = (Math.random()*100)+'%';
        s.style.background = colors[Math.floor(Math.random()*colors.length)];
        s.style.opacity = 0.95;
        conf.appendChild(s);
      }
      card.appendChild(conf);
      setTimeout(()=> conf.remove(), 2800);
    }
  }

  // configure NextPart visibility
  if (btnNextPart){
    if (currentPart < parts.length) btnNextPart.classList.remove('hidden');
    else btnNextPart.classList.add('hidden');
  }

  // clear details (hidden by default)
  if (resReview){ hideEl(resReview); resReview.innerHTML = ''; }
}

// Show detailed review when requested
if (btnShowDetails){
  btnShowDetails.addEventListener('click', () => {
    if (!resReview) return;
    // if already shown, hide
    if (!resReview.classList.contains('hidden')){
      hideEl(resReview);
      return;
    }
    // build review
    resReview.innerHTML = '';
    questions.forEach((q, i) => {
      // Question container
      const div = document.createElement('div');
      div.className = 'review-item';
      
      // Question header - bold va katta
      const qh = document.createElement('div');
      qh.innerHTML = `<strong>Savol ${i+1}: ${q.text}</strong>`;
      div.appendChild(qh);
      
      // All choices for this question
      q.choices.forEach((c, ci) => {
        const line = document.createElement('div');
        line.className = 'choice-line';
        line.textContent = c;
        
        // Agar bu to'g'ri javob bo'lsa
        if (ci === q.correctIndex) {
          line.classList.add('correct');
          const correctLabel = document.createElement('small');
          correctLabel.textContent = '(To\'g\'ri javob)';
          line.appendChild(correctLabel);
        }
        
        // Agar user bu variantni tanlagan bo'lsa
        if (answers[i] && answers[i].selectedText === c) {
          if (answers[i].correct) {
            // To'g'ri javob tanlagan
            const selectedLabel = document.createElement('small');
            selectedLabel.textContent = '✓ Siz tanladingiz — TO\'G\'RI';
            line.appendChild(selectedLabel);
          } else {
            // Noto'g'ri javob tanlagan
            line.classList.add('wrong');
            const selectedLabel = document.createElement('small');
            selectedLabel.textContent = '✗ Siz tanladingiz — NOTO\'G\'RI';
            line.appendChild(selectedLabel);
          }
        }
        
        div.appendChild(line);
      });
      
      resReview.appendChild(div);
    });
    showEl(resReview);
  });
}

if (btnStart) {
  btnStart.addEventListener('click', () => {
    hideEl(homeSection);
    showEl(quizSection);
    currentIndex = 0;
    renderQuestion(currentIndex);
    updateScorePreview();
    setTimeout(() => {
      const first = document.querySelector('input[type=radio]');
      if (first) first.focus();
    }, 150);
  });
}

if (btnNext) {
  btnNext.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion(currentIndex);
    }
  });
}
if (btnPrev) {
  btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion(currentIndex);
    }
  });
} 
if (btnRestart){
  btnRestart.addEventListener('click', () => {
    console.log('btnRestart clicked: clearing answers and resetting to first question of current part');
    answers = {};
    currentIndex = 0;
    if (resultEl) hideEl(resultEl);
    showEl(quizSection);
    renderQuestion(currentIndex);
    updateScorePreview();
    const flash = document.createElement('div');
    flash.textContent = 'Qayta boshlandi — javoblar tozalandi';
    flash.style.padding = '8px';
    flash.style.marginTop = '8px';
    flash.style.borderRadius = '6px';
    flash.style.background = '#ecfccb';
    document.getElementById('questionBox').appendChild(flash);
    setTimeout(() => flash.remove(), 1800);
  });
}

const btnBackHome = document.getElementById('btnBackHome');
if (btnBackHome){
  btnBackHome.addEventListener('click', () => {
    // show parts list
    showEl(homeSection);
    hideEl(quizSection);
    document.getElementById('partLabel').textContent = '';
  });
}

if (btnRestartPart){
  btnRestartPart.addEventListener('click', () => {
    answers = {};
    currentIndex = 0;
    hideEl(resultScreen);
    showEl(quizSection);
    renderQuestion(currentIndex);
    updateScorePreview();
  });
}
if (btnBackToParts){
  btnBackToParts.addEventListener('click', () => {
    hideEl(resultScreen);
    showEl(homeSection);
    document.getElementById('partLabel').textContent = '';
  });
}

if (btnNextPart){
  btnNextPart.addEventListener('click', () => {
    const nextIdx = currentPart;
    if (nextIdx < parts.length){
      hideEl(resultScreen);
      startPart(nextIdx);
    } else {
      alert('Bu oxirgi qism — keyingi qism mavjud emas.');
    }
  });
}

if (btnExportPDF){
  btnExportPDF.addEventListener('click', exportResultPDF);
}


const btnFullReset = document.getElementById('btnFullReset');
if (btnFullReset) {
  btnFullReset.addEventListener('click', () => {
    if (!confirm("To'liq qayta o'rnatilsin va DB tozalansinmi?")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  });
}

// Initialize
(async function init(){
  try{
    if (loadingEl) loadingEl.classList.remove('hidden');
    const resp = await fetch('questions.txt', {cache: 'no-store'});
    if (resp.ok){
      const raw = await resp.text();
      const parsed = parseQuestions(raw);
      console.log('questions.txt dan o\'qilgan savollar:', parsed.length, parsed.slice(0, 2));
      if (parsed && parsed.length){
        questions = parsed;
        saveQuestions(questions);
      }
    }
  }catch(e){ console.error('questions.txt xato:', e); } finally { if (loadingEl) loadingEl.classList.add('hidden'); }

  try{
    const resp2 = await fetch('questions.json', {cache: 'no-store'});
    if (resp2.ok){
      const data = await resp2.json();
      if (Array.isArray(data) && data.length) {
        questions = data;
        saveQuestions(questions);
      }
    }
  }catch(e){ /* ignore */ }

  const saved = loadQuestions();
  if (saved && saved.length) {
    questions = saved;
  } else if (!questions || !questions.length) {
    // auto-import sample
    questions = parseQuestions(SAMPLE);
    saveQuestions(questions);
  }
  allQuestions = questions.slice();
  buildParts();
  renderPartsList();
  qTotalEl.textContent = questions.length;
})();
