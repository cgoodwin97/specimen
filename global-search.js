// global-search.js — Specimen global search
// Searches genes & proteins, cell biology, and virology simultaneously.
// Loaded by index.html. Injects a modal with search input and grouped results.

(function () {

  function esc(str){
    return String(str ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- Fetch helpers ----------

  async function searchGenes(term) {
    try {
      const res = await fetch(`/api/gene?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!data.result) return null;
      const r = data.result;
      const name = r.proteinDescription?.recommendedName?.fullName?.value
        || r.proteinDescription?.submissionNames?.[0]?.fullName?.value
        || '';
      const gene = r.genes?.[0]?.geneName?.value || '';
      const fn = (r.comments || []).find(c => c.commentType === 'FUNCTION');
      const desc = fn?.texts?.[0]?.value?.replace(/\s*\(PubMed:[^)]+\)/g, '').trim() || '';
      const organism = r.organism?.scientificName || '';
      return {
        branch: 'genes',
        label: 'Genes & Proteins',
        name: name || gene,
        subtitle: gene ? `${gene} · ${organism}` : organism,
        desc: desc.length > 120 ? desc.slice(0, 120) + '…' : desc,
        url: `genes.html?q=${encodeURIComponent(term)}`,
      };
    } catch(e){ return null; }
  }

  async function searchCellBiology(term) {
    try {
      const res = await fetch(`/api/cellbiology?term=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!data.result) return null;
      const r = data.result;
      const def = (r.definition || '').replace(/\s*\(Citation:[^)]+\)/gi, '').trim();
      return {
        branch: 'cellbiology',
        label: 'Cell Biology',
        name: r.name || term,
        subtitle: r.goId || '',
        desc: def.length > 120 ? def.slice(0, 120) + '…' : def,
        url: `cellbiology.html?q=${encodeURIComponent(term)}`,
      };
    } catch(e){ return null; }
  }

  async function searchVirology(term) {
    try {
      const res = await fetch(`/api/virus?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!data.result) return null;
      const r = data.result;
      const VIRUS_SUMMARIES = {
        '2697049': 'SARS-CoV-2 is the coronavirus responsible for COVID-19.',
        '11520':   'Influenza A causes seasonal epidemics and periodic pandemics.',
        '11676':   'HIV-1 is the primary cause of AIDS worldwide.',
        '128952':  'Ebola causes severe hemorrhagic fever with high fatality rates.',
        '10359':   'Hepatitis B is a DNA virus that infects the liver.',
        '11103':   'Hepatitis C primarily infects the liver; curable with antivirals.',
        '11234':   'Measles is one of the most contagious viruses known.',
        '11292':   'Rabies is almost universally fatal once symptoms appear.',
        '12637':   'Dengue is the most prevalent mosquito-borne viral disease.',
        '64320':   'Zika virus can cause microcephaly in babies born to infected mothers.',
        '10244':   'Mpox causes a characteristic pustular rash transmitted by close contact.',
        '142786':  'Norovirus is the leading cause of viral gastroenteritis worldwide.',
        '28875':   'Rotavirus is the leading cause of severe diarrhoeal disease in children.',
        '10566':   'HPV is the most common sexually transmitted infection.',
        '10298':   'HSV-1 typically causes oral herpes and establishes lifelong latency.',
        '10335':   'Varicella-zoster causes chickenpox and can reactivate as shingles.',
        '12110':   'Poliovirus was once a major cause of paralytic disease worldwide.',
        '11089':   'Yellow fever is a mosquito-borne flavivirus with an effective vaccine.',
        '11082':   'West Nile virus is now endemic across North America.',
        '11269':   'Marburg virus causes rare but highly lethal hemorrhagic fever.',
      };
      const desc = VIRUS_SUMMARIES[r.taxonId]
        || `${r.family || 'Virus'} · ${r.genomeType || ''}`.trim();
      return {
        branch: 'virology',
        label: 'Virology',
        name: r.commonName || r.scientificName || term,
        subtitle: r.scientificName || '',
        desc: desc.length > 120 ? desc.slice(0, 120) + '…' : desc,
        url: `virology.html?q=${encodeURIComponent(r.scientificName || term)}`,
      };
    } catch(e){ return null; }
  }

  // ---------- Branch colours ----------
  const BRANCH_STYLE = {
    genes:       { bg: '#E6EEF8', color: '#1a4a7a', label: 'Genes & Proteins' },
    cellbiology: { bg: '#E1F5EE', color: '#085041', label: 'Cell Biology' },
    virology:    { bg: '#FAEAE4', color: '#7a2e15', label: 'Virology' },
  };

  // ---------- Modal ----------
  function getModal()  { return document.getElementById('gs-modal-overlay'); }
  function getContent(){ return document.getElementById('gs-modal-content'); }

  function openGlobalSearch() {
    getModal().hidden = false;
    document.body.style.overflow = 'hidden';
    renderSearchView();
    setTimeout(() => document.getElementById('gs-input')?.focus(), 50);
  }

  function closeGlobalSearch() {
    getModal().hidden = true;
    document.body.style.overflow = '';
  }

  function renderSearchView() {
    getContent().innerHTML = `
      <div style="background:#FAFBF7; border-radius:16px; overflow:hidden;">
        <div style="padding:20px 20px 16px; border-bottom:0.5px solid #D4D8D0;">
          <p style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:19px;font-weight:500;color:#1E2A22;margin:0 0 12px;">Global search</p>
          <div style="display:flex; gap:8px;">
            <input type="text" id="gs-input" placeholder="Search genes, structures, viruses…"
              style="flex:1; padding:9px 12px; border:0.5px solid #D4D8D0; border-radius:8px; font-size:14px; background:#EAEEE6; color:#1E2A22; font-family:inherit; outline:none;"
              autocomplete="off" autocapitalize="none" spellcheck="false">
            <button type="button" id="gs-submit"
              style="padding:9px 18px; background:#1F6F5C; color:#EAEEE6; border:none; border-radius:8px; font-family:'IBM Plex Mono',monospace; font-size:13px; cursor:pointer;">
              Search
            </button>
          </div>
          <p style="font-size:11px; font-family:'IBM Plex Mono',monospace; color:#6E7568; margin:8px 0 0;">
            Searches genes &amp; proteins, cell biology, and virology simultaneously.
          </p>
        </div>
        <div id="gs-results" style="padding:0; max-height:420px; overflow-y:auto;"></div>
      </div>`;

    const input = document.getElementById('gs-input');
    const submit = document.getElementById('gs-submit');

    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (input.value.trim().length >= 2) runGlobalSearch(input.value.trim());
      }, 400);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { clearTimeout(debounce); runGlobalSearch(input.value.trim()); }
    });
    submit.addEventListener('click', () => runGlobalSearch(input.value.trim()));
  }

  async function runGlobalSearch(term) {
    if (!term) return;
    const resultsEl = document.getElementById('gs-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = `
      <div style="padding:20px 20px; font-family:'IBM Plex Mono',monospace; font-size:12px; color:#6E7568;">
        Searching across all branches…
      </div>`;

    // Search all three in parallel
    const [geneResult, cbResult, viroResult] = await Promise.all([
      searchGenes(term),
      searchCellBiology(term),
      searchVirology(term),
    ]);

    const results = [geneResult, cbResult, viroResult].filter(Boolean);

    if (results.length === 0) {
      resultsEl.innerHTML = `
        <div style="padding:24px 20px; text-align:center;">
          <p style="font-size:14px; color:#1E2A22; margin:0 0 4px;">No results found for "<strong>${esc(term)}</strong>"</p>
          <p style="font-size:12px; font-family:'IBM Plex Mono',monospace; color:#6E7568; margin:0;">Try a different term — gene symbol, organelle name, or virus name.</p>
        </div>`;
      return;
    }

    resultsEl.innerHTML = results.map(r => {
      const style = BRANCH_STYLE[r.branch];
      return `
        <a href="${esc(r.url)}" class="gs-result-row" style="display:block; padding:14px 20px; border-bottom:0.5px solid #D4D8D0; text-decoration:none; transition:background 0.1s;" onmouseover="this.style.background='#F4F7F4'" onmouseout="this.style.background=''">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="font-size:10px; font-family:'IBM Plex Mono',monospace; padding:2px 8px; border-radius:4px; background:${style.bg}; color:${style.color}; white-space:nowrap;">${esc(style.label)}</span>
            <span style="font-family:'Fraunces',Georgia,serif; font-style:italic; font-size:15px; font-weight:500; color:#1E2A22;">${esc(r.name)}</span>
          </div>
          ${r.subtitle ? `<p style="font-size:11.5px; font-family:'IBM Plex Mono',monospace; color:#6E7568; margin:0 0 4px;">${esc(r.subtitle)}</p>` : ''}
          ${r.desc ? `<p style="font-size:13px; color:#6E7568; margin:0; line-height:1.5;">${esc(r.desc)}</p>` : ''}
        </a>`;
    }).join('');
  }

  // ---------- Init ----------
  function init() {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal-overlay" id="gs-modal-overlay" hidden>
        <div class="modal-card-wrap" style="max-width:560px;">
          <button type="button" class="modal-close-btn" id="gs-modal-close" aria-label="Close">&times;</button>
          <div id="gs-modal-content"></div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);

    document.getElementById('gs-modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('gs-modal-overlay')) closeGlobalSearch();
      if (e.target.id === 'gs-modal-close' || e.target.closest('#gs-modal-close')) closeGlobalSearch();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('gs-modal-overlay').hidden) closeGlobalSearch();
    });

    // Wire global search tool card
    const card = document.getElementById('gs-tool-card');
    if (card) {
      card.style.opacity = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', openGlobalSearch);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
