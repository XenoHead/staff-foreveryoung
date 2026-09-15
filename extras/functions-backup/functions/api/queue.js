export async function onRequestGet(context) {
  try {
    const { env } = context;
    const db = env.DB;
    
    // Get users who checked in within the last 15 minutes, sorted by most recent
    const result = await db.prepare(`
      SELECT phone, name, punches_cd, punches_vinyl, punches_cassette, punches_45, last_checkin 
      FROM users 
      WHERE last_checkin IS NOT NULL 
        AND last_checkin >= datetime('now', '-15 minutes')
      ORDER BY last_checkin DESC
    `).all();
    
    return new Response(JSON.stringify({ success: true, queue: result.results }), { 
      status: 200, headers: { "Content-Type": "application/json" } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
