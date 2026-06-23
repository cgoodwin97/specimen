const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days
const CALLER = 'https://specimen.site';

// GO term IDs used to classify structure type from ancestors
const TYPE_MAP = [
  { id: 'GO:0043226', label: 'organelle' },
  { id: 'GO:0032991', label: 'protein complex' },
  { id: 'GO:0016020', label: 'membrane' },
  { id: 'GO:0005576', label: 'extracellular region' },
  { id: 'GO:0042995', label: 'cell projection' },
  { id: 'GO:0030054', label: 'cell junction' },
];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query parameter q' }), {
      status: 400,
      headers: corsHeaders('application/json'),
    });
  }

  const cacheKey = `cellbio:${q.toLowerCase()}`;

  if (env.SPECIMEN_KV) {
    const cached = await env.SPECIMEN_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { ...corsHeaders('application/json'), 'X-Cache': 'HIT' },
      });
    }
  }

  try {
    // Step 1: Search QuickGO for the cellular component term
    const searchRes = await fetch(
      `https://www.ebi.ac.uk/QuickGO/services/ontology/go/search?query=${encodeURIComponent(q)}&limit=5&aspect=cellular_component`,
      { headers: { Accept: 'application/json' } }
    );
    if (!searchRes.ok) throw new Error('QuickGO search failed');
    const searchData = await searchRes.json();

    // Find the best match — prefer exact name match, then first result
    const results = (searchData.results || []).filter(r => !r.isObsolete);
    if (results.length === 0) {
      const empty = JSON.stringify({ result: null });
      if (env.SPECIMEN_KV) await env.SPECIMEN_KV.put(cacheKey, empty, { expirationTtl: CACHE_TTL });
      return new Response(empty, { headers: corsHeaders('application/json') });
    }

    const exact = results.find(r => r.name.toLowerCase() === q.toLowerCase()) || results[0];
    const goId = exact.id;
    const name = exact.name;
    const definition = exact.definition?.text || null;
    const synonyms = (exact.synonyms || [])
      .filter(s => s.type === 'exact' || s.type === 'related')
      .map(s => s.name)
      .filter(s => s.toLowerCase() !== name.toLowerCase())
      .slice(0, 3);
    const ancestors = exact.ancestors || [];

    // Determine structure type from ancestor list
    let structureType = 'cellular structure';
    for (const mapping of TYPE_MAP) {
      if (ancestors.includes(mapping.id)) {
        structureType = mapping.label;
        break;
      }
    }

    // Step 2: Fetch children (related structures)
    let children = [];
    try {
      const childRes = await fetch(
        `https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${encodeURIComponent(goId)}/children`,
        { headers: { Accept: 'application/json' } }
      );
      if (childRes.ok) {
        const childData = await childRes.json();
        const rawChildren = childData.results?.[0]?.children || [];
        children = rawChildren
          .filter(c => c.relation === 'part_of' || c.relation === 'is_a')
          .map(c => ({ id: c.id, name: c.name, relation: c.relation }))
          .slice(0, 8);
      }
    } catch (e) { /* children are non-critical, continue */ }

    // Step 3: Fetch key proteins from UniProt annotated to this GO term
    let keyProteins = [];
    try {
      const goQuery = `(go_c:"${goId}") AND (organism_id:9606) AND (reviewed:true)`;
      const protRes = await fetch(
        `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(goQuery)}&fields=accession,id,gene_names,protein_name&format=json&size=6`,
        { headers: { Accept: 'application/json' } }
      );
      if (protRes.ok) {
        const protData = await protRes.json();
        keyProteins = (protData.results || []).map(p => ({
          accession: p.primaryAccession,
          gene: p.genes?.[0]?.geneName?.value || p.uniProtkbId,
          name: p.proteinDescription?.recommendedName?.fullName?.value
            || p.proteinDescription?.submissionNames?.[0]?.fullName?.value
            || p.uniProtkbId,
        })).filter(p => p.gene);
      }
    } catch (e) { /* key proteins are non-critical, continue */ }

    const result = {
      goId,
      name,
      structureType,
      definition,
      synonyms,
      children,
      keyProteins,
    };

    const body = JSON.stringify({ result });
    if (env.SPECIMEN_KV) {
      await env.SPECIMEN_KV.put(cacheKey, body, { expirationTtl: CACHE_TTL });
    }

    return new Response(body, {
      headers: { ...corsHeaders('application/json'), 'X-Cache': 'MISS' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ result: null, error: e.message }), {
      status: 502,
      headers: corsHeaders('application/json'),
    });
  }
}

function corsHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  };
}
