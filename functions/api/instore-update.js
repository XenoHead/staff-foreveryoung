// functions/api/instore-update.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const db = env.DB;
    const body = await request.json();
    
    const action = url.searchParams.get('action') || '';

    if (action === 'delete') {
      const id = parseInt(body.id, 10);
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing product ID." }), { status: 400 });
      }
      
      await db.prepare("UPDATE Inventory SET Quantity = 0 WHERE id = ?").bind(id).run();
      
      return new Response(JSON.stringify({ success: true, message: "Product quantity set to 0." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const id = body.id ? parseInt(body.id, 10) : null;
    const artist = body.Artist || '';
    const title = body.Title || '';
    const format = body.Format || '';
    const vendor = body.Vendor || '';
    const vendorNumber = body.Vendor_Number || '';
    const upc = body.UPC || '';
    const quantity = (body.Quantity !== undefined && body.Quantity !== null && body.Quantity !== '') ? parseInt(body.Quantity, 10) : 0;
    const year = body.Year || '';
    const oop = body.OOP || '';
    const srp = body.SRP || '';
    const imageUrl = body.Image_URL || '';

    if (!title && !artist) {
      return new Response(JSON.stringify({ error: "Artist or Title must be provided." }), { status: 400 });
    }

    if (id) {
      // Update
      await db.prepare(`
        UPDATE Inventory SET 
          Artist = ?, Title = ?, Format = ?, Vendor = ?, Vendor_Number = ?, 
          UPC = ?, Quantity = ?, Year = ?, OOP = ?, SRP = ?, Image_URL = ?
        WHERE id = ?
      `).bind(
        artist, title, format, vendor, vendorNumber,
        upc, quantity, year, oop, srp, imageUrl,
        id
      ).run();

      return new Response(JSON.stringify({ success: true, message: "In-Store product updated successfully.", id: id }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // Insert
      await db.prepare(`
        INSERT INTO Inventory (
          Artist, Title, Format, Vendor, Vendor_Number, 
          UPC, Quantity, Year, OOP, SRP, Image_URL
        ) VALUES (
          ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, ?
        )
      `).bind(
        artist, title, format, vendor, vendorNumber,
        upc, quantity, year, oop, srp, imageUrl
      ).run();

      const newRow = await db.prepare("SELECT last_insert_rowid() as id").first();
      const newId = newRow ? newRow.id : null;

      return new Response(JSON.stringify({ success: true, message: "In-Store product created successfully.", id: newId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
