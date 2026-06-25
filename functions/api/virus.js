// /functions/api/virus.js
// Virology data pipeline for Specimen.
// 1. NCBI E-utilities esearch — resolve virus name to taxon ID
// 2. NCBI E-utilities efetch — fetch full taxonomy lineage + metadata
// 3. UniProt — fetch reviewed proteins for that taxon ID
// Results cached in KV for 30 days under key `virus:{taxon_id}`
// Search name→taxon cached 30 days under `virus:search:{term}`

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return json({ error: 'Missing query parameter q' }, 400);
  }

  // ---------- Step 1: Resolve name to taxon ID ----------
  const termKey = `virus:search:${q.toLowerCase()}`;
  let taxonId = null;

  try {
    const cached = await env.SPECIMEN_KV.get(termKey);
    if (cached) taxonId = cached;
  } catch (_) {}

  if (!taxonId) {
    try {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=${encodeURIComponent(q + '[All Names]')}&retmode=json&retmax=1`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)' }
      });
      if (!searchRes.ok) return json({ error: 'NCBI search failed' }, 502);
      const searchData = await searchRes.json();
      const ids = searchData?.esearchresult?.idlist || [];
      if (ids.length === 0) return json({ result: null }, 200);
      taxonId = ids[0];
      await env.SPECIMEN_KV.put(termKey, taxonId, { expirationTtl: 2592000 });
    } catch (e) {
      return json({ error: 'Failed to resolve taxon' }, 502);
    }
  }

  // ---------- Step 2: Check full result cache ----------
  const resultKey = `virus:${taxonId}`;
  try {
    const cached = await env.SPECIMEN_KV.get(resultKey);
    if (cached) return json({ result: JSON.parse(cached) }, 200);
  } catch (_) {}

  // ---------- Step 3: Fetch taxonomy lineage via efetch ----------
  let taxonomy = {};
  try {
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=${taxonId}&retmode=json`;
    const fetchRes = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)' }
    });
    if (fetchRes.ok) {
      const fetchData = await fetchRes.json();
      const taxon = fetchData?.result?.[taxonId];
      if (taxon) {
        taxonomy.scientificName = taxon.scientificname || '';
        taxonomy.commonName     = taxon.commonname    || '';
        taxonomy.rank           = taxon.rank          || '';
        taxonomy.lineage        = taxon.lineage       || '';

        // Extract family and genus from lineageex
        const lineageEx = taxon.lineageex || [];
        const family = lineageEx.find(n => n.rank === 'family');
        const genus  = lineageEx.find(n => n.rank === 'genus');
        const order  = lineageEx.find(n => n.rank === 'order');
        taxonomy.family = family?.scientificname || '';
        taxonomy.genus  = genus?.scientificname  || '';
        taxonomy.order  = order?.scientificname  || '';
      }
    }
  } catch (_) {}

  // ---------- Step 4: Fetch genome metadata via NCBI Datasets v2 ----------
  let genomeType = '';
  let hosts = [];
  let refAccession = '';
  try {
    const datasetsUrl = `https://api.ncbi.nlm.nih.gov/datasets/v2/virus/taxon/${taxonId}/genome/summary?page_size=5`;
    const dsRes = await fetch(datasetsUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)',
      }
    });
    if (dsRes.ok) {
      const dsData = await dsRes.json();
      const reports = dsData?.reports || [];
      if (reports.length > 0) {
        // Find the reference genome if possible
        const ref = reports.find(r => r.is_reference) || reports[0];
        genomeType   = ref?.genome_type    || ref?.nucleotide_completeness || '';
        refAccession = ref?.accession      || '';
        // Collect unique hosts
        const hostSet = new Set();
        reports.forEach(r => {
          if (r.host?.host_organism?.common_name) hostSet.add(r.host.host_organism.common_name);
          if (r.host?.host_organism?.organism_name) hostSet.add(r.host.host_organism.organism_name);
        });
        hosts = [...hostSet].slice(0, 5);
      }
    }
  } catch (_) {}

  // ---------- Step 5: Fetch reviewed proteins from UniProt ----------
  let proteins = [];
  try {
    const uniprotUrl = `https://rest.uniprot.org/uniprotkb/search?query=(taxonomy_id:${taxonId})AND(reviewed:true)&fields=gene_names,protein_name,accession,function&format=json&size=15`;
    const upRes = await fetch(uniprotUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)',
      }
    });
    if (upRes.ok) {
      const upData = await upRes.json();
      proteins = (upData?.results || []).map(entry => {
        const geneName = entry.genes?.[0]?.geneName?.value
          || entry.genes?.[0]?.orfNames?.[0]?.value
          || '';
        const proteinName = entry.proteinDescription?.recommendedName?.fullName?.value
          || entry.proteinDescription?.submissionNames?.[0]?.fullName?.value
          || '';
        const fnComment = (entry.comments || []).find(c => c.commentType === 'FUNCTION');
        const fnText = fnComment?.texts?.[0]?.value || '';
        return {
          accession:   entry.primaryAccession || '',
          gene:        geneName,
          name:        proteinName,
          function:    fnText.replace(/\s*\(PubMed:[^)]+\)/g, '').trim(),
        };
      }).filter(p => p.name || p.gene);
    }
  } catch (_) {}

  // ---------- Step 6: Normalise genome type to Baltimore class ----------
  const baltimoreMap = {
    'dsRNA':          'dsRNA (Baltimore Class III)',
    'ssRNA(+)':       'ssRNA positive-sense (Baltimore Class IV)',
    'ssRNA positive': 'ssRNA positive-sense (Baltimore Class IV)',
    'ssRNA+':         'ssRNA positive-sense (Baltimore Class IV)',
    'ssRNA(-)':       'ssRNA negative-sense (Baltimore Class V)',
    'ssRNA negative': 'ssRNA negative-sense (Baltimore Class V)',
    'ssRNA-':         'ssRNA negative-sense (Baltimore Class V)',
    'ssDNA':          'ssDNA (Baltimore Class II)',
    'dsDNA':          'dsDNA (Baltimore Class I)',
    'ssRNA-RT':       'ssRNA reverse-transcribing (Baltimore Class VI)',
    'dsDNA-RT':       'dsDNA reverse-transcribing (Baltimore Class VII)',
  };
  const baltimoreClass = Object.entries(baltimoreMap).find(([k]) =>
    genomeType.toLowerCase().includes(k.toLowerCase())
  )?.[1] || genomeType;

  // ---------- Assemble result ----------
  const result = {
    taxonId,
    scientificName: taxonomy.scientificName || q,
    commonName:     taxonomy.commonName     || '',
    rank:           taxonomy.rank           || '',
    lineage:        taxonomy.lineage        || '',
    family:         taxonomy.family         || '',
    genus:          taxonomy.genus          || '',
    order:          taxonomy.order          || '',
    genomeType:     baltimoreClass,
    hosts,
    refAccession,
    proteins,
  };

  // Cache for 30 days
  try {
    await env.SPECIMEN_KV.put(resultKey, JSON.stringify(result), { expirationTtl: 2592000 });
  } catch (_) {}

  return json({ result }, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
