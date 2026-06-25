// /functions/api/virusinteractions.js
// Fetches host-pathogen interaction data from IntAct via the PSICQUIC REST API.
// Queries for interactions between a virus taxon and human (taxid:9606).
// Returns a deduplicated list of interaction pairs with gene names.
// Cached in KV for 30 days under key `virusint:{taxonId}`.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const taxonId = (url.searchParams.get('taxon') || '').trim();
  const noCache = url.searchParams.get('nocache') === '1';

  if (!taxonId || !/^\d+$/.test(taxonId)) {
    return json({ error: 'Missing or invalid taxon parameter' }, 400);
  }

  const cacheKey = `virusint:${taxonId}`;

  if (!noCache) {
    try {
      const cached = await env.SPECIMEN_KV.get(cacheKey);
      if (cached) return json({ interactions: JSON.parse(cached) }, 200);
    } catch (_) {}
  }

  // PSICQUIC MIQL query: one interactor is the virus taxon, the other is human
  // taxidA:{virus} AND taxidB:9606 OR taxidA:9606 AND taxidB:{virus}
  const query = `(taxidA:${taxonId} AND taxidB:9606) OR (taxidA:9606 AND taxidB:${taxonId})`;
  const psicquicUrl = `https://www.ebi.ac.uk/Tools/webservices/psicquic/intact/webservices/current/search/query/${encodeURIComponent(query)}?format=tab25&firstResult=0&maxResults=200`;

  let rawText = '';
  try {
    const res = await fetch(psicquicUrl, {
      headers: {
        'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)',
        'Accept': 'text/plain, */*',
      }
    });
    if (!res.ok) {
      return json({ interactions: [] }, 200);
    }
    rawText = await res.text();
  } catch (e) {
    return json({ interactions: [] }, 200);
  }

  // Parse MITAB 2.5 tab-separated format
  // Columns: 0=idA, 1=idB, 2=altA, 3=altB, 4=aliasA, 5=aliasB,
  //          6=detMethod, 7=author, 8=pubId, 9=taxA, 10=taxB, 11=interactionType
  const lines = rawText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const seen = new Set();
  const interactions = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 11) continue;

    const taxA = cols[9] || '';
    const taxB = cols[10] || '';

    // Extract numeric taxon IDs
    const taxIdA = taxA.match(/taxid:(\d+)/)?.[1] || '';
    const taxIdB = taxB.match(/taxid:(\d+)/)?.[1] || '';

    // One must be the virus, one must be human (9606)
    // IntAct may store virus at strain level — check both cols
    const aIsVirus = taxIdA === taxonId || (taxIdA !== '9606' && taxIdB === '9606');
    const bIsVirus = taxIdB === taxonId || (taxIdB !== '9606' && taxIdA === '9606');

    let viralSide = null;
    if (taxIdA === taxonId && taxIdB === '9606') viralSide = 'A';
    else if (taxIdB === taxonId && taxIdA === '9606') viralSide = 'B';
    else if (taxIdB === '9606' && taxIdA !== '9606' && taxIdA !== '') viralSide = 'A';
    else if (taxIdA === '9606' && taxIdB !== '9606' && taxIdB !== '') viralSide = 'B';
    else continue;

    // Extract gene names from alias columns (cols 4 and 5)
    // Alias format: "uniprotkb:GENE_HUMAN(gene name synonym)|..." or "intact:EBI-...(display_short)|..."
    const aliasViralCol = viralSide === 'A' ? cols[4] : cols[5];
    const aliasHumanCol = viralSide === 'A' ? cols[5] : cols[4];

    const viralGene      = extractGeneName(aliasViralCol) || extractAccession(viralSide === 'A' ? cols[0] : cols[1]);
    const humanGene      = extractGeneName(aliasHumanCol) || extractAccession(viralSide === 'A' ? cols[1] : cols[0]);

    // Extract accessions — double-check by also trying alt columns
    const viralAccessionA = extractAccession(cols[0]) || '';
    const viralAccessionB = extractAccession(cols[1]) || '';
    // Use the column matching viralSide
    const viralAccession = viralSide === 'A' ? viralAccessionA : viralAccessionB;
    const humanAccession = viralSide === 'A' ? viralAccessionB : viralAccessionA;

    if (!viralGene || !humanGene) continue;

    // Deduplicate by viral + human gene pair
    const key = `${viralGene}::${humanGene}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Interaction type (col 11)
    const intType = extractParenValue(cols[11] || '') || '';

    interactions.push({
      viralGene,
      viralAccession,
      humanGene,
      humanAccession,
      interactionType: normaliseIntType(intType),
    });

    if (interactions.length >= 20) break;
  }

  // Cache for 30 days
  try {
    await env.SPECIMEN_KV.put(cacheKey, JSON.stringify(interactions), { expirationTtl: 2592000 });
  } catch (_) {}

  return json({ interactions }, 200);
}

// Extract gene name from MITAB alias field
// e.g. "uniprotkb:spike(gene name)|uniprotkb:S(gene name synonym)"
function extractGeneName(aliasField) {
  if (!aliasField) return null;
  const aliases = aliasField.split('|');
  // Prefer "gene name" over "gene name synonym"
  for (const a of aliases) {
    const m = a.match(/[^:]+:([^(]+)\(gene name\)/i);
    if (m) return m[1].trim().toUpperCase();
  }
  // Fallback to display_short (IntAct display name)
  for (const a of aliases) {
    const m = a.match(/intact:([^(]+)\(display_short\)/i);
    if (m) return m[1].trim().toUpperCase();
  }
  // Fallback to any gene name synonym
  for (const a of aliases) {
    const m = a.match(/[^:]+:([^(]+)\(gene name synonym\)/i);
    if (m) return m[1].trim().toUpperCase();
  }
  return null;
}

// Extract UniProt accession from ID field as fallback
function extractAccession(idField) {
  if (!idField) return null;
  const m = idField.match(/uniprotkb:([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

// Extract text inside parentheses from a PSI-MI term
// e.g. psi-mi:"MI:0915"(physical association) → "physical association"
function extractParenValue(str) {
  const m = str.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

function normaliseIntType(type) {
  const t = type.toLowerCase();
  if (t.includes('direct')) return 'direct interaction';
  if (t.includes('physical')) return 'physical association';
  if (t.includes('colocali')) return 'colocalisation';
  if (t.includes('association')) return 'association';
  if (t.includes('cleavage')) return 'cleavage reaction';
  if (t.includes('phospho')) return 'phosphorylation';
  if (t.includes('ubiquit')) return 'ubiquitination';
  return type || 'interaction';
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
