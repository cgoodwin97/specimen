// /functions/api/hpaimage.js
// Fetches a subcellular immunofluorescence image URL from the Human Protein Atlas
// for a given Ensembl gene ID. Parses the HPA XML, extracts the first subcellular
// assay image URL, and caches the result in KV for 30 days.
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

  // Fetch HPA XML for this gene
  let xmlText;
  try {
    const hpaRes = await fetch(`https://www.proteinatlas.org/${gene}.xml`, {
      headers: { 'User-Agent': 'Specimen/1.0 (specimen.site; educational tool)' }
    });
    if (!hpaRes.ok) {
      return new Response(JSON.stringify({ error: 'HPA not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    xmlText = await hpaRes.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch HPA data' }), {
      status: 502,
      headers: corsHeaders()
    });
  }

  // Parse out what we need from the XML
  // HPA XML structure: <entry name="GENE"><cellExpression><subAssay type="human">
  //   <data><assayImage><image><imageUrl>https://images.proteinatlas.org/...</imageUrl>
  //         <cellLine>...</cellLine></image></assayImage></data></subAssay></cellExpression>

  const geneName = xmlText.match(/<entry[^>]+name="([^"]+)"/)?.[1] || gene;

  // Extract first imageUrl from the cellExpression/subAssay section
  // We want the blue_red_green composite (all channels) image
  const cellExprMatch = xmlText.match(/<cellExpression>([\s\S]*?)<\/cellExpression>/);
  let imageUrl = null;
  let cellLine = null;

  if (cellExprMatch) {
    const cellExprXml = cellExprMatch[1];
    // Find the first imageUrl
    const imgMatch = cellExprXml.match(/<imageUrl>([^<]+)<\/imageUrl>/);
    if (imgMatch) {
      let raw = imgMatch[1].trim();
      // Ensure we get the composite (blue_red_green) version
      // HPA image URLs look like: .../HPA001234_A-1_blue_red_green.jpg
      // or may already be the composite — normalise to blue_red_green
      if (raw.match(/_(blue|red|green|yellow)_/)) {
        raw = raw.replace(/_(blue|red|green|yellow|blue_red|red_green|blue_green)\.jpg$/, '_blue_red_green.jpg');
      }
      imageUrl = raw;
    }
    // Extract cell line name from the same block
    const cellMatch = cellExprXml.match(/<cellLine>([^<]+)<\/cellLine>/);
    if (cellMatch) cellLine = cellMatch[1].trim();
  }

  if (!imageUrl) {
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

  // Cache in KV for 30 days (2592000 seconds)
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
