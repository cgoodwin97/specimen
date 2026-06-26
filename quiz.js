// quiz.js — Specimen quiz system
// Loaded by index.html. Injects a modal with branch picker, quiz questions,
// answer feedback, and end screen. Uses curated summaries as question source.

(function () {

  // ---------- Question banks ----------

  const CB_QUESTIONS = [
    { name: 'Mitochondrion',          summary: 'The powerhouse of the cell. Converts nutrients into ATP through cellular respiration, supplying energy for nearly every cellular process.' },
    { name: 'Nucleus',                summary: 'The control centre of the cell. Houses the cell\'s DNA and directs gene expression, coordinating growth, metabolism, and reproduction.' },
    { name: 'Cytoplasm',              summary: 'The fluid-filled interior of the cell, excluding the nucleus. Suspends organelles and is the site of many metabolic reactions.' },
    { name: 'Ribosome',               summary: 'The molecular machine that builds proteins. Reads messenger RNA and assembles amino acids into polypeptide chains through a process called translation.' },
    { name: 'Endoplasmic reticulum',  summary: 'A network of membranes that folds, modifies, and transports proteins and lipids. The rough form makes secretory proteins; the smooth form synthesises lipids and detoxifies chemicals.' },
    { name: 'Golgi apparatus',        summary: 'The cell\'s postal system. Receives proteins from the ER, packages and modifies them, then ships them to their final destinations inside or outside the cell.' },
    { name: 'Lysosome',               summary: 'The cell\'s recycling centre. Contains digestive enzymes that break down waste materials, damaged organelles, and foreign invaders.' },
    { name: 'Vacuole',                summary: 'A membrane-bound storage compartment. Stores water, nutrients, and waste products — especially large and prominent in plant cells where it maintains turgor pressure.' },
    { name: 'Peroxisome',             summary: 'Specialised organelle that breaks down fatty acids and detoxifies harmful substances such as hydrogen peroxide. Particularly abundant in liver cells.' },
    { name: 'Cytoskeleton',           summary: 'A network of protein filaments — actin, microtubules, and intermediate filaments — that gives the cell its shape, enables movement, and acts as a transport highway for organelles.' },
    { name: 'Microtubule',            summary: 'Protein tubes that form the cell\'s structural scaffold and act as tracks for motor proteins carrying cargo around the cell. Also form the spindle that separates chromosomes during cell division.' },
    { name: 'Actin cytoskeleton',     summary: 'Thin filaments made of actin that support the cell\'s shape, enable cell movement, and drive processes like phagocytosis and cytokinesis.' },
    { name: 'Centrosome',             summary: 'The organising centre for microtubule growth. Duplicates before cell division and pulls chromosomes to opposite ends of the cell during mitosis.' },
    { name: 'Nuclear envelope',       summary: 'A double membrane enclosing the nucleus that controls what enters and leaves, with nuclear pore complexes acting as guarded gateways for molecules.' },
    { name: 'Nuclear lamina',         summary: 'The structural scaffold of the nucleus, maintaining its shape and anchoring chromatin and nuclear pores.' },
    { name: 'Small ribosomal subunit',summary: 'The small subunit of the ribosome, responsible for binding messenger RNA and initiating the translation of genetic code into protein.' },
    { name: 'Large ribosomal subunit',summary: 'The large subunit of the ribosome, where peptide bonds form between amino acids during protein synthesis.' },
    { name: 'Endosome',               summary: 'Membrane-bound compartments that sort and route proteins arriving from the cell surface or the Golgi, directing them to lysosomes or back to the membrane.' },
    { name: 'Secretory vesicle',      summary: 'Vesicles that store and release substances — such as neurotransmitters or hormones — by fusing with the plasma membrane.' },
    { name: 'Plasma membrane',        summary: 'The boundary of the cell. Controls what enters and leaves, receives signals from the environment, and mediates communication with other cells.' },
  ];

  const VIRO_QUESTIONS = [
    { name: 'SARS-CoV-2',        summary: 'Responsible for COVID-19, this coronavirus spreads primarily through respiratory droplets and targets cells via the ACE2 receptor. Its spike protein is the primary target of vaccines.' },
    { name: 'Influenza A',       summary: 'The most clinically significant flu virus, causing seasonal epidemics and periodic pandemics. It mutates rapidly through antigenic drift and shift, which is why flu vaccines are updated annually.' },
    { name: 'HIV-1',             summary: 'The primary cause of AIDS worldwide. It targets CD4+ T cells, gradually destroying the immune system. Antiretroviral therapy can suppress it to undetectable levels but does not cure infection.' },
    { name: 'Ebola',             summary: 'A filovirus causing severe hemorrhagic fever with high fatality rates. It spreads through direct contact with bodily fluids and has caused several major outbreaks in central Africa.' },
    { name: 'Hepatitis B',       summary: 'A DNA virus that infects the liver, causing acute and chronic disease. Chronic infection significantly increases the risk of cirrhosis and liver cancer. An effective vaccine is available.' },
    { name: 'Hepatitis C',       summary: 'An RNA virus that primarily infects the liver. It often becomes chronic and can lead to cirrhosis and liver cancer. Direct-acting antiviral drugs now cure over 95% of infections.' },
    { name: 'Measles',           summary: 'One of the most contagious viruses known. It spreads through respiratory droplets and causes fever and rash. The MMR vaccine provides effective protection.' },
    { name: 'Rabies',            summary: 'Almost universally fatal once symptoms appear. It spreads through the saliva of infected animals and travels to the brain via peripheral nerves. Post-exposure vaccination before symptom onset is effective.' },
    { name: 'Dengue',            summary: 'The most prevalent mosquito-borne viral disease globally. Infection with one of four serotypes can lead to severe disease upon re-infection with a different serotype.' },
    { name: 'Zika',              summary: 'Causes mild illness in most adults but can cause severe microcephaly and brain defects in babies born to infected mothers. It spread explosively through the Americas in 2015–2016.' },
    { name: 'Mpox',              summary: 'An orthopoxvirus related to smallpox causing a characteristic pustular rash. It is transmitted through close contact and cases rose dramatically during a 2022 global outbreak.' },
    { name: 'Norovirus',         summary: 'The leading cause of viral gastroenteritis worldwide. It spreads very easily through contaminated food, water, and surfaces, and is notorious for outbreaks on cruise ships and in care homes.' },
    { name: 'Rotavirus',         summary: 'The leading cause of severe diarrhoeal disease in young children globally. Oral vaccines have dramatically reduced hospitalisation and death rates in countries where they are deployed.' },
    { name: 'HPV',               summary: 'The most common sexually transmitted infection. Most infections clear on their own, but persistent infection with high-risk strains is the primary cause of cervical cancer.' },
    { name: 'Herpes simplex 1',  summary: 'Typically causes oral herpes (cold sores) but can also cause genital herpes. After primary infection it establishes lifelong latency in sensory neurons and can reactivate periodically.' },
    { name: 'Varicella-zoster',  summary: 'Causes chickenpox on first infection and can reactivate decades later as shingles. Vaccines are available for both primary infection and shingles prevention.' },
    { name: 'Poliovirus',        summary: 'Once a major cause of paralytic disease worldwide. Extensive vaccination campaigns have reduced cases by over 99% since 1988, with transmission now limited to a few countries.' },
    { name: 'Yellow fever',      summary: 'A mosquito-borne flavivirus that causes jaundice and hemorrhagic fever. A highly effective single-dose vaccine provides lifelong protection in most recipients.' },
    { name: 'West Nile virus',   summary: 'Transmitted by Culex mosquitoes and now endemic across North America. Most infections are asymptomatic, but a small percentage develop neuroinvasive disease.' },
    { name: 'Marburg',           summary: 'A filovirus closely related to Ebola, causing rare but highly lethal hemorrhagic fever outbreaks. Fruit bats are the reservoir host; human-to-human transmission occurs through direct contact.' },
  ];

  // ---------- State ----------
  let currentBranch = null;
  let questions     = [];
  let qIndex        = 0;
  let score         = 0;
  let answered      = false;

  // ---------- Helpers ----------
  function esc(str){
    return String(str ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function shuffle(arr){
    const a = [...arr];
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestions(bank){
    const pool = shuffle(bank).slice(0, 10);
    return pool.map(q => {
      const wrongs = shuffle(bank.filter(b => b.name !== q.name)).slice(0, 2);
      const options = shuffle([q.name, ...wrongs.map(w => w.name)]);
      return { summary: q.summary, answer: q.name, options };
    });
  }

  async function awardXp(amount){
    const user = window.SpecimenAuth?.currentUser();
    if(!user) return;
    try{
      await fetch('/profile/xp', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz_answer' }),
      });
    } catch(_){}
  }

  // ---------- Modal shell ----------
  function getModal(){ return document.getElementById('quiz-modal-overlay'); }
  function getContent(){ return document.getElementById('quiz-modal-content'); }

  function openQuizModal(){
    getModal().hidden = false;
    document.body.style.overflow = 'hidden';
    renderBranchPicker();
  }

  function closeQuizModal(){
    getModal().hidden = true;
    document.body.style.overflow = '';
    getContent().innerHTML = '';
    currentBranch = null; questions = []; qIndex = 0; score = 0; answered = false;
  }

  // ---------- Branch picker ----------
  function renderBranchPicker(){
    getContent().innerHTML = `
      <div class="quiz-wrap">
        <div class="quiz-header">
          <p class="quiz-title">Quizzes</p>
          <p class="quiz-sub">Choose a branch to start a 10-question quiz.</p>
        </div>
        <div class="quiz-branch-grid">
          <button type="button" class="quiz-branch-btn" id="qb-cellbio">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>
            <span class="quiz-branch-name">Cell Biology</span>
            <span class="quiz-branch-desc">Organelles &amp; structures</span>
          </button>
          <button type="button" class="quiz-branch-btn" id="qb-virology">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 9c0-3 1.5-6 3-6s3 2 3 6-1.5 6-3 6"/><path d="M12 9c0-3-1.5-6-3-6S6 5 6 9s1.5 6 3 6"/><path d="M6.5 7.5C8 8 10 8 12 8s4 0 5.5-.5"/><path d="M6.5 16.5C8 16 10 16 12 16s4 0 5.5.5"/></svg>
            <span class="quiz-branch-name">Virology</span>
            <span class="quiz-branch-desc">Viruses &amp; pathogens</span>
          </button>
        </div>
      </div>`;

    document.getElementById('qb-cellbio').addEventListener('click', () => startQuiz('cellbiology'));
    document.getElementById('qb-virology').addEventListener('click', () => startQuiz('virology'));
  }

  // ---------- Quiz ----------
  function startQuiz(branch){
    currentBranch = branch;
    questions = buildQuestions(branch === 'cellbiology' ? CB_QUESTIONS : VIRO_QUESTIONS);
    qIndex = 0;
    score = 0;
    answered = false;
    renderQuestion();
  }

  function renderQuestion(){
    answered = false;
    const q = questions[qIndex];
    const progress = qIndex + 1;
    const branchLabel = currentBranch === 'cellbiology' ? 'Cell Biology' : 'Virology';

    getContent().innerHTML = `
      <div class="quiz-wrap">
        <div class="quiz-progress-bar-wrap">
          <div class="quiz-progress-bar" style="width:${(qIndex / 10) * 100}%"></div>
        </div>
        <div class="quiz-header">
          <div class="quiz-meta-row">
            <span class="quiz-branch-tag mono">${esc(branchLabel)}</span>
            <span class="quiz-counter mono">${progress} / 10</span>
          </div>
          <p class="quiz-question">${esc(q.summary)}</p>
        </div>
        <div class="quiz-options">
          ${q.options.map(opt => `
            <button type="button" class="quiz-option" data-opt="${esc(opt)}">
              ${esc(opt)}
            </button>`).join('')}
        </div>
        <div class="quiz-feedback" id="quiz-feedback" hidden></div>
      </div>`;

    document.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(btn.dataset.opt, q.answer));
    });
  }

  function handleAnswer(chosen, correct){
    if(answered) return;
    answered = true;
    const isCorrect = chosen === correct;
    if(isCorrect){ score++; awardXp(10); }

    // Style buttons
    document.querySelectorAll('.quiz-option').forEach(btn => {
      btn.disabled = true;
      if(btn.dataset.opt === correct) btn.classList.add('correct');
      else if(btn.dataset.opt === chosen && !isCorrect) btn.classList.add('incorrect');
    });

    // Show feedback
    const fb = document.getElementById('quiz-feedback');
    fb.hidden = false;
    fb.innerHTML = isCorrect
      ? `<p class="quiz-fb-correct">✓ Correct!</p>`
      : `<p class="quiz-fb-incorrect">✗ The answer is <strong>${esc(correct)}</strong>.</p>`;

    // Next button
    const nextLabel = qIndex < 9 ? 'Next question' : 'See results';
    fb.innerHTML += `<button type="button" class="quiz-next-btn" id="quiz-next">${nextLabel}</button>`;
    document.getElementById('quiz-next').addEventListener('click', () => {
      qIndex++;
      if(qIndex < 10) renderQuestion();
      else renderResults();
    });
  }

  // ---------- Results ----------
  async function renderResults(){
    // Bonus XP for perfect score
    if(score === 10) awardXp(50);

    const pct = Math.round((score / 10) * 100);
    const msg = score === 10 ? 'Perfect score!'
      : score >= 8 ? 'Great work.'
      : score >= 5 ? 'Good effort.'
      : 'Keep studying — you\'ll get there.';

    const branchLabel = currentBranch === 'cellbiology' ? 'Cell Biology' : 'Virology';
    const otherBranch = currentBranch === 'cellbiology' ? 'virology' : 'cellbiology';
    const otherLabel  = currentBranch === 'cellbiology' ? 'Virology' : 'Cell Biology';

    getContent().innerHTML = `
      <div class="quiz-wrap">
        <div class="quiz-header" style="text-align:center;">
          <p class="quiz-title">${esc(branchLabel)} Quiz</p>
          <div class="quiz-score-circle">
            <span class="quiz-score-num">${score}</span>
            <span class="quiz-score-denom">/10</span>
          </div>
          <p class="quiz-score-pct mono">${pct}%</p>
          <p class="quiz-score-msg">${esc(msg)}</p>
          ${score === 10 ? '<p class="quiz-bonus-note mono">+50 bonus XP for a perfect score</p>' : ''}
        </div>
        <div class="quiz-results-actions">
          <button type="button" class="quiz-branch-btn" id="qr-retry">
            <span class="quiz-branch-name">Retry</span>
            <span class="quiz-branch-desc">${esc(branchLabel)} again</span>
          </button>
          <button type="button" class="quiz-branch-btn" id="qr-switch">
            <span class="quiz-branch-name">Switch</span>
            <span class="quiz-branch-desc">Try ${esc(otherLabel)}</span>
          </button>
        </div>
      </div>`;

    document.getElementById('qr-retry').addEventListener('click', () => startQuiz(currentBranch));
    document.getElementById('qr-switch').addEventListener('click', () => startQuiz(otherBranch));
  }

  // ---------- Inject modal and wire up ----------
  function init(){
    // Inject modal overlay
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal-overlay" id="quiz-modal-overlay" hidden>
        <div class="modal-card-wrap quiz-modal-wrap">
          <button type="button" class="modal-close-btn" id="quiz-modal-close" aria-label="Close">&times;</button>
          <div id="quiz-modal-content"></div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);

    // Close handlers
    document.getElementById('quiz-modal-close').addEventListener('click', closeQuizModal);
    document.getElementById('quiz-modal-overlay').addEventListener('click', e => {
      if(e.target === document.getElementById('quiz-modal-overlay')) closeQuizModal();
    });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && !document.getElementById('quiz-modal-overlay').hidden) closeQuizModal();
    });

    // Wire Quizzes tool card
    const quizCard = document.getElementById('quiz-tool-card');
    if(quizCard){
      quizCard.style.opacity = '1';
      quizCard.style.cursor = 'pointer';
      quizCard.addEventListener('click', openQuizModal);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
