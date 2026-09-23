async function handleImportCsv(request, env) {
  const db = env.DB;

  // Drop unique index for initial data load (recreate later)
  try {
    await db.prepare('DROP INDEX IF EXISTS idx_oi_srn;').run();
  } catch (e) {}

  // Ensure missing columns exist in Online_Inventory
  const addCols = [
    "ALTER TABLE Online_Inventory ADD COLUMN IF NOT EXISTS Listing_ID TEXT;",
    "ALTER TABLE Online_Inventory ADD COLUMN IF NOT EXISTS Status TEXT;",
    "ALTER TABLE Online_Inventory ADD COLUMN IF NOT EXISTS Accept_Offer TEXT;",
    "ALTER TABLE Online_Inventory ADD COLUMN IF NOT EXISTS Weight REAL;",
    "ALTER TABLE Online_Inventory ADD COLUMN IF NOT EXISTS Format_Quantity INTEGER;"
  ];
  for (const sql of addCols) {
    try { await db.prepare(sql).run(); } catch(e) {}
  }

  // Parse body
  let csvText;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = await request.json();
    csvText = body.csv;
    if (!csvText || typeof csvText !== 'string') {
      return json({ success: false, error: 'Missing or invalid "csv" field' }, 400);
    }
  } else {
    csvText = await request.text();
    if (!csvText) return json({ success: false, error: 'Empty body' }, 400);
  }

  if (csvText.length > 50 * 1024 * 1024) {
    return json({ success: false, error: 'File too large' }, 400);
  }

  // ── Parse CSV ──
  const csvBytes = new TextEncoder().encode(csvText);
  const len = csvBytes.length;
  let pos = 0;

  function peek() { return pos < len ? csvBytes[pos] : -1; }
  function read() { return pos < len ? csvBytes[pos++] : -1; }

  function parseField() {
    let val = '';
    let c = read();
    if (c === 34) {
      c = read();
      while (c !== -1) {
        if (c === 34) {
          if (peek() === 34) { val += String.fromCharCode(34); pos++; }
          else { c = read(); if (c === 44 || c === 10 || c === 13 || c === -1) return val; }
        } else {
          val += String.fromCharCode(c);
        }
        c = read();
      }
      return val;
    }
    while (c !== -1 && c !== 44 && c !== 10 && c !== 13) {
      val += String.fromCharCode(c);
      c = read();
    }
    return val;
  }

  const rows = [];
  const headerMap = {};
  let lineNum = 0;
  while (pos < len) {
    const c = peek();
    if (c === 10 || c === 13) { pos++; continue; }
    const row = [];
    while (pos < len) {
      row.push(parseField());
      const nc = peek();
      if (nc === 10 || nc === 13 || nc === -1) {
        while (pos < len && (csvBytes[pos] === 10 || csvBytes[pos] === 13)) pos++;
        break;
      }
      if (nc === 44) pos++;
    }
    lineNum++;
    if (lineNum === 1) {
      row.forEach((name, i) => { headerMap[name.trim()] = i; });
      continue;
    }
    if (row.length > 0 && row.some(x => x.trim())) rows.push(row);
  }

  if (rows.length === 0) {
    return json({ success: false, error: 'No data rows found in CSV' }, 400);
  }

  // Helper: get field by header name
  function f(row, name) {
    const idx = headerMap[name];
    if (idx == null) return '';
    return (row[idx] || '').trim();
  }

  // Helper: quote SQL string
  function q(v) {
    if (v == null || v === '') return 'NULL';
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  // Helper: format number (price)
  function p(v, flt) {
    if (v == null || v === '') return 'NULL';
    flt = flt === true;
    const n = flt ? parseFloat(v) : parseInt(v, 10);
    if (isNaN(n)) return 'NULL';
    return flt ? n.toFixed(2) : n;
  }

  // Clear existing data
  await db.prepare("DELETE FROM Online_Inventory WHERE Seller_Reference_Number IS NOT NULL;").run();

  // Insert directly into Online_Inventory
  let total = 0;
  const BATCH = 100;
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH) chunks.push(rows.slice(i, i + BATCH));

  for (let bi = 0; bi < chunks.length; bi++) {
    for (const row of chunks[bi]) {
      // Transformations
      const cleanArtist = f(row, 'artist').replace(/\s*\((\d+)\)\s*$/, '').trim();

      let cleanDesc = f(row, 'comments');
      if (cleanDesc) {
        cleanDesc = cleanDesc.replace(/^\s*[-–]\s*/, '');
        cleanDesc = cleanDesc.replace(/^(?:CD|Digipak|Vinyl|Sleeve|Case|Pack|Booklet|Card|Jacket)\s+is\s+[-–]\s*/, '');
        cleanDesc = cleanDesc.trim();
      }

      const sellerRef = f(row, 'location') || '';

      const rawFmt = f(row, 'format');
      let simpleFmt = 'CD';
      if (/LP|Vinyl|Album\s*\(Vinyl\)|33\s*⅓|12\s*inch/i.test(rawFmt)) simpleFmt = 'LP';
      else if (/Cassette|Cas\.?/i.test(rawFmt)) simpleFmt = 'Cassette';
      else if (/DVD|Video|MV|Music\s*Video/i.test(rawFmt)) simpleFmt = 'DVD';

      const discogsUrl = f(row, 'release_id')
        ? 'https://www.discogs.com/release/' + f(row, 'release_id').replace(/[^0-9]/g, '')
        : '';

      const sql = `INSERT INTO Online_Inventory (Artist,Title,Format,Discogs_ID,Discogs_url,Price,Description,
        Condition_Media,Condition_Sleeve,Seller_Reference_Number,Quantity,
        Label,Release_Catalog_Number,Release_Country,Release_Date,Genre,
        Front_Image_URL,Back_Image_URL,YouTube_Audio_Image_URLs,Bar_Code,Number_In_Set,
        Listing_ID,Status,Accept_Offer,Weight,Format_Quantity)
        VALUES (${q(cleanArtist)}, ${q(f(row, 'title'))}, ${q(simpleFmt)}, ${q(f(row, 'release_id'))}, ${q(discogsUrl)}, ${p(f(row, 'price'), true)}, ${q(cleanDesc)},
        ${q(f(row, 'media_condition'))}, ${q(f(row, 'sleeve_condition'))}, ${q(sellerRef)}, ${p(f(row, 'quantity'))},
        ${q(f(row, 'label'))}, ${q(f(row, 'catno'))}, NULL, ${q(f(row, 'listed'))}, NULL,
        NULL, NULL, ${q(discogsUrl)}, ${q(f(row, 'external_id'))}, NULL,
        ${q(f(row, 'listing_id'))}, ${q(f(row, 'status'))}, ${q(f(row, 'accept_offer'))}, ${p(f(row, 'weight'), true)}, ${p(f(row, 'format_quantity'))})`;

      try {
        await db.prepare(sql).run();
        total++;
      } catch (e) {
        console.error('D1 INSERT error:', e.message);
        console.error('SQL:', sql.substring(0, 200));
      }
    }
  }

  return json({
    success: true,
    rowsProcessed: total,
    message: 'Import complete. ' + total.toLocaleString() + ' rows processed.'
  });
}
