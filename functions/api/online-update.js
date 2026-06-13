// functions/api/online-update.js
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
        return new Response(JSON.stringify({ error: "Missing product ID for deletion." }), { status: 400 });
      }
      
      await db.prepare("DELETE FROM Online_Inventory WHERE id = ?").bind(id).run();
      
      return new Response(JSON.stringify({ success: true, message: "Product deleted successfully." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Otherwise, we are adding or updating
    const id = body.id ? parseInt(body.id, 10) : null;
    const artist = body.Artist || '';
    const title = body.Title || '';
    const format = body.Format || '';
    const discogsId = body.Discogs_ID || '';
    const price = body.Price !== undefined && body.Price !== '' ? parseFloat(body.Price) : null;
    const description = body.Description || '';
    const condMedia = body.Condition_Media || '';
    const condSleeve = body.Condition_Sleeve || '';
    const sellerRef = body.Seller_Reference_Number || '';
    const quantity = body.Quantity !== undefined && body.Quantity !== '' ? parseInt(body.Quantity, 10) : 0;
    const label = body.Label || '';
    const catalogNum = body.Release_Catalog_Number || '';
    const country = body.Release_Country || '';
    const date = body.Release_Date || '';
    const genre = body.Genre || '';
    const frontImg = body.Front_Image_URL || '';
    const backImg = body.Back_Image_URL || '';
    const youtubeUrls = body.YouTube_Audio_Image_URLs || '';
    const barcode = body.Bar_Code || '';
    const numInSet = body.Number_In_Set || '';

    if (!title && !artist) {
      return new Response(JSON.stringify({ error: "Artist or Title must be provided." }), { status: 400 });
    }

    if (id) {
      // Update
      await db.prepare(`
        UPDATE Online_Inventory SET 
          Artist = ?, Title = ?, Format = ?, Discogs_ID = ?, Price = ?, 
          Description = ?, Condition_Media = ?, Condition_Sleeve = ?, 
          Seller_Reference_Number = ?, Quantity = ?, Label = ?, 
          Release_Catalog_Number = ?, Release_Country = ?, Release_Date = ?, 
          Genre = ?, Front_Image_URL = ?, Back_Image_URL = ?, 
          YouTube_Audio_Image_URLs = ?, Bar_Code = ?, Number_In_Set = ?
        WHERE id = ?
      `).bind(
        artist, title, format, discogsId, price,
        description, condMedia, condSleeve,
        sellerRef, quantity, label,
        catalogNum, country, date,
        genre, frontImg, backImg,
        youtubeUrls, barcode, numInSet,
        id
      ).run();

      return new Response(JSON.stringify({ success: true, message: "Product updated successfully.", id: id }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      // Insert
      const result = await db.prepare(`
        INSERT INTO Online_Inventory (
          Artist, Title, Format, Discogs_ID, Price, 
          Description, Condition_Media, Condition_Sleeve, 
          Seller_Reference_Number, Quantity, Label, 
          Release_Catalog_Number, Release_Country, Release_Date, 
          Genre, Front_Image_URL, Back_Image_URL, 
          YouTube_Audio_Image_URLs, Bar_Code, Number_In_Set
        ) VALUES (
          ?, ?, ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, ?
        )
      `).bind(
        artist, title, format, discogsId, price,
        description, condMedia, condSleeve,
        sellerRef, quantity, label,
        catalogNum, country, date,
        genre, frontImg, backImg,
        youtubeUrls, barcode, numInSet
      ).run();

      // Get the last inserted row ID
      const newRow = await db.prepare("SELECT last_insert_rowid() as id").first();
      const newId = newRow ? newRow.id : null;

      return new Response(JSON.stringify({ success: true, message: "Product created successfully.", id: newId }), {
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
