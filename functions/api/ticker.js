export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const db = env.DB;
    
    await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
    
    const text = await request.text();
    await db.prepare(`INSERT INTO Settings (key, value) VALUES ('ticker', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(text).run();
    
    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

export async function onRequestGet(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  try {
    const { env } = context;
    const db = env.DB;
    
    await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
    const result = await db.prepare(`SELECT value FROM Settings WHERE key='ticker'`).first();
    
    if (result && result.value) {
      return new Response(result.value, { status: 200, headers: corsHeaders });
    } else {
      return new Response("Welcome to Forever Young Records!", { status: 200, headers: corsHeaders });
    }
  } catch(err) {
    return new Response("Welcome to Forever Young Records!", { status: 200, headers: corsHeaders });
  }
}

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
