const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days — GO definitions rarely change

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const term = (url.searchParams.get('term') || '').trim();

  if (!term) {
    return new Response(JSON.stringify({ error: 'Missing query parameter term' }), {
      status: 400,
      headers: corsHeaders('application/json'),
    });
  }

  const cacheKey = `go:${term.toLowerCase()}`;

  // Check KV cache first
  if (env.SPECIMEN_KV) {
    const cached = await env.SPECIMEN_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { ...corsHeaders('application/json'), 'X-Cache': 'HIT' },
      });
    }
  }

  // Fetch from QuickGO
  try {
    const encoded = encodeURIComponent(term);
    const res = await fetch(
      `https://www.ebi.ac.uk/QuickGO/services/ontology/go/search?query=${encoded}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('QuickGO error');
    const data = await res.json();
    const hit = data.results?.[0];

    if (!hit) {
      return new Response(JSON.stringify({ result: null }), {
        headers: corsHeaders('application/json'),
      });
    }

    const result = {
      id: hit.id,
      name: hit.name,
      definition: hit.definition?.text || null,
      ancestors: hit.ancestors || [],
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
