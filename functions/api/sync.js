// functions/api/sync.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const db = env.DB;
    
    // We expect the body to contain structured arrays from the local agent
    const { receipts = [], sales = [], orders = [] } = body;
    
    // Process Receipts (UNIVERSAL*.xls)
    // Adds to inventory stock
    for (const item of receipts) {
      await db.prepare(`
        INSERT INTO Inventory (UPC, Quantity, Format, Artist, Title, Vendor_Number, OOP, Year, Vendor, Modified, SRP)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(UPC) DO UPDATE SET 
          Quantity = Quantity + excluded.Quantity,
          Modified = excluded.Modified,
          SRP = excluded.SRP
      `).bind(
        item.UPC, item.Quantity, item.Format, item.Artist, item.Title, 
        item.Vendor_Number, item.OOP, item.Year, item.Vendor, item.Modified, item.SRP
      ).run();
    }

    // Process Sales (IMS*.xls)
    // Subtracts from inventory, logs to Sales table
    for (const item of sales) {
      // 1. Ensure it exists in inventory first (upsert)
      await db.prepare(`
        INSERT INTO Inventory (UPC, Quantity, Format, Artist, Title, Vendor_Number, OOP, Year, Vendor, Modified, SRP)
        VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(UPC) DO UPDATE SET 
          Quantity = Quantity - ?,
          Modified = excluded.Modified
      `).bind(
        item.UPC, item.Format, item.Artist, item.Title, item.Vendor_Number, 
        item.OOP, item.Year, item.Vendor, item.Modified, item.SRP,
        item.Quantity // amount to subtract
      ).run();

      // 2. Fetch the inventory_id to link the sale
      const invRow = await db.prepare("SELECT id FROM Inventory WHERE UPC = ?").bind(item.UPC).first();
      
      // 3. Log the sale
      if (invRow) {
        await db.prepare(`
          INSERT INTO Sales (inventory_id, UPC, Quantity_Sold, Date_Sold, SRP)
          VALUES (?, ?, ?, ?, ?)
        `).bind(invRow.id, item.UPC, item.Quantity, item.Modified, item.SRP).run();
      }
    }

    // Process Orders (order_sheet*.xls)
    // Logs to Orders table
    for (const item of orders) {
      // 1. Ensure it exists in inventory
      await db.prepare(`
        INSERT INTO Inventory (UPC, Quantity, Format, Artist, Title, Vendor_Number, OOP, Year, Vendor, Modified, SRP)
        VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(UPC) DO NOTHING
      `).bind(
        item.UPC, item.Format, item.Artist, item.Title, item.Vendor_Number, 
        item.OOP, item.Year, item.Vendor, item.Modified, item.SRP
      ).run();

      const invRow = await db.prepare("SELECT id FROM Inventory WHERE UPC = ?").bind(item.UPC).first();
      
      if (invRow) {
        await db.prepare(`
          INSERT INTO Orders (inventory_id, UPC, Quantity_Ordered, Vendor, Order_Date)
          VALUES (?, ?, ?, ?, ?)
        `).bind(invRow.id, item.UPC, item.Quantity, item.Vendor, item.Modified).run();
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: { receipts: receipts.length, sales: sales.length, orders: orders.length }
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Sync Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
