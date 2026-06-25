// /functions/api/virus.js
// Virology data pipeline for Specimen.
// 1. NCBI E-utilities esearch — resolve virus name to taxon ID
// 2. NCBI E-utilities efetch XML — fetch taxonomy lineage (XML only, no JSON)
// 3. NCBI Datasets v2 REST API — genome type, hosts, reference accession
// 4. UniProt — reviewed proteins for this taxon
// All results cached in KV 30 days.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({ error: 'Missing query' }, 400);

  // ---------- Step 1: Resolve name → taxon ID ----------
  const termKey = `virus:search:${q.toLowerCase()}`;
  let taxonId = null;

  try {
    const cached = await env.SPECIMEN_KV.get(termKey);
    if (cached) taxonId = cached;
  } catch (_) {}

  if (!taxonId) {
    try {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term=${encodeURIComponent(q)}&retmode=json&retmax=1`;
      const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Specimen/1.0 (specimen.site)' } });
      if (!res.ok) return json({ error: 'NCBI search failed' }, 502);
      const data = await res.json();
      const ids = data?.esearchresult?.idlist || [];
      if (ids.length === 0) return json({ result: null }, 200);
      taxonId = ids[0];
      await env.SPECIMEN_KV.put(termKey, taxonId, { expirationTtl: 2592000 });
    } catch (e) {
      return json({ error: 'Failed to resolve taxon' }, 502);
    }
  }

  // ---------- Check full result cache ----------
  const noCache = url.searchParams.get('nocache') === '1';
  const resultKey = `virus:${taxonId}`;
  if (!noCache) {
    try {
      const cached = await env.SPECIMEN_KV.get(resultKey);
      if (cached) return json({ result: JSON.parse(cached) }, 200);
    } catch (_) {}
  }

  // ---------- Step 2: Fetch taxonomy via efetch XML ----------
  // efetch only supports XML for taxonomy — parse with regex
  let scientificName = '', commonName = '', rank = '', lineage = '';
  let family = '', genus = '', order = '';

  try {
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=${taxonId}&retmode=xml`;
    const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Specimen/1.0 (specimen.site)' } });
    if (res.ok) {
      const xml = await res.text();

      scientificName = xml.match(/<ScientificName>([^<]+)<\/ScientificName>/)?.[1]?.trim() || '';
      commonName     = xml.match(/<CommonName>([^<]+)<\/CommonName>/)?.[1]?.trim() || '';
      rank           = xml.match(/<Rank>([^<]+)<\/Rank>/)?.[1]?.trim() || '';
      lineage        = xml.match(/<Lineage>([^<]+)<\/Lineage>/)?.[1]?.trim() || '';

      // Parse LineageEx for ranked taxa
      const lineageExMatch = xml.match(/<LineageEx>([\s\S]*?)<\/LineageEx>/);
      if (lineageExMatch) {
        const lineageXml = lineageExMatch[1];
        // Extract all Taxon blocks
        const taxonBlocks = lineageXml.match(/<Taxon>[\s\S]*?<\/Taxon>/g) || [];
        for (const block of taxonBlocks) {
          const taxRank = block.match(/<Rank>([^<]+)<\/Rank>/)?.[1]?.trim() || '';
          const taxName = block.match(/<ScientificName>([^<]+)<\/ScientificName>/)?.[1]?.trim() || '';
          if (taxRank === 'family') family = taxName;
          if (taxRank === 'genus')  genus  = taxName;
          if (taxRank === 'order')  order  = taxName;
        }
      }
    }
  } catch (_) {}

  // ---------- Step 3: NCBI Datasets v2 — genome type & hosts ----------
  let genomeType = '', hosts = [], refAccession = '';

  try {
    // The correct v2 endpoint for virus genomes by taxon
    const dsUrl = `https://api.ncbi.nlm.nih.gov/datasets/v2/virus/taxon/${taxonId}/genome/summary`;
    const res = await fetch(dsUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Specimen/1.0 (specimen.site)',
      }
    });
    if (res.ok) {
      const data = await res.json();
      const reports = data?.reports || data?.genomes || [];
      if (reports.length > 0) {
        const ref = reports.find(r => r.is_reference) || reports[0];
        // genome_type field varies — try multiple paths
        genomeType   = ref?.genome_type
          || ref?.nucleotide_completeness
          || ref?.assembly_info?.assembly_method
          || '';
        refAccession = ref?.accession || ref?.gb_accession || '';
        // Collect hosts
        const hostSet = new Set();
        reports.slice(0, 10).forEach(r => {
          const h = r?.host?.host_organism?.common_name
            || r?.host?.host_organism?.organism_name
            || r?.biosample?.host?.name
            || '';
          if (h) hostSet.add(h);
        });
        hosts = [...hostSet].slice(0, 4);
      }
    }
  } catch (_) {}

  // ---------- Step 4: UniProt reviewed proteins ----------
  let proteins = [];
  try {
    const upUrl = `https://rest.uniprot.org/uniprotkb/search?query=(taxonomy_id:${taxonId})AND(reviewed:true)&fields=gene_names,protein_name,accession,cc_function&format=json&size=15`;
    const res = await fetch(upUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Specimen/1.0 (specimen.site)' }
    });
    if (res.ok) {
      const data = await res.json();
      proteins = (data?.results || []).map(entry => {
        const gene = entry.genes?.[0]?.geneName?.value
          || entry.genes?.[0]?.orfNames?.[0]?.value
          || '';
        const name = entry.proteinDescription?.recommendedName?.fullName?.value
          || entry.proteinDescription?.submissionNames?.[0]?.fullName?.value
          || '';
        const fn = (entry.comments || []).find(c => c.commentType === 'FUNCTION');
        const fnText = fn?.texts?.[0]?.value || '';
        return {
          accession: entry.primaryAccession || '',
          gene,
          name,
          function: fnText.replace(/\s*\(PubMed:[^)]+\)/g, '').trim(),
        };
      }).filter(p => p.name || p.gene);
    }
  } catch (_) {}

  // ---------- Normalise genome type → Baltimore class ----------
  const baltimoreMap = [
    ['ssRNA(+)',         'ssRNA positive-sense (Baltimore Class IV)'],
    ['ssRNA+',          'ssRNA positive-sense (Baltimore Class IV)'],
    ['ss-RNA(+)',       'ssRNA positive-sense (Baltimore Class IV)'],
    ['positive-strand', 'ssRNA positive-sense (Baltimore Class IV)'],
    ['positive-sense',  'ssRNA positive-sense (Baltimore Class IV)'],
    ['ssRNA(-)',         'ssRNA negative-sense (Baltimore Class V)'],
    ['ssRNA-',          'ssRNA negative-sense (Baltimore Class V)'],
    ['ss-RNA(-)',       'ssRNA negative-sense (Baltimore Class V)'],
    ['negative-strand', 'ssRNA negative-sense (Baltimore Class V)'],
    ['negative-sense',  'ssRNA negative-sense (Baltimore Class V)'],
    ['dsRNA',           'dsRNA (Baltimore Class III)'],
    ['ssDNA',           'ssDNA (Baltimore Class II)'],
    ['dsDNA-RT',        'dsDNA reverse-transcribing (Baltimore Class VII)'],
    ['ssRNA-RT',        'ssRNA reverse-transcribing (Baltimore Class VI)'],
    ['retro',           'ssRNA reverse-transcribing (Baltimore Class VI)'],
    ['dsDNA',           'dsDNA (Baltimore Class I)'],
  ];
  const gt = genomeType.toLowerCase();
  const baltimoreClass = baltimoreMap.find(([k]) => gt.includes(k))?.[1] || genomeType;

  // ---------- Assemble result ----------
  const result = {
    taxonId,
    scientificName: scientificName || q,
    commonName:     commonName || '',
    rank,
    lineage,
    family,
    genus,
    order,
    genomeType:  baltimoreClass,
    hosts,
    refAccession,
    proteins,
  };

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
