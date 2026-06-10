// functions/api/inventory-search.js
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const db = env.DB;
    
    const upc = url.searchParams.get('upc') || '';
    const artist = url.searchParams.get('artist') || '';
    const title = url.searchParams.get('album') || ''; // Map 'album' from UI to 'Title'
    const catalog = url.searchParams.get('catalog') || ''; // Map 'catalog' from UI to 'Vendor_Number'

    if (!upc && !artist && !title && !catalog) {
      return new Response(JSON.stringify({ error: "At least one search parameter must be provided." }), { status: 400 });
    }

    let query = "SELECT * FROM Inventory WHERE 1=1";
    let bindParams = [];

    if (upc) {
      query += " AND UPC LIKE ?";
      bindParams.push(`%${upc}%`);
    }
    if (artist) {
      query += " AND Artist LIKE ?";
      bindParams.push(`%${artist}%`);
    }
    if (title) {
      query += " AND Title LIKE ?";
      bindParams.push(`%${title}%`);
    }
    if (catalog) {
      query += " AND Vendor_Number = ?";
      bindParams.push(catalog);
    }

    query += " LIMIT 50"; // Limit results for safety

    const stmt = db.prepare(query);
    const finalStmt = bindParams.length > 0 ? stmt.bind(...bindParams) : stmt;
    const results = await finalStmt.all();

    return new Response(JSON.stringify({ success: true, results: results.results }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
