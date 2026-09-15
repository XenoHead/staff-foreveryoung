export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    }
  });
}

// Fetch with automatic retry for 429 rate limits
async function fetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, options);
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      // Discogs Retry-After is in seconds, fallback to exponential backoff
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    return resp;
  }
  throw new Error(`Rate limited by Discogs API after ${retries} retries.`);
}

async function fetchAndGetFirstReleaseId(url, headers, token) {
  if (token) {
    const resp = await fetchWithRetry(url, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
  } else {
    // Fallback web scraper for search
    const resp = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const match = html.match(/\/release\/(\d+)/);
    if (match) return match[1];
  }
  return null;
}

// Search Discogs release ID by criteria
async function searchDiscogs(artist, title, format, barcode, description, token) {
  const headers = {
    'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com'
  };

  // 1. Try Barcode search
  if (barcode) {
    const cleanBarcode = barcode.replace(/[^0-9X]/gi, '');
    if (cleanBarcode) {
      let url = token
        ? `https://api.discogs.com/database/search?barcode=${encodeURIComponent(cleanBarcode)}&token=${token}`
        : `https://www.discogs.com/search/?q=${encodeURIComponent(cleanBarcode)}&type=release`;
      try {
        const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
        if (releaseId) return releaseId;
      } catch (e) {}
    }
  }

  // 2. Try to extract catalog number
  let catno = '';
  if (description && description.includes(' - ')) {
    const parts = description.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (!/out of print/i.test(lastPart) && !/factory sealed/i.test(lastPart) && lastPart.length < 30) {
      const words = lastPart.split(' ');
      const possibleCat = words[words.length - 1].trim();
      if (possibleCat && possibleCat.length > 2 && /[0-9A-Z]/i.test(possibleCat)) {
        catno = possibleCat;
      }
    }
  }

  if (catno) {
    let url = token
      ? `https://api.discogs.com/database/search?catno=${encodeURIComponent(catno)}&token=${token}`
      : `https://www.discogs.com/search/?q=${encodeURIComponent(catno)}&type=release`;
    try {
      const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
      if (releaseId) return releaseId;
    } catch (e) {}
  }

  // 3. Try Artist + Title Search
  if (artist && title) {
    let query = `${artist} ${title}`;
    let url = token
      ? `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&format=${encodeURIComponent(format || '')}&token=${token}`
      : `https://www.discogs.com/search/?q=${encodeURIComponent(query + ' ' + (format || ''))}&type=release`;
    try {
      const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
      if (releaseId) return releaseId;
    } catch (e) {}
  }

  return null;
}

// Fetch full details of a release ID
async function fetchReleaseDetails(releaseId, token) {
  const url = `https://api.discogs.com/releases/${releaseId}${token ? `?token=${token}` : ''}`;
  const resp = await fetchWithRetry(url, {
    headers: { 'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com' }
  });

  if (!resp.ok) throw new Error(`Discogs returned: ${resp.status}`);
  const data = await resp.json();

  let frontImg = '';
  let backImg = '';
  if (data.images && data.images.length > 0) {
    const primary = data.images.find(img => img.type === 'primary') || data.images[0];
    frontImg = primary.uri || '';
    const secondary = data.images.find(img => img.type === 'secondary');
    if (secondary) backImg = secondary.uri;
  }

  let label = '';
  let catno = '';
  if (data.labels && data.labels.length > 0) {
    label = data.labels[0].name || '';
    catno = data.labels[0].catno || '';
    if (catno === 'none') catno = '';
  }

  const dateStr = data.released || data.year || '';
  const genre = (data.genres && data.genres.length > 0) ? data.genres.join(', ') : '';
  const country = data.country || '';
  
  let audioUrls = [];
  if (data.videos && data.videos.length > 0) {
    audioUrls = data.videos.map(v => v.uri);
  }

  let numInSet = '';
  let formatStr = '';
  if (data.formats && data.formats.length > 0) {
    const fmt = data.formats[0];
    formatStr = fmt.name || '';
    if (fmt.qty && parseInt(fmt.qty) > 1) {
      numInSet = `${fmt.qty} ${fmt.name}`;
      formatStr = `${fmt.qty}${fmt.name}`;
    }
  }

  let notes = data.notes || '';
  let tracklist = '';
  if (data.tracklist && data.tracklist.length > 0) {
    tracklist = data.tracklist.map(t => `${t.position || ''} ${t.title || ''} ${t.duration || ''}`).join('\n').trim();
  }

  let fullDesc = notes;
  if (tracklist) fullDesc += (fullDesc ? '\n\n' : '') + 'Tracklist:\n' + tracklist;

  return {
    Discogs_ID: releaseId.toString(),
    Discogs_url: `https://www.discogs.com/release/${releaseId}`,
    Format: formatStr,
    Front_Image_URL: frontImg,
    Back_Image_URL: backImg,
    Label: label,
    Release_Catalog_Number: catno,
    Release_Country: country,
    Release_Date: dateStr.toString(),
    Genre: genre,
    YouTube_Audio_Image_URLs: audioUrls.join(', '),
    Number_In_Set: numInSet,
    Description: fullDesc,
    Bar_Code: (data.identifiers && data.identifiers.find(i => i.type === 'Barcode')) ? data.identifiers.find(i => i.type === 'Barcode').value : ''
  };
}

export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const { request, env } = context;
    const body = await request.json();
    const { id, artist, title, format, barcode, description, discogs_id } = body;

    const token = env.DISCOGS_TOKEN || '';
    let releaseId = discogs_id;

    if (!releaseId) {
      releaseId = await searchDiscogs(artist, title, format, barcode, description, token);
    }

    if (!releaseId) {
      return new Response(JSON.stringify({ success: false, error: "not_found" }), { status: 200, headers: corsHeaders });
    }

    const details = await fetchReleaseDetails(releaseId, token);

    if (id) {
      const db = env.DB;
      await db.prepare(`
        UPDATE Online_Inventory SET 
          Discogs_ID = coalesce(NULLIF(?, ''), Discogs_ID),
          Discogs_url = coalesce(NULLIF(?, ''), Discogs_url),
          Bar_Code = coalesce(NULLIF(?, ''), Bar_Code),
          Front_Image_URL = coalesce(NULLIF(?, ''), Front_Image_URL),
          Back_Image_URL = coalesce(NULLIF(?, ''), Back_Image_URL),
          Label = coalesce(NULLIF(?, ''), Label),
          Release_Catalog_Number = coalesce(NULLIF(?, ''), Release_Catalog_Number),
          Release_Country = coalesce(NULLIF(?, ''), Release_Country),
          Release_Date = coalesce(NULLIF(?, ''), Release_Date),
          Genre = coalesce(NULLIF(?, ''), Genre),
          YouTube_Audio_Image_URLs = coalesce(NULLIF(?, ''), YouTube_Audio_Image_URLs),
          Number_In_Set = coalesce(NULLIF(?, ''), Number_In_Set),
          Description = coalesce(NULLIF(?, ''), Description)
        WHERE id = ?
      `).bind(
        details.Discogs_ID,
        details.Discogs_url,
        details.Bar_Code,
        details.Front_Image_URL,
        details.Back_Image_URL,
        details.Label,
        details.Release_Catalog_Number,
        details.Release_Country,
        details.Release_Date,
        details.Genre,
        details.YouTube_Audio_Image_URLs,
        details.Number_In_Set,
        details.Description,
        id
      ).run();
    }

    return new Response(JSON.stringify({ success: true, details }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
  }
}
