export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    }
  });
}

export async function onRequestGet(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json"
  };
  try {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
    const result = await db.prepare(`SELECT value FROM Settings WHERE key='featured_items'`).first();
    const value = result ? result.value || "" : "";

    if (type === 'details') {
      let items = [];
      if (value) {
        const refs = value.split(',').map(r => r.trim()).filter(r => r.length > 0);
        if (refs.length > 0) {
          const placeholders = refs.map(() => '?').join(',');
          const query = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${placeholders}) OR Bar_Code IN (${placeholders})`;
          const detailsResult = await db.prepare(query).bind(...refs, ...refs).all();
          items = detailsResult.results;
        }
      }
      return new Response(JSON.stringify({ success: true, value, items }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, value }), { status: 200, headers: corsHeaders });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };
  try {
    const { request, env } = context;
    const db = env.DB;
    
    await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
    
    const body = await request.json();
    const value = body.value || "";
    
    // Save to Settings
    await db.prepare(`INSERT INTO Settings (key, value) VALUES ('featured_items', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(value).run();
    
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
