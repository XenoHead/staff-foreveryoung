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

    // Ensure a default crate_config exists so UI doesn't rely on hard-coded defaults
    const existingConfig = await db.prepare(`SELECT value FROM Settings WHERE key='crate_config'`).first();
    if (!existingConfig) {
      const defaultConfig = {
        names: {
          new: 'New',
          new_releases: 'New Releases',
          instore: 'In Store',
          online: 'Online',
          hot: 'Hot',
          rare: 'Rare',
          temp1: 'Temp 1',
          temp2: 'Temp 2',
          temp3: 'Temp 3',
          temp4: 'Temp 4',
          temp5: 'Temp 5',
          genres: 'Genres'
        },
        new_enabled: true,
        new_releases_enabled: true,
        instore_enabled: true,
        online_enabled: true,
        hot_enabled: true,
        rare_enabled: true,
        genres_enabled: true,
        temp1_enabled: false,
        temp2_enabled: false,
        temp3_enabled: false,
        temp4_enabled: false,
        temp5_enabled: false
      };
      await db.prepare(`INSERT INTO Settings (key, value) VALUES ('crate_config', ?)`).bind(JSON.stringify(defaultConfig)).run();
    }

    // Return crate config (names + enabled)
    if (type === 'config') {
      const row = await db.prepare(`SELECT value FROM Settings WHERE key='crate_config'`).first();
      const config = row ? JSON.parse(row.value || '{}') : {};
      return new Response(JSON.stringify({ success: true, config }), { status: 200, headers: corsHeaders });
    }

    if (type === 'details') {
      const keys = ["new", "new_releases", "instore", "online", "hot", "rare", "temp1", "temp2", "temp3", "temp4", "temp5", "genres"];
      const responseObj = { success: true };

      for (const k of keys) {
        const setting = await db.prepare("SELECT value FROM Settings WHERE key = ?").bind("featured_" + k).first();
        const value = setting ? setting.value || "" : "";
        let items = [];
        
        if (value) {
          const refs = value.split(',').map(r => r.trim()).filter(r => r.length > 0);
          if (refs.length > 0) {
            const placeholders = refs.map(() => '?').join(',');
            const query = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${placeholders}) OR Bar_Code IN (${placeholders})`;
            const detailsResult = await db.prepare(query).bind(...refs, ...refs).all();
            
            const onlineItems = (detailsResult.results || []).map(item => ({ ...item, _source: 'online' }));
            
            // Identify missing
            const foundRefs = new Set();
            onlineItems.forEach(item => {
              if (item.Seller_Reference_Number) foundRefs.add(item.Seller_Reference_Number.toLowerCase());
              if (item.Bar_Code) foundRefs.add(item.Bar_Code.toLowerCase());
            });
            
            const missingRefs = refs.filter(r => !foundRefs.has(r.toLowerCase()));
            let instoreItems = [];
            
            if (missingRefs.length > 0) {
              const instorePlaceholders = missingRefs.map(() => '?').join(',');
              const instoreQuery = `SELECT * FROM Inventory WHERE UPC IN (${instorePlaceholders}) OR Vendor_Number IN (${instorePlaceholders})`;
              const instoreResult = await db.prepare(instoreQuery).bind(...missingRefs, ...missingRefs).all();
              
              instoreItems = (instoreResult.results || []).map(item => ({
                id: item.id,
                Artist: item.Artist,
                Title: item.Title,
                Format: item.Format,
                Price: parseFloat(item.SRP) || 0.00,
                SRP: item.SRP || '',
                Bar_Code: item.UPC,
                UPC: item.UPC || '',
                Quantity: item.Quantity,
                Vendor: item.Vendor || '',
                Vendor_Number: item.Vendor_Number || '',
                Year: item.Year || '',
                OOP: item.OOP || '',
                Genre: item.Genre || '',
                Country: item.Country || '',
                Front_Image_URL: item.Image_URL || item.Front_Image_URL || '',
                Image_URL: item.Image_URL || item.Front_Image_URL || '',
                _source: 'instore'
              }));
            }
            
            items = [...onlineItems, ...instoreItems];
          }
        }
        responseObj[k] = { value, items };
      }
      return new Response(JSON.stringify(responseObj), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
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

    // Save crate config (names + enabled)
    const config = body.config;
    if (config !== undefined) {
      const configStr = JSON.stringify(config);
      await db.prepare(`INSERT INTO Settings (key, value) VALUES ('crate_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(configStr).run();
    }

    // Save featured items for all crates
    const keys = ["new", "new_releases", "instore", "online", "hot", "rare", "temp1", "temp2", "temp3", "temp4", "temp5", "genres"];
    for (const k of keys) {
      if (body[k] !== undefined) {
        const val = body[k] || "";
        await db.prepare(`INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind("featured_" + k, val).run();
      }
    }
    
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
