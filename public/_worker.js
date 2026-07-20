/**
 * _worker.js — Forever Young Staff Portal
 * Consolidated Cloudflare Worker (replaces functions/api/*.js)
 * Run locally against the LIVE D1 database:
 *   npx wrangler dev --remote
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function cors() {
  return new Response(null, { status: 204, headers: CORS });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return cors();

    try {
      // /api/discogs-lookup
      if (path === '/api/discogs-lookup' && method === 'GET')
        return await handleDiscogsLookup(request);

      // /api/featured
      if (path === '/api/featured') {
        if (method === 'GET')  return await handleFeaturedGet(request, env);
        if (method === 'POST') return await handleFeaturedPost(request, env);
      }

      // /api/instore-search
      if (path === '/api/instore-search' && method === 'GET')
        return await handleInstoreSearch(request, env);

      // /api/inventory-search
      if (path === '/api/inventory-search' && method === 'GET')
        return await handleInventorySearch(request, env);

      // /api/enrich
      if (path === '/api/enrich' && method === 'POST')
        return await handleEnrich(request, env);

      // /api/online-search
      if (path === '/api/online-search' && method === 'GET')
        return await handleOnlineSearch(request, env);

      // /api/online-update
      if (path === '/api/online-update' && method === 'POST')
        return await handleOnlineUpdate(request, env);

      // /api/instore-update
      if (path === '/api/instore-update' && method === 'POST')
        return await handleInstoreUpdate(request, env);

      // /api/punch
      if (path === '/api/punch') {
        if (method === 'GET')  return await handlePunchGet(request, env);
        if (method === 'POST') return await handlePunchPost(request, env);
      }

      // /api/queue
      if (path === '/api/queue' && method === 'GET')
        return await handleQueue(env);

      // /api/redeem
      if (path === '/api/redeem' && method === 'POST')
        return await handleRedeem(request, env);

      // /api/sales
      if (path === '/api/sales' && method === 'GET')
        return await handleSales(request, env);

      // /api/sync
      if (path === '/api/sync' && method === 'POST')
        return await handleSync(request, env);

      // /api/ticker
      if (path === '/api/ticker') {
        if (method === 'GET')  return await handleTickerGet(env);
        if (method === 'POST') return await handleTickerPost(request, env);
      }

      // Static assets fallback
      return env.ASSETS.fetch(request);

    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  },
};

// ─── Handlers ────────────────────────────────────────────────────────────────

// ─── Enrich helpers ──────────────────────────────────────────────────────────

async function enrichFetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, options);
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
      await new Promise(r => setTimeout(r, waitTime));
      continue;
    }
    return resp;
  }
  throw new Error(`Rate limited by Discogs API after ${retries} retries.`);
}

async function enrichSearchDiscogs(artist, title, format, barcode, description, token) {
  const headers = { 'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com' };

  const trySearch = async (searchUrl) => {
    try {
      const resp = await enrichFetchWithRetry(searchUrl, { headers });
      if (!resp.ok) return null;
      const data = await resp.json();
      return (data.results && data.results.length > 0) ? data.results[0].id : null;
    } catch (e) { return null; }
  };

  // 1. Barcode
  if (barcode) {
    const clean = barcode.replace(/[^0-9X]/gi, '');
    if (clean) {
      const id = await trySearch(`https://api.discogs.com/database/search?barcode=${encodeURIComponent(clean)}&token=${token}`);
      if (id) return id;
    }
  }

  // 2. Catalog number from description
  if (description && description.includes(' - ')) {
    const parts = description.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (!/out of print|factory sealed/i.test(lastPart) && lastPart.length < 30) {
      const words = lastPart.split(' ');
      const possibleCat = words[words.length - 1].trim();
      if (possibleCat && possibleCat.length > 2 && /[0-9A-Z]/i.test(possibleCat)) {
        const id = await trySearch(`https://api.discogs.com/database/search?catno=${encodeURIComponent(possibleCat)}&token=${token}`);
        if (id) return id;
      }
    }
  }

  // 3. Artist + Title
  if (artist && title) {
    const q = `${artist} ${title}`;
    const id = await trySearch(`https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=release&format=${encodeURIComponent(format || '')}&token=${token}`);
    if (id) return id;
  }

  return null;
}

async function enrichFetchReleaseDetails(releaseId, token) {
  const url = `https://api.discogs.com/releases/${releaseId}${token ? `?token=${token}` : ''}`;
  const resp = await enrichFetchWithRetry(url, { headers: { 'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com' } });
  if (!resp.ok) throw new Error(`Discogs returned: ${resp.status}`);
  const data = await resp.json();

  let frontImg = '', backImg = '';
  if (data.images?.length) {
    const primary = data.images.find(i => i.type === 'primary') || data.images[0];
    frontImg = primary.uri || '';
    const secondary = data.images.find(i => i.type === 'secondary');
    if (secondary) backImg = secondary.uri;
  }

  let label = '', catno = '';
  if (data.labels?.length) {
    label = data.labels[0].name || '';
    catno = data.labels[0].catno || '';
    if (catno === 'none') catno = '';
  }

  const dateStr = data.released || data.year || '';
  const genre = (data.genres?.length) ? data.genres.join(', ') : '';
  const country = data.country || '';
  const audioUrls = data.videos ? data.videos.map(v => v.uri) : [];

  let numInSet = '';
  if (data.formats?.length) {
    const fmt = data.formats[0];
    if (fmt.qty && parseInt(fmt.qty) > 1) numInSet = `${fmt.qty} ${fmt.name}`;
  }

  let tracklist = '';
  if (data.tracklist?.length) {
    tracklist = data.tracklist.map(t => `${t.position || ''} ${t.title || ''} ${t.duration || ''}`).join('\n').trim();
  }
  let fullDesc = data.notes || '';
  if (tracklist) fullDesc += (fullDesc ? '\n\n' : '') + 'Tracklist:\n' + tracklist;

  const barcode = data.identifiers?.find(i => i.type === 'Barcode')?.value || '';

  return {
    Discogs_ID: releaseId.toString(),
    Discogs_url: `https://www.discogs.com/release/${releaseId}`,
    Front_Image_URL: frontImg, Back_Image_URL: backImg,
    Label: label, Release_Catalog_Number: catno,
    Release_Country: country, Release_Date: dateStr.toString(),
    Genre: genre, YouTube_Audio_Image_URLs: audioUrls.join(', '),
    Number_In_Set: numInSet, Description: fullDesc, Bar_Code: barcode,
  };
}

async function handleEnrich(request, env) {
  try {
    const body = await request.json();
    const { id, artist, title, format, barcode, description, discogs_id } = body;
    const token = env.DISCOGS_TOKEN || '';

    let releaseId = discogs_id;
    if (!releaseId) {
      releaseId = await enrichSearchDiscogs(artist, title, format, barcode, description, token);
    }

    if (!releaseId) {
      return json({ success: false, error: 'not_found' });
    }

    const details = await enrichFetchReleaseDetails(releaseId, token);

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
        details.Discogs_ID, details.Discogs_url,
        details.Bar_Code, details.Front_Image_URL, details.Back_Image_URL,
        details.Label, details.Release_Catalog_Number, details.Release_Country,
        details.Release_Date, details.Genre, details.YouTube_Audio_Image_URLs,
        details.Number_In_Set, details.Description, id
      ).run();
    }

    return json({ success: true, details });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}


async function handleDiscogsLookup(request) {
  const url = new URL(request.url);
  const releaseId = url.searchParams.get('id') || '';
  if (!releaseId) return json({ error: 'Missing release ID.' }, 400);

  const resp = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
    headers: { 'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com' },
  });
  if (resp.status === 404) return json({ error: 'Release not found on Discogs.' }, 404);
  if (!resp.ok) return json({ error: `Discogs error: ${resp.status} ${resp.statusText}` }, resp.status);

  const data = await resp.json();

  const artistStr = data.artists ? data.artists.map(a => a.name.replace(/\s*\(\d+\)$/, '')).join(', ') : '';
  const titleStr = data.title || '';

  let formatStr = '';
  if (data.formats?.length) {
    formatStr = data.formats.map(f => {
      const qty = f.qty && parseInt(f.qty) > 1 ? `${f.qty}x ` : '';
      const desc = f.descriptions ? ` (${f.descriptions.join(', ')})` : '';
      return `${qty}${f.name}${desc}`;
    }).join(', ');
  }

  const genreList = [...(data.genres || []), ...(data.styles || [])];
  const genreStr = [...new Set(genreList)].join(', ');
  const labelStr = data.labels?.map(l => l.name).join(', ') || '';
  const catalogStr = data.labels?.map(l => l.catno).join(', ') || '';
  const countryStr = data.country || '';
  const dateStr = data.released || (data.year ? String(data.year) : '');

  let barcodeStr = '';
  if (data.identifiers) {
    const b = data.identifiers.find(i => i.type === 'barcode');
    if (b?.value) barcodeStr = b.value.replace(/[^0-9X]/gi, '');
  }

  let frontImg = '', backImg = '';
  if (data.images?.length) {
    const primary = data.images.find(i => i.type === 'primary');
    frontImg = primary ? primary.resource_url : data.images[0].resource_url;
    const secondary = data.images.filter(i => i.type !== 'primary');
    if (secondary.length) backImg = secondary[0].resource_url;
  }

  const youtubeStr = data.videos ? data.videos.map(v => v.uri).join(', ') : '';

  let numInSet = '';
  if (data.formats) {
    const total = data.formats.reduce((s, f) => s + (parseInt(f.qty) || 0), 0);
    if (total > 0) numInSet = String(total);
  }

  const descLines = [];
  if (data.tracklist?.length) {
    descLines.push('TRACKLIST:');
    data.tracklist.forEach(t => {
      if (t.title) descLines.push(`${t.position ? t.position + '. ' : ''}${t.title}${t.duration ? ' (' + t.duration + ')' : ''}`);
    });
  }
  if (data.notes) { if (descLines.length) descLines.push(''); descLines.push('RELEASE NOTES:', data.notes); }

  return json({ success: true, result: {
    Artist: artistStr, Title: titleStr, Format: formatStr, Genre: genreStr,
    Label: labelStr, Release_Catalog_Number: catalogStr, Release_Country: countryStr,
    Release_Date: dateStr, Bar_Code: barcodeStr, Front_Image_URL: frontImg,
    Back_Image_URL: backImg, YouTube_Audio_Image_URLs: youtubeStr,
    Number_In_Set: numInSet, Description: descLines.join('\n'), Discogs_ID: String(data.id),
    Discogs_url: `https://www.discogs.com/release/${data.id}`,
  }});
}

async function handleFeaturedGet(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  
  const keys = ['featured_new', 'featured_new_releases', 'featured_hot', 'featured_rare', 'featured_temp1', 'featured_temp2', 'featured_genres'];
  const settings = {};
  for (const k of keys) {
    const res = await db.prepare(`SELECT value FROM Settings WHERE key=?`).bind(k).first();
    settings[k] = res?.value || '';
  }
  
  const compatRes = await db.prepare(`SELECT value FROM Settings WHERE key='featured_items'`).first();
  const compatValue = compatRes?.value || '';

  if (type === 'config') {
    const row = await db.prepare(`SELECT value FROM Settings WHERE key='crate_config'`).first();
    const config = row ? JSON.parse(row.value || '{}') : {};
    return json({ success: true, config });
  }

  if (type === 'details') {
    const details = {
      new: { value: settings.featured_new, items: [] },
      new_releases: { value: settings.featured_new_releases, items: [] },
      hot: { value: settings.featured_hot, items: [] },
      rare: { value: settings.featured_rare, items: [] },
      temp1: { value: settings.featured_temp1, items: [] },
      temp2: { value: settings.featured_temp2, items: [] },
      genres: { value: settings.featured_genres, items: [] }
    };
    
    for (const k of ['new', 'new_releases', 'hot', 'rare', 'temp1', 'temp2', 'genres']) {
      const val = settings['featured_' + k];
      if (val) {
        const refs = val.split(',').map(r => r.trim()).filter(Boolean);
        if (refs.length) {
          // 1. Fetch from Online_Inventory
          const ph = refs.map(() => '?').join(',');
          const q = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${ph}) OR Bar_Code IN (${ph})`;
          const d = await db.prepare(q).bind(...refs, ...refs).all();
          const onlineItems = (d.results || []).map(item => ({ ...item, _source: 'online' }));
          
          // Identify missing references/UPCs
          const foundRefs = new Set();
          onlineItems.forEach(item => {
            if (item.Seller_Reference_Number) foundRefs.add(item.Seller_Reference_Number.toLowerCase());
            if (item.Bar_Code) foundRefs.add(item.Bar_Code.toLowerCase());
          });
          
          const missingRefs = refs.filter(r => !foundRefs.has(r.toLowerCase()));
          let instoreItems = [];
          
          if (missingRefs.length > 0) {
            // 2. Fetch from Inventory (In-Store)
            const instorePh = missingRefs.map(() => '?').join(',');
            const instoreQuery = `SELECT * FROM Inventory WHERE UPC IN (${instorePh}) OR Vendor_Number IN (${instorePh})`;
            const instoreResult = await db.prepare(instoreQuery).bind(...missingRefs, ...missingRefs).all();
            
            instoreItems = (instoreResult.results || []).map(item => ({
              id: item.id,
              Artist: item.Artist,
              Title: item.Title,
              Format: item.Format,
              Price: parseFloat(item.SRP) || 0.00,
              Bar_Code: item.UPC,
              Quantity: item.Quantity,
              _source: 'instore'
            }));
          }
          
          details[k].items = [...onlineItems, ...instoreItems];
        }
      }
    }
    return json({ success: true, ...details, compatValue });
  }
  
  return json({ success: true, ...settings, compatValue });
}

async function handleFeaturedPost(request, env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const body = await request.json();
  
  if (body.config !== undefined) {
    const configStr = JSON.stringify(body.config);
    await db.prepare(`INSERT INTO Settings (key, value) VALUES ('crate_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(configStr)
      .run();
    return json({ success: true });
  }
  
  for (const k of ['new', 'new_releases', 'hot', 'rare', 'temp1', 'temp2', 'genres']) {
    const valKey = 'featured_' + k;
    if (body[k] !== undefined) {
      await db.prepare(`INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .bind(valKey, body[k])
        .run();
    }
  }
  
  if (body.new !== undefined) {
    await db.prepare(`INSERT INTO Settings (key, value) VALUES ('featured_items', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(body.new)
      .run();
  }
  
  return json({ success: true });
}

async function handleInstoreSearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const upcParam = url.searchParams.get('upc');
  const queryParam = url.searchParams.get('query');
  const query = upcParam || queryParam || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 80);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
  const offset = (page - 1) * limit;

  let filterSql = '', bindParams = [];
  if (query) {
    filterSql = ' AND (UPC LIKE ? OR Artist LIKE ? OR Title LIKE ?)';
    bindParams = [`%${query}%`, `%${query}%`, `%${query}%`];
  }

  // Only filter Quantity > 0 for general searches; UPC lookups include zero-stock items
  const qtyCondition = upcParam ? '' : ' AND Quantity > 0';

  const countQ = `SELECT COUNT(*) as total FROM Inventory WHERE 1=1${qtyCondition}${filterSql}`;
  const countResult = await (bindParams.length
    ? db.prepare(countQ).bind(...bindParams)
    : db.prepare(countQ)).first();
  const total = countResult?.total || 0;

  const dataQ = `SELECT id, UPC, Quantity, Format, Artist, Title, Vendor_Number, Year, SRP FROM Inventory WHERE 1=1${qtyCondition}${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await db.prepare(dataQ).bind(...bindParams, limit, offset).all();
  return json({ success: true, results: results.results, total, page, limit });
}

async function handleInventorySearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const upc = url.searchParams.get('upc') || '';
  const artist = url.searchParams.get('artist') || '';
  const title = url.searchParams.get('album') || '';
  const catalog = url.searchParams.get('catalog') || '';
  const queryVal = url.searchParams.get('query') || '';
  const letterVal = url.searchParams.get('letter') || '';

  let limit = parseInt(url.searchParams.get('limit') || '10');
  if (![10, 20, 40, 80].includes(limit)) limit = 10;
  let page = parseInt(url.searchParams.get('page') || '1');
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;

  const hideZeros = url.searchParams.get('hideZeros') === 'true';
  let filterSql = hideZeros ? ' AND COALESCE(Quantity, 0) > 0' : '', bindParams = [];

  if (letterVal) {
    if (letterVal === '0-9') {
      filterSql += " AND (substr(Artist,1,1) BETWEEN '0' AND '9' OR Artist GLOB '[0-9]*')";
    } else {
      filterSql += ' AND (substr(Artist,1,1) = ? OR substr(Artist,1,1) = ?)';
      bindParams.push(letterVal.toLowerCase(), letterVal.toUpperCase());
    }
  }

  if (queryVal) {
    filterSql += ' AND (Artist LIKE ? OR Title LIKE ? OR UPC LIKE ? OR Vendor_Number LIKE ?)';
    bindParams.push(`%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`);
  } else {
    if (upc)    { filterSql += ' AND UPC LIKE ?';           bindParams.push(`%${upc}%`); }
    if (artist) { filterSql += ' AND Artist LIKE ?';        bindParams.push(`%${artist}%`); }
    if (title)  { filterSql += ' AND Title LIKE ?';         bindParams.push(`%${title}%`); }
    if (catalog){ filterSql += ' AND Vendor_Number = ?';    bindParams.push(catalog); }
  }

  const countQ = `SELECT COUNT(*) as total FROM Inventory WHERE 1=1${filterSql}`;
  const countResult = await (bindParams.length
    ? db.prepare(countQ).bind(...bindParams)
    : db.prepare(countQ)).first();
  const total = countResult?.total || 0;

  const dataQ = `SELECT * FROM Inventory WHERE 1=1${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await db.prepare(dataQ).bind(...bindParams, limit, offset).all();
  return json({ success: true, results: results.results, total, page, limit });
}

async function handleOnlineSearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const queryVal  = url.searchParams.get('query')  || '';
  const formatVal = url.searchParams.get('format') || '%';
  const letterVal = url.searchParams.get('letter') || '';

  let limit = parseInt(url.searchParams.get('limit') || '10');
  if (![10, 20, 40, 80].includes(limit)) limit = 10;
  let page = parseInt(url.searchParams.get('page') || '1');
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;

  // Hide zero-quantity items when requested
  const hideZeros = url.searchParams.get('hideZeros') === 'true';

  let filterSql = hideZeros ? ' AND COALESCE(Quantity, 0) > 0' : '';
  let bindParams = [];

  if (letterVal) {
    if (letterVal === '0-9') {
      filterSql += " AND (substr(Artist,1,1) BETWEEN '0' AND '9' OR Artist GLOB '[0-9]*')";
    } else {
      filterSql += ' AND (substr(Artist,1,1) = ? OR substr(Artist,1,1) = ?)';
      bindParams.push(letterVal.toLowerCase(), letterVal.toUpperCase());
    }
  }

  if (queryVal) {
    filterSql += ' AND (Artist LIKE ? OR Title LIKE ? OR Discogs_ID LIKE ? OR Seller_Reference_Number LIKE ?)';
    bindParams.push(`%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`);
  }

  if (formatVal && formatVal !== '%') {
    const fmtMap = {
      vinyl:      "(Format LIKE '%vinyl%' OR Format LIKE '%LP%' OR Format LIKE '%7\"%' OR Format LIKE '%10\"%' OR Format LIKE '%12\"%' OR Format LIKE '%78%' OR Format LIKE '%EP%')",
      cd:         "(Format LIKE '%CD%')",
      vinyllp:    "(Format LIKE '%LP%' AND Format NOT LIKE '%Box%')",
      vinyl7:     "(Format LIKE '%7\"%')",
      vinyl10:    "(Format LIKE '%10\"%')",
      vinyl12:    "(Format LIKE '%12\"%')",
      vinyl78:    "(Format LIKE '%78%')",
      cdsing:     "(Format LIKE '%CD Single%' OR Format LIKE '%CD Sing%')",
      ep:         "(Format LIKE '%EP%')",
      cassette:   "(Format LIKE '%Cassette%')",
      video:      "(Format LIKE '%Video%' OR Format LIKE '%VHS%' OR Format LIKE '%DVD%')",
      book:       "(Format LIKE '%Book%')",
      clothing:   "(Format LIKE '%Clothing%' OR Format LIKE '%Shirt%')",
      memorabilia:"(Format LIKE '%Memorabilia%')",
    };
    if (fmtMap[formatVal]) {
      filterSql += ` AND ${fmtMap[formatVal]}`;
    } else {
      filterSql += ' AND Format LIKE ?';
      bindParams.push(`%${formatVal}%`);
    }
  }

  const countQ = `SELECT COUNT(*) as total FROM Online_Inventory WHERE 1=1${filterSql}`;
  const countResult = await (bindParams.length
    ? db.prepare(countQ).bind(...bindParams)
    : db.prepare(countQ)).first();
  const total = countResult?.total || 0;

  const dataQ = `SELECT * FROM Online_Inventory WHERE 1=1${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await (bindParams.length
    ? db.prepare(dataQ).bind(...bindParams, limit, offset)
    : db.prepare(dataQ).bind(limit, offset)).all();
  return json({ success: true, results: results.results, total, page, limit });
}

async function handleOnlineUpdate(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const body = await request.json();
  const action = url.searchParams.get('action') || '';

  if (action === 'delete') {
    const id = parseInt(body.id);
    if (!id) return json({ error: 'Missing product ID for deletion.' }, 400);
    await db.prepare('UPDATE Online_Inventory SET Quantity = 0 WHERE id = ?').bind(id).run();
    return json({ success: true, message: 'Product removed from inventory (Quantity set to 0).' });
  }

  const id = body.id ? parseInt(body.id) : null;
  const { Artist='', Title='', Format='', Discogs_ID='', Discogs_url='', Description='',
    Condition_Media='', Condition_Sleeve='', Seller_Reference_Number='', Label='',
    Release_Catalog_Number='', Release_Country='', Release_Date='', Genre='',
    Front_Image_URL='', Back_Image_URL='', YouTube_Audio_Image_URLs='', Bar_Code='', Number_In_Set='',
  } = body;
  const Price = body.Price !== undefined && body.Price !== '' ? parseFloat(body.Price) : null;
  const Quantity = body.Quantity !== undefined && body.Quantity !== '' ? parseInt(body.Quantity) : 0;

  if (!Title && !Artist) return json({ error: 'Artist or Title must be provided.' }, 400);

  const fields = [Artist, Title, Format, Discogs_ID, Discogs_url, Price, Description, Condition_Media,
    Condition_Sleeve, Seller_Reference_Number, Quantity, Label, Release_Catalog_Number,
    Release_Country, Release_Date, Genre, Front_Image_URL, Back_Image_URL,
    YouTube_Audio_Image_URLs, Bar_Code, Number_In_Set];

  if (id) {
    await db.prepare(`UPDATE Online_Inventory SET
      Artist=?,Title=?,Format=?,Discogs_ID=?,Discogs_url=?,Price=?,Description=?,Condition_Media=?,
      Condition_Sleeve=?,Seller_Reference_Number=?,Quantity=?,Label=?,Release_Catalog_Number=?,
      Release_Country=?,Release_Date=?,Genre=?,Front_Image_URL=?,Back_Image_URL=?,
      YouTube_Audio_Image_URLs=?,Bar_Code=?,Number_In_Set=? WHERE id=?`
    ).bind(...fields, id).run();
    return json({ success: true, message: 'Product updated successfully.', id });
  } else {
    await db.prepare(`INSERT INTO Online_Inventory
      (Artist,Title,Format,Discogs_ID,Discogs_url,Price,Description,Condition_Media,Condition_Sleeve,
       Seller_Reference_Number,Quantity,Label,Release_Catalog_Number,Release_Country,Release_Date,
       Genre,Front_Image_URL,Back_Image_URL,YouTube_Audio_Image_URLs,Bar_Code,Number_In_Set)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...fields).run();
    const newRow = await db.prepare('SELECT last_insert_rowid() as id').first();
    return json({ success: true, message: 'Product created successfully.', id: newRow?.id });
  }
}

async function handleInstoreUpdate(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const body = await request.json();
  const action = url.searchParams.get('action') || '';

  if (action === 'delete') {
    const id = parseInt(body.id);
    if (!id) return json({ error: 'Missing product ID for deletion.' }, 400);
    await db.prepare('UPDATE Inventory SET Quantity = 0 WHERE id = ?').bind(id).run();
    return json({ success: true, message: 'Product quantity set to 0.' });
  }

  const id = body.id ? parseInt(body.id) : null;
  const { Artist='', Title='', Format='', Vendor='', Vendor_Number='', UPC='', Year='', OOP='' } = body;
  const SRP = body.SRP || '';
  const Quantity = body.Quantity !== undefined && body.Quantity !== '' ? parseInt(body.Quantity) : 0;

  if (!Title && !Artist) return json({ error: 'Artist or Title must be provided.' }, 400);

  const fields = [Artist, Title, Format, Vendor, Vendor_Number, UPC, Quantity, Year, OOP, SRP];

  if (id) {
    await db.prepare(`UPDATE Inventory SET
      Artist=?,Title=?,Format=?,Vendor=?,Vendor_Number=?,UPC=?,Quantity=?,Year=?,OOP=?,SRP=? WHERE id=?`
    ).bind(...fields, id).run();
    return json({ success: true, message: 'In-Store product updated successfully.', id });
  } else {
    await db.prepare(`INSERT INTO Inventory
      (Artist,Title,Format,Vendor,Vendor_Number,UPC,Quantity,Year,OOP,SRP)
      VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(...fields).run();
    const newRow = await db.prepare('SELECT last_insert_rowid() as id').first();
    return json({ success: true, message: 'In-Store product created successfully.', id: newRow?.id });
  }
}

async function handlePunchGet(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const phone = url.searchParams.get('phone');
  if (!phone) return json({ error: 'Missing phone parameter' }, 400);
  const user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
  if (!user) return json({ error: 'User not found' }, 404);
  return json({ success: true, user });
}

async function handlePunchPost(request, env) {
  const db = env.DB;
  const body = await request.json();
  const validTypes = ['cd', 'vinyl', 'cassette', '45'];
  if (!body.phone || !body.type || !validTypes.includes(body.type))
    return json({ error: 'Missing phone or invalid punch type' }, 400);
  const user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(body.phone).first();
  if (!user) return json({ error: 'User not found. Please have them activate first.' }, 404);
  const col = `punches_${body.type}`;
  if (user[col] >= 10) return json({ error: 'Max punches reached for this category! Time for a reward.' }, 400);
  const newPunches = user[col] + 1;
  await db.prepare(`UPDATE users SET ${col} = ?, last_checkin = NULL WHERE phone = ?`).bind(newPunches, body.phone).run();
  return json({ success: true, punches: newPunches, type: body.type, name: user.name });
}

async function handleQueue(env) {
  const db = env.DB;
  const result = await db.prepare(`
    SELECT phone, name, punches_cd, punches_vinyl, punches_cassette, punches_45, last_checkin
    FROM users WHERE last_checkin IS NOT NULL AND last_checkin >= datetime('now', '-15 minutes')
    ORDER BY last_checkin DESC
  `).all();
  return json({ success: true, queue: result.results });
}

async function handleRedeem(request, env) {
  const db = env.DB;
  const body = await request.json();
  const validTypes = ['cd', 'vinyl', 'cassette', '45'];
  if (!body.phone || !body.type || !validTypes.includes(body.type))
    return json({ error: 'Missing phone or invalid punch type' }, 400);
  const user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(body.phone).first();
  if (!user) return json({ error: 'User not found. Please have them activate first.' }, 404);
  const col = `punches_${body.type}`;
  await db.prepare(`UPDATE users SET ${col} = 0, last_checkin = NULL WHERE phone = ?`).bind(body.phone).run();
  return json({ success: true, punches: 0, type: body.type, name: user.name });
}

async function handleSales(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const vendor = url.searchParams.get('vendor');
  const oop = url.searchParams.get('oop');

  if (type === 'vendors') {
    const results = await db.prepare(`
      SELECT DISTINCT i.Vendor FROM Sales s
      JOIN Inventory i ON s.inventory_id = i.id
      WHERE i.Vendor IS NOT NULL AND i.Vendor != ''
      ORDER BY i.Vendor ASC
    `).all();
    return json({ success: true, vendors: results.results.map(r => r.Vendor) });
  }

  let query = `
    SELECT s.Date_Sold, s.UPC, s.Quantity_Sold, s.SRP as Sold_SRP,
           i.Format, i.Artist, i.Title, i.Vendor_Number, i.OOP, i.Year, i.Vendor
    FROM Sales s JOIN Inventory i ON s.inventory_id = i.id WHERE 1=1
  `;
  const params = [];
  if (vendor) { query += ' AND i.Vendor = ?'; params.push(vendor); }
  if (oop === 'IP')  query += " AND (i.OOP IS NULL OR i.OOP = '' OR i.OOP != 'Y')";
  if (oop === 'OOP') query += " AND i.OOP = 'Y'";
  query += ' ORDER BY s.Date_Sold DESC';

  const results = await (params.length
    ? db.prepare(query).bind(...params)
    : db.prepare(query)).all();
  return json({ success: true, sales: results.results });
}

async function handleSync(request, env) {
  const db = env.DB;
  const body = await request.json();
  const { receipts = [], sales = [], orders = [] } = body;

  for (const item of receipts) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(UPC) DO UPDATE SET Quantity=Quantity+excluded.Quantity, Modified=excluded.Modified, SRP=excluded.SRP
    `).bind(item.UPC,item.Quantity,item.Format,item.Artist,item.Title,item.Vendor_Number,item.OOP,item.Year,item.Vendor,item.Modified,item.SRP).run();
  }

  for (const item of sales) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,0,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(UPC) DO UPDATE SET Quantity=Quantity-?, Modified=excluded.Modified
    `).bind(item.UPC,item.Format,item.Artist,item.Title,item.Vendor_Number,item.OOP,item.Year,item.Vendor,item.Modified,item.SRP,item.Quantity).run();

    const invRow = await db.prepare('SELECT id FROM Inventory WHERE UPC = ?').bind(item.UPC).first();
    if (invRow) {
      await db.prepare(`INSERT INTO Sales (inventory_id,UPC,Quantity_Sold,Date_Sold,SRP) VALUES (?,?,?,?,?)`)
        .bind(invRow.id,item.UPC,item.Quantity,item.Modified,item.SRP).run();
    }
  }

  for (const item of orders) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,0,?,?,?,?,?,?,?,?,?) ON CONFLICT(UPC) DO NOTHING
    `).bind(item.UPC,item.Format,item.Artist,item.Title,item.Vendor_Number,item.OOP,item.Year,item.Vendor,item.Modified,item.SRP).run();

    const invRow = await db.prepare('SELECT id FROM Inventory WHERE UPC = ?').bind(item.UPC).first();
    if (invRow) {
      await db.prepare(`INSERT INTO Orders (inventory_id,UPC,Quantity_Ordered,Vendor,Order_Date) VALUES (?,?,?,?,?)`)
        .bind(invRow.id,item.UPC,item.Quantity,item.Vendor,item.Modified).run();
    }
  }

  return json({ success: true, processed: { receipts: receipts.length, sales: sales.length, orders: orders.length } });
}

async function handleTickerGet(env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const result = await db.prepare(`SELECT value FROM Settings WHERE key='ticker'`).first();
  const text = result?.value || 'Welcome to Forever Young Records!';
  return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' } });
}

async function handleTickerPost(request, env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const text = await request.text();
  await db.prepare(`INSERT INTO Settings (key,value) VALUES ('ticker',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(text).run();
  return json({ success: true });
}
