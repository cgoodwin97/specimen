const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days — interaction networks are stable
const SPECIES_HUMAN = 9606;
const TOP_N = 5;
const MIN_SCORE = 400; // STRING confidence score cutoff (0-1000 scale), 400 = "medium confidence"
const CALLER = 'https://specimen.site';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return new Response(JSON.stringify({ error: 'Missing query parameter q' }), {
      status: 400,
      headers: corsHeaders('application/json'),
    });
  }

  const cacheKey = `string:${q.toLowerCase()}`;

  if (env.SPECIMEN_KV) {
    const cached = await env.SPECIMEN_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { ...corsHeaders('application/json'), 'X-Cache': 'HIT' },
      });
    }
  }

  try {
    // Step 1: resolve the gene symbol to a STRING internal ID
    const idUrl = `https://string-db.org/api/json/get_string_ids?identifiers=${encodeURIComponent(q)}&species=${SPECIES_HUMAN}&limit=1&caller_identity=${encodeURIComponent(CALLER)}`;
    const idRes = await fetch(idUrl, { headers: { Accept: 'application/json' } });
    if (!idRes.ok) throw new Error('STRING ID lookup failed');
    const idData = await idRes.json();
    const match = idData?.[0];

    if (!match || !match.stringId) {
      const empty = JSON.stringify({ result: [] });
      if (env.SPECIMEN_KV) await env.SPECIMEN_KV.put(cacheKey, empty, { expirationTtl: CACHE_TTL });
      return new Response(empty, { headers: corsHeaders('application/json') });
    }

    // Step 2: fetch top interaction partners for that STRING ID
    const partnersUrl = `https://string-db.org/api/json/interaction_partners?identifiers=${encodeURIComponent(match.stringId)}&species=${SPECIES_HUMAN}&limit=${TOP_N}&required_score=${MIN_SCORE}&caller_identity=${encodeURIComponent(CALLER)}`;
    const partnersRes = await fetch(partnersUrl, { headers: { Accept: 'application/json' } });
    if (!partnersRes.ok) throw new Error('STRING interaction_partners failed');
    const partnersData = await partnersRes.json();

    const partners = (partnersData || [])
      .map(p => ({
        gene: p.preferredName_B,
        score: p.score,
      }))
      .filter(p => p.gene && p.gene.toLowerCase() !== q.toLowerCase())
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    const body = JSON.stringify({ result: partners });

    if (env.SPECIMEN_KV) {
      await env.SPECIMEN_KV.put(cacheKey, body, { expirationTtl: CACHE_TTL });
    }

    return new Response(body, {
      headers: { ...corsHeaders('application/json'), 'X-Cache': 'MISS' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ result: [], error: e.message }), {
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
