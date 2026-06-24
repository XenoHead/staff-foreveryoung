var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-fvHeI5/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// _worker.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
__name(json, "json");
function cors() {
  return new Response(null, { status: 204, headers: CORS });
}
__name(cors, "cors");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return cors();
    try {
      if (path === "/api/discogs-lookup" && method === "GET")
        return await handleDiscogsLookup(request);
      if (path === "/api/featured") {
        if (method === "GET") return await handleFeaturedGet(request, env);
        if (method === "POST") return await handleFeaturedPost(request, env);
      }
      if (path === "/api/instore-search" && method === "GET")
        return await handleInstoreSearch(request, env);
      if (path === "/api/inventory-search" && method === "GET")
        return await handleInventorySearch(request, env);
      if (path === "/api/online-search" && method === "GET")
        return await handleOnlineSearch(request, env);
      if (path === "/api/online-update" && method === "POST")
        return await handleOnlineUpdate(request, env);
      if (path === "/api/punch") {
        if (method === "GET") return await handlePunchGet(request, env);
        if (method === "POST") return await handlePunchPost(request, env);
      }
      if (path === "/api/queue" && method === "GET")
        return await handleQueue(env);
      if (path === "/api/redeem" && method === "POST")
        return await handleRedeem(request, env);
      if (path === "/api/sales" && method === "GET")
        return await handleSales(request, env);
      if (path === "/api/sync" && method === "POST")
        return await handleSync(request, env);
      if (path === "/api/ticker") {
        if (method === "GET") return await handleTickerGet(env);
        if (method === "POST") return await handleTickerPost(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  }
};
async function handleDiscogsLookup(request) {
  const url = new URL(request.url);
  const releaseId = url.searchParams.get("id") || "";
  if (!releaseId) return json({ error: "Missing release ID." }, 400);
  const resp = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
    headers: { "User-Agent": "ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com" }
  });
  if (resp.status === 404) return json({ error: "Release not found on Discogs." }, 404);
  if (!resp.ok) return json({ error: `Discogs error: ${resp.status} ${resp.statusText}` }, resp.status);
  const data = await resp.json();
  const artistStr = data.artists ? data.artists.map((a) => a.name.replace(/\s*\(\d+\)$/, "")).join(", ") : "";
  const titleStr = data.title || "";
  let formatStr = "";
  if (data.formats?.length) {
    formatStr = data.formats.map((f) => {
      const qty = f.qty && parseInt(f.qty) > 1 ? `${f.qty}x ` : "";
      const desc = f.descriptions ? ` (${f.descriptions.join(", ")})` : "";
      return `${qty}${f.name}${desc}`;
    }).join(", ");
  }
  const genreList = [...data.genres || [], ...data.styles || []];
  const genreStr = [...new Set(genreList)].join(", ");
  const labelStr = data.labels?.map((l) => l.name).join(", ") || "";
  const catalogStr = data.labels?.map((l) => l.catno).join(", ") || "";
  const countryStr = data.country || "";
  const dateStr = data.released || (data.year ? String(data.year) : "");
  let barcodeStr = "";
  if (data.identifiers) {
    const b = data.identifiers.find((i) => i.type === "barcode");
    if (b?.value) barcodeStr = b.value.replace(/[^0-9X]/gi, "");
  }
  let frontImg = "", backImg = "";
  if (data.images?.length) {
    const primary = data.images.find((i) => i.type === "primary");
    frontImg = primary ? primary.resource_url : data.images[0].resource_url;
    const secondary = data.images.filter((i) => i.type !== "primary");
    if (secondary.length) backImg = secondary[0].resource_url;
  }
  const youtubeStr = data.videos ? data.videos.map((v) => v.uri).join(", ") : "";
  let numInSet = "";
  if (data.formats) {
    const total = data.formats.reduce((s, f) => s + (parseInt(f.qty) || 0), 0);
    if (total > 0) numInSet = String(total);
  }
  const descLines = [];
  if (data.tracklist?.length) {
    descLines.push("TRACKLIST:");
    data.tracklist.forEach((t) => {
      if (t.title) descLines.push(`${t.position ? t.position + ". " : ""}${t.title}${t.duration ? " (" + t.duration + ")" : ""}`);
    });
  }
  if (data.notes) {
    if (descLines.length) descLines.push("");
    descLines.push("RELEASE NOTES:", data.notes);
  }
  return json({ success: true, result: {
    Artist: artistStr,
    Title: titleStr,
    Format: formatStr,
    Genre: genreStr,
    Label: labelStr,
    Release_Catalog_Number: catalogStr,
    Release_Country: countryStr,
    Release_Date: dateStr,
    Bar_Code: barcodeStr,
    Front_Image_URL: frontImg,
    Back_Image_URL: backImg,
    YouTube_Audio_Image_URLs: youtubeStr,
    Number_In_Set: numInSet,
    Description: descLines.join("\n"),
    Discogs_ID: String(data.id)
  } });
}
__name(handleDiscogsLookup, "handleDiscogsLookup");
async function handleFeaturedGet(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const result = await db.prepare(`SELECT value FROM Settings WHERE key='featured_items'`).first();
  const value = result?.value || "";
  if (type === "details") {
    let items = [];
    if (value) {
      const refs = value.split(",").map((r) => r.trim()).filter(Boolean);
      if (refs.length) {
        const ph = refs.map(() => "?").join(",");
        const q = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${ph}) OR Bar_Code IN (${ph})`;
        const d = await db.prepare(q).bind(...refs, ...refs).all();
        items = d.results;
      }
    }
    return json({ success: true, value, items });
  }
  return json({ success: true, value });
}
__name(handleFeaturedGet, "handleFeaturedGet");
async function handleFeaturedPost(request, env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const body = await request.json();
  const value = body.value || "";
  await db.prepare(`INSERT INTO Settings (key, value) VALUES ('featured_items', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(value).run();
  return json({ success: true });
}
__name(handleFeaturedPost, "handleFeaturedPost");
async function handleInstoreSearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const upcParam = url.searchParams.get("upc");
  const queryParam = url.searchParams.get("query");
  const query = upcParam || queryParam || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 80);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
  const offset = (page - 1) * limit;
  let filterSql = "", bindParams = [];
  if (query) {
    filterSql = " AND (UPC LIKE ? OR Artist LIKE ? OR Title LIKE ?)";
    bindParams = [`%${query}%`, `%${query}%`, `%${query}%`];
  }
  const qtyCondition = upcParam ? "" : " AND Quantity > 0";
  const countQ = `SELECT COUNT(*) as total FROM Inventory WHERE 1=1${qtyCondition}${filterSql}`;
  const countResult = await (bindParams.length ? db.prepare(countQ).bind(...bindParams) : db.prepare(countQ)).first();
  const total = countResult?.total || 0;
  const dataQ = `SELECT id, UPC, Quantity, Format, Artist, Title, Vendor_Number, Year, SRP FROM Inventory WHERE 1=1${qtyCondition}${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await db.prepare(dataQ).bind(...bindParams, limit, offset).all();
  return json({ success: true, results: results.results, total, page, limit });
}
__name(handleInstoreSearch, "handleInstoreSearch");
async function handleInventorySearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const upc = url.searchParams.get("upc") || "";
  const artist = url.searchParams.get("artist") || "";
  const title = url.searchParams.get("album") || "";
  const catalog = url.searchParams.get("catalog") || "";
  const queryVal = url.searchParams.get("query") || "";
  const letterVal = url.searchParams.get("letter") || "";
  let limit = parseInt(url.searchParams.get("limit") || "10");
  if (![10, 20, 40, 80].includes(limit)) limit = 10;
  let page = parseInt(url.searchParams.get("page") || "1");
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;
  let filterSql = "", bindParams = [];
  if (letterVal) {
    if (letterVal === "0-9") {
      filterSql += " AND (substr(Artist,1,1) BETWEEN '0' AND '9' OR Artist GLOB '[0-9]*')";
    } else {
      filterSql += " AND (substr(Artist,1,1) = ? OR substr(Artist,1,1) = ?)";
      bindParams.push(letterVal.toLowerCase(), letterVal.toUpperCase());
    }
  }
  if (queryVal) {
    filterSql += " AND (Artist LIKE ? OR Title LIKE ? OR UPC LIKE ? OR Vendor_Number LIKE ?)";
    bindParams.push(`%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`);
  } else {
    if (upc) {
      filterSql += " AND UPC LIKE ?";
      bindParams.push(`%${upc}%`);
    }
    if (artist) {
      filterSql += " AND Artist LIKE ?";
      bindParams.push(`%${artist}%`);
    }
    if (title) {
      filterSql += " AND Title LIKE ?";
      bindParams.push(`%${title}%`);
    }
    if (catalog) {
      filterSql += " AND Vendor_Number = ?";
      bindParams.push(catalog);
    }
  }
  const countQ = `SELECT COUNT(*) as total FROM Inventory WHERE 1=1${filterSql}`;
  const countResult = await (bindParams.length ? db.prepare(countQ).bind(...bindParams) : db.prepare(countQ)).first();
  const total = countResult?.total || 0;
  const dataQ = `SELECT * FROM Inventory WHERE 1=1${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await db.prepare(dataQ).bind(...bindParams, limit, offset).all();
  return json({ success: true, results: results.results, total, page, limit });
}
__name(handleInventorySearch, "handleInventorySearch");
async function handleOnlineSearch(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const queryVal = url.searchParams.get("query") || "";
  const formatVal = url.searchParams.get("format") || "%";
  const letterVal = url.searchParams.get("letter") || "";
  let limit = parseInt(url.searchParams.get("limit") || "10");
  if (![10, 20, 40, 80].includes(limit)) limit = 10;
  let page = parseInt(url.searchParams.get("page") || "1");
  if (page < 1) page = 1;
  const offset = (page - 1) * limit;
  let filterSql = "", bindParams = [];
  if (letterVal) {
    if (letterVal === "0-9") {
      filterSql += " AND (substr(Artist,1,1) BETWEEN '0' AND '9' OR Artist GLOB '[0-9]*')";
    } else {
      filterSql += " AND (substr(Artist,1,1) = ? OR substr(Artist,1,1) = ?)";
      bindParams.push(letterVal.toLowerCase(), letterVal.toUpperCase());
    }
  }
  if (queryVal) {
    filterSql += " AND (Artist LIKE ? OR Title LIKE ? OR Discogs_ID LIKE ? OR Seller_Reference_Number LIKE ?)";
    bindParams.push(`%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`, `%${queryVal}%`);
  }
  if (formatVal && formatVal !== "%") {
    const fmtMap = {
      vinyl: `(Format LIKE '%vinyl%' OR Format LIKE '%LP%' OR Format LIKE '%7"%' OR Format LIKE '%10"%' OR Format LIKE '%12"%' OR Format LIKE '%78%' OR Format LIKE '%EP%')`,
      cd: "(Format LIKE '%CD%')",
      vinyllp: "(Format LIKE '%LP%' AND Format NOT LIKE '%Box%')",
      vinyl7: `(Format LIKE '%7"%')`,
      vinyl10: `(Format LIKE '%10"%')`,
      vinyl12: `(Format LIKE '%12"%')`,
      vinyl78: "(Format LIKE '%78%')",
      cdsing: "(Format LIKE '%CD Single%' OR Format LIKE '%CD Sing%')",
      ep: "(Format LIKE '%EP%')",
      cassette: "(Format LIKE '%Cassette%')",
      video: "(Format LIKE '%Video%' OR Format LIKE '%VHS%' OR Format LIKE '%DVD%')",
      book: "(Format LIKE '%Book%')",
      clothing: "(Format LIKE '%Clothing%' OR Format LIKE '%Shirt%')",
      memorabilia: "(Format LIKE '%Memorabilia%')"
    };
    if (fmtMap[formatVal]) {
      filterSql += ` AND ${fmtMap[formatVal]}`;
    } else {
      filterSql += " AND Format LIKE ?";
      bindParams.push(`%${formatVal}%`);
    }
  }
  const countQ = `SELECT COUNT(*) as total FROM Online_Inventory WHERE 1=1${filterSql}`;
  const countResult = await (bindParams.length ? db.prepare(countQ).bind(...bindParams) : db.prepare(countQ)).first();
  const total = countResult?.total || 0;
  const dataQ = `SELECT * FROM Online_Inventory WHERE 1=1${filterSql} ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?`;
  const results = await db.prepare(dataQ).bind(...bindParams, limit, offset).all();
  return json({ success: true, results: results.results, total, page, limit });
}
__name(handleOnlineSearch, "handleOnlineSearch");
async function handleOnlineUpdate(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const body = await request.json();
  const action = url.searchParams.get("action") || "";
  if (action === "delete") {
    const id2 = parseInt(body.id);
    if (!id2) return json({ error: "Missing product ID for deletion." }, 400);
    await db.prepare("DELETE FROM Online_Inventory WHERE id = ?").bind(id2).run();
    return json({ success: true, message: "Product deleted successfully." });
  }
  const id = body.id ? parseInt(body.id) : null;
  const {
    Artist = "",
    Title = "",
    Format = "",
    Discogs_ID = "",
    Description = "",
    Condition_Media = "",
    Condition_Sleeve = "",
    Seller_Reference_Number = "",
    Label = "",
    Release_Catalog_Number = "",
    Release_Country = "",
    Release_Date = "",
    Genre = "",
    Front_Image_URL = "",
    Back_Image_URL = "",
    YouTube_Audio_Image_URLs = "",
    Bar_Code = "",
    Number_In_Set = ""
  } = body;
  const Price = body.Price !== void 0 && body.Price !== "" ? parseFloat(body.Price) : null;
  const Quantity = body.Quantity !== void 0 && body.Quantity !== "" ? parseInt(body.Quantity) : 0;
  if (!Title && !Artist) return json({ error: "Artist or Title must be provided." }, 400);
  const fields = [
    Artist,
    Title,
    Format,
    Discogs_ID,
    Price,
    Description,
    Condition_Media,
    Condition_Sleeve,
    Seller_Reference_Number,
    Quantity,
    Label,
    Release_Catalog_Number,
    Release_Country,
    Release_Date,
    Genre,
    Front_Image_URL,
    Back_Image_URL,
    YouTube_Audio_Image_URLs,
    Bar_Code,
    Number_In_Set
  ];
  if (id) {
    await db.prepare(
      `UPDATE Online_Inventory SET
      Artist=?,Title=?,Format=?,Discogs_ID=?,Price=?,Description=?,Condition_Media=?,
      Condition_Sleeve=?,Seller_Reference_Number=?,Quantity=?,Label=?,Release_Catalog_Number=?,
      Release_Country=?,Release_Date=?,Genre=?,Front_Image_URL=?,Back_Image_URL=?,
      YouTube_Audio_Image_URLs=?,Bar_Code=?,Number_In_Set=? WHERE id=?`
    ).bind(...fields, id).run();
    return json({ success: true, message: "Product updated successfully.", id });
  } else {
    await db.prepare(
      `INSERT INTO Online_Inventory
      (Artist,Title,Format,Discogs_ID,Price,Description,Condition_Media,Condition_Sleeve,
       Seller_Reference_Number,Quantity,Label,Release_Catalog_Number,Release_Country,Release_Date,
       Genre,Front_Image_URL,Back_Image_URL,YouTube_Audio_Image_URLs,Bar_Code,Number_In_Set)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...fields).run();
    const newRow = await db.prepare("SELECT last_insert_rowid() as id").first();
    return json({ success: true, message: "Product created successfully.", id: newRow?.id });
  }
}
__name(handleOnlineUpdate, "handleOnlineUpdate");
async function handlePunchGet(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  if (!phone) return json({ error: "Missing phone parameter" }, 400);
  const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
  if (!user) return json({ error: "User not found" }, 404);
  return json({ success: true, user });
}
__name(handlePunchGet, "handlePunchGet");
async function handlePunchPost(request, env) {
  const db = env.DB;
  const body = await request.json();
  const validTypes = ["cd", "vinyl", "cassette", "45"];
  if (!body.phone || !body.type || !validTypes.includes(body.type))
    return json({ error: "Missing phone or invalid punch type" }, 400);
  const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(body.phone).first();
  if (!user) return json({ error: "User not found. Please have them activate first." }, 404);
  const col = `punches_${body.type}`;
  if (user[col] >= 10) return json({ error: "Max punches reached for this category! Time for a reward." }, 400);
  const newPunches = user[col] + 1;
  await db.prepare(`UPDATE users SET ${col} = ?, last_checkin = NULL WHERE phone = ?`).bind(newPunches, body.phone).run();
  return json({ success: true, punches: newPunches, type: body.type, name: user.name });
}
__name(handlePunchPost, "handlePunchPost");
async function handleQueue(env) {
  const db = env.DB;
  const result = await db.prepare(`
    SELECT phone, name, punches_cd, punches_vinyl, punches_cassette, punches_45, last_checkin
    FROM users WHERE last_checkin IS NOT NULL AND last_checkin >= datetime('now', '-15 minutes')
    ORDER BY last_checkin DESC
  `).all();
  return json({ success: true, queue: result.results });
}
__name(handleQueue, "handleQueue");
async function handleRedeem(request, env) {
  const db = env.DB;
  const body = await request.json();
  const validTypes = ["cd", "vinyl", "cassette", "45"];
  if (!body.phone || !body.type || !validTypes.includes(body.type))
    return json({ error: "Missing phone or invalid punch type" }, 400);
  const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(body.phone).first();
  if (!user) return json({ error: "User not found. Please have them activate first." }, 404);
  const col = `punches_${body.type}`;
  await db.prepare(`UPDATE users SET ${col} = 0, last_checkin = NULL WHERE phone = ?`).bind(body.phone).run();
  return json({ success: true, punches: 0, type: body.type, name: user.name });
}
__name(handleRedeem, "handleRedeem");
async function handleSales(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const vendor = url.searchParams.get("vendor");
  const oop = url.searchParams.get("oop");
  if (type === "vendors") {
    const results2 = await db.prepare(`
      SELECT DISTINCT i.Vendor FROM Sales s
      JOIN Inventory i ON s.inventory_id = i.id
      WHERE i.Vendor IS NOT NULL AND i.Vendor != ''
      ORDER BY i.Vendor ASC
    `).all();
    return json({ success: true, vendors: results2.results.map((r) => r.Vendor) });
  }
  let query = `
    SELECT s.Date_Sold, s.UPC, s.Quantity_Sold, s.SRP as Sold_SRP,
           i.Format, i.Artist, i.Title, i.Vendor_Number, i.OOP, i.Year, i.Vendor
    FROM Sales s JOIN Inventory i ON s.inventory_id = i.id WHERE 1=1
  `;
  const params = [];
  if (vendor) {
    query += " AND i.Vendor = ?";
    params.push(vendor);
  }
  if (oop === "IP") query += " AND (i.OOP IS NULL OR i.OOP = '' OR i.OOP != 'Y')";
  if (oop === "OOP") query += " AND i.OOP = 'Y'";
  query += " ORDER BY s.Date_Sold DESC";
  const results = await (params.length ? db.prepare(query).bind(...params) : db.prepare(query)).all();
  return json({ success: true, sales: results.results });
}
__name(handleSales, "handleSales");
async function handleSync(request, env) {
  const db = env.DB;
  const body = await request.json();
  const { receipts = [], sales = [], orders = [] } = body;
  for (const item of receipts) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(UPC) DO UPDATE SET Quantity=Quantity+excluded.Quantity, Modified=excluded.Modified, SRP=excluded.SRP
    `).bind(item.UPC, item.Quantity, item.Format, item.Artist, item.Title, item.Vendor_Number, item.OOP, item.Year, item.Vendor, item.Modified, item.SRP).run();
  }
  for (const item of sales) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,0,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(UPC) DO UPDATE SET Quantity=Quantity-?, Modified=excluded.Modified
    `).bind(item.UPC, item.Format, item.Artist, item.Title, item.Vendor_Number, item.OOP, item.Year, item.Vendor, item.Modified, item.SRP, item.Quantity).run();
    const invRow = await db.prepare("SELECT id FROM Inventory WHERE UPC = ?").bind(item.UPC).first();
    if (invRow) {
      await db.prepare(`INSERT INTO Sales (inventory_id,UPC,Quantity_Sold,Date_Sold,SRP) VALUES (?,?,?,?,?)`).bind(invRow.id, item.UPC, item.Quantity, item.Modified, item.SRP).run();
    }
  }
  for (const item of orders) {
    await db.prepare(`
      INSERT INTO Inventory (UPC,Quantity,Format,Artist,Title,Vendor_Number,OOP,Year,Vendor,Modified,SRP)
      VALUES (?,0,?,?,?,?,?,?,?,?,?) ON CONFLICT(UPC) DO NOTHING
    `).bind(item.UPC, item.Format, item.Artist, item.Title, item.Vendor_Number, item.OOP, item.Year, item.Vendor, item.Modified, item.SRP).run();
    const invRow = await db.prepare("SELECT id FROM Inventory WHERE UPC = ?").bind(item.UPC).first();
    if (invRow) {
      await db.prepare(`INSERT INTO Orders (inventory_id,UPC,Quantity_Ordered,Vendor,Order_Date) VALUES (?,?,?,?,?)`).bind(invRow.id, item.UPC, item.Quantity, item.Vendor, item.Modified).run();
    }
  }
  return json({ success: true, processed: { receipts: receipts.length, sales: sales.length, orders: orders.length } });
}
__name(handleSync, "handleSync");
async function handleTickerGet(env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const result = await db.prepare(`SELECT value FROM Settings WHERE key='ticker'`).first();
  const text = result?.value || "Welcome to Forever Young Records!";
  return new Response(text, { status: 200, headers: { ...CORS, "Content-Type": "text/plain" } });
}
__name(handleTickerGet, "handleTickerGet");
async function handleTickerPost(request, env) {
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const text = await request.text();
  await db.prepare(`INSERT INTO Settings (key,value) VALUES ('ticker',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(text).run();
  return json({ success: true });
}
__name(handleTickerPost, "handleTickerPost");

// ../../Users/Scott/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../Users/Scott/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-fvHeI5/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../Users/Scott/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-fvHeI5/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=_worker.js.map
