// /functions/api/hpaimage.js
// Fetches a subcellular immunofluorescence image URL from the Human Protein Atlas.
// Uses the search XML endpoint (?format=xml&compress=no) which is publicly documented.
// Results are cached in KV for 30 days.
//
// GET /api/hpaimage?gene=ENSG00000173726
// Returns: { imageUrl, geneName, cellLine, profileUrl }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const gene = url.searchParams.get('gene');

  if (!gene || !/^ENSG\d+$/.test(gene)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid gene parameter' }), {
      status: 400,
      headers: corsHeaders()
    });
  }

  const cacheKey = `hpa:${gene}`;

  // Check KV cache first
  try {
    const cached = await env.SPECIMEN_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }
  } catch (_) {}

  // HPA documents this search XML endpoint in their public API help pages.
  // compress=no returns uncompressed XML. We use a real browser User-Agent
  // since HPA blocks generic bot strings.
  const xmlUrl = `https://www.proteinatlas.org/search/external_id:${gene}?format=xml&compress=no`;

  let xmlText;
  try {
    const hpaRes = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Specimen/1.0; +https://specimen.site)',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    // Log status for Cloudflare dashboard debugging
    console.log(`HPA fetch ${gene}: status=${hpaRes.status} url=${xmlUrl}`);

    if (!hpaRes.ok) {
      console.error(`HPA returned ${hpaRes.status} for ${gene}`);
      return new Response(JSON.stringify({ error: `HPA returned ${hpaRes.status}` }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    xmlText = await hpaRes.text();
    console.log(`HPA XML length for ${gene}: ${xmlText.length} chars`);
  } catch (e) {
    console.error(`HPA fetch error for ${gene}: ${e.message}`);
    return new Response(JSON.stringify({ error: 'Failed to fetch HPA data', detail: e.message }), {
      status: 502,
      headers: corsHeaders()
    });
  }

  // Parse image URL from the XML.
  // The cellExpression block contains subAssay > data > assayImage > image > imageUrl
  const geneName = xmlText.match(/<entry[^>]+name="([^"]+)"/)?.[1] || gene;

  const cellExprMatch = xmlText.match(/<cellExpression>([\s\S]*?)<\/cellExpression>/);
  let imageUrl = null;
  let cellLine = null;

  if (cellExprMatch) {
    const block = cellExprMatch[1];
    const imgMatch = block.match(/<imageUrl>([^<]+)<\/imageUrl>/);
    if (imgMatch) {
      let raw = imgMatch[1].trim();
      // Normalise to the blue_red_green composite channel
      raw = raw.replace(/_(blue|red|green|yellow|blue_red|red_green|blue_green)(\.jpg)$/, '_blue_red_green$2');
      imageUrl = raw;
    }
    const cellMatch = block.match(/<cellLine>([^<]+)<\/cellLine>/);
    if (cellMatch) cellLine = cellMatch[1].trim();
  }

  // Log what was found so we can verify the parse worked
  console.log(`HPA parse ${gene}: imageUrl=${imageUrl} cellLine=${cellLine}`);

  if (!imageUrl) {
    console.error(`No imageUrl found in XML for ${gene}. XML snippet: ${xmlText.slice(0, 500)}`);
    return new Response(JSON.stringify({ error: 'No subcellular image found for this gene' }), {
      status: 404,
      headers: corsHeaders()
    });
  }

  const result = {
    imageUrl,
    geneName,
    cellLine: cellLine || 'human cell line',
    profileUrl: `https://www.proteinatlas.org/${gene}-${geneName}/subcellular`
  };

  // Cache for 30 days
  try {
    await env.SPECIMEN_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 2592000 });
  } catch (_) {}

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
