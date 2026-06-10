// GET: Fetch user info by phone number
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');
    
    if (!phone) {
      return new Response(JSON.stringify({ error: "Missing phone parameter" }), { status: 400 });
    }

    const db = env.DB;
    const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }
    
    return new Response(JSON.stringify({ success: true, user }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// POST: Add a punch to a user
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    const validTypes = ['cd', 'vinyl', 'cassette', '45'];
    if (!body.phone || !body.type || !validTypes.includes(body.type)) {
      return new Response(JSON.stringify({ error: "Missing phone or invalid punch type" }), { status: 400 });
    }
    
    const db = env.DB;
    
    // Fetch current user
    const user = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(body.phone).first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found. Please have them activate first." }), { status: 404 });
    }

    const col = `punches_${body.type}`;
    if (user[col] >= 10) {
      return new Response(JSON.stringify({ error: "Max punches reached for this category! Time for a reward." }), { status: 400 });
    }

    const newPunches = user[col] + 1;
    await db.prepare(`UPDATE users SET ${col} = ?, last_checkin = NULL WHERE phone = ?`).bind(newPunches, body.phone).run();

    return new Response(JSON.stringify({ success: true, punches: newPunches, type: body.type, name: user.name }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
