// functions/api/sales.js
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const vendor = url.searchParams.get('vendor');
    const db = env.DB;
    
    // Request for distinct vendors for the dropdown
    if (type === 'vendors') {
      const results = await db.prepare(`
        SELECT DISTINCT i.Vendor 
        FROM Sales s 
        JOIN Inventory i ON s.inventory_id = i.id
        WHERE i.Vendor IS NOT NULL AND i.Vendor != ''
        ORDER BY i.Vendor ASC
      `).all();
      
      return new Response(JSON.stringify({ success: true, vendors: results.results.map(r => r.Vendor) }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Request for sales records, optionally filtered by vendor
    let query = `
      SELECT 
        s.Date_Sold, s.UPC, s.Quantity_Sold, s.SRP as Sold_SRP,
        i.Format, i.Artist, i.Title, i.Vendor_Number, i.OOP, i.Year, i.Vendor
      FROM Sales s
      JOIN Inventory i ON s.inventory_id = i.id
    `;
    let bindParams = [];

    if (vendor) {
      query += " WHERE i.Vendor = ?";
      bindParams.push(vendor);
    }

    query += " ORDER BY s.Date_Sold DESC";

    const stmt = db.prepare(query);
    const finalStmt = bindParams.length > 0 ? stmt.bind(...bindParams) : stmt;
    const results = await finalStmt.all();

    return new Response(JSON.stringify({ success: true, sales: results.results }), { 
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
