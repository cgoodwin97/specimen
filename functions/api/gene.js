const FIELDS = "accession,id,protein_name,gene_names,organism_name,cc_function,xref_pdb,xref_alphafolddb,xref_reactome,go_p,go_f,go_c,length";
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

const QUERIES = (term, t) => [
  `(gene:${t}) AND (organism_id:9606) AND (reviewed:true)`,
  `(gene:${t}) AND (organism_id:9606)`,
  `(${t}) AND (organism_id:9606)`,
  `(${t})`
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

  const cacheKey = `gene:${q.toLowerCase()}`;

  // Check KV cache first
  if (env.SPECIMEN_KV) {
    const cached = await env.SPECIMEN_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { ...corsHeaders('application/json'), 'X-Cache': 'HIT' },
      });
    }
  }

  // If query looks like a UniProt accession, fetch it directly
  // UniProt accession format: [A-Z][0-9][A-Z0-9]{3}[0-9] or [O,P,Q][0-9][A-Z0-9]{3}[0-9]
  const isAccession = /^[A-Z][0-9][A-Z0-9]{3}[0-9]$/i.test(q) || /^[A-Z][0-9][A-Z0-9]{3}[0-9]-[0-9]+$/i.test(q);
  if (isAccession) {
    const accUrl = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(q.toUpperCase())}?fields=${FIELDS}&format=json`;
    try {
      const res = await fetch(accUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const entry = await res.json();
        if (entry && entry.primaryAccession) {
          const body = JSON.stringify({ result: entry });
          if (env.SPECIMEN_KV) {
            await env.SPECIMEN_KV.put(cacheKey, body, { expirationTtl: CACHE_TTL });
          }
          return new Response(body, {
            headers: { ...corsHeaders('application/json'), 'X-Cache': 'MISS' },
          });
        }
      }
    } catch (e) { /* fall through to search queries */ }
  }

  // Not cached — try UniProt queries in order
  const t = q;
  for (const query of QUERIES(q, t)) {
    const apiUrl = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&fields=${FIELDS}&format=json&size=1`;
    try {
      const res = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.results || data.results.length === 0) continue;

      const body = JSON.stringify({ result: data.results[0] });

      // Store in KV
      if (env.SPECIMEN_KV) {
        await env.SPECIMEN_KV.put(cacheKey, body, { expirationTtl: CACHE_TTL });
      }

      return new Response(body, {
        headers: { ...corsHeaders('application/json'), 'X-Cache': 'MISS' },
      });
    } catch (e) {
      continue;
    }
  }

  return new Response(JSON.stringify({ result: null }), {
    headers: corsHeaders('application/json'),
  });
}

function corsHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  };
}
