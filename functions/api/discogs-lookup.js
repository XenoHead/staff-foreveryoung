// functions/api/discogs-lookup.js
export async function onRequestGet(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const releaseId = url.searchParams.get('id') || '';

    if (!releaseId) {
      return new Response(JSON.stringify({ error: "Missing release ID." }), { status: 400 });
    }

    // Call official Discogs API release lookup
    const discogsUrl = `https://api.discogs.com/releases/${releaseId}`;
    
    // Compliant User-Agent header is required by Discogs
    const response = await fetch(discogsUrl, {
      headers: {
        'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com'
      }
    });

    if (response.status === 404) {
      return new Response(JSON.stringify({ error: "Release not found on Discogs." }), { status: 404 });
    }

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Discogs API returned error: ${response.statusText} (${response.status})` }), { status: response.status });
    }

    const data = await response.json();

    // Map fields
    // 1. Artist (join and clean disambiguation numbers like "Nirvana (2)")
    const artistStr = data.artists 
      ? data.artists.map(a => a.name.replace(/\s*\(\d+\)$/, '')).join(', ') 
      : '';

    // 2. Title
    const titleStr = data.title || '';

    // 3. Format (join name and descriptions)
    let formatStr = '';
    if (data.formats && data.formats.length > 0) {
      formatStr = data.formats.map(f => {
        const qtyPrefix = f.qty && parseInt(f.qty, 10) > 1 ? `${f.qty}x ` : '';
        const descSuffix = f.descriptions ? ` (${f.descriptions.join(', ')})` : '';
        return `${qtyPrefix}${f.name}${descSuffix}`;
      }).join(', ');
    }

    // 4. Genre (merge genres and styles)
    const genreList = [];
    if (data.genres) genreList.push(...data.genres);
    if (data.styles) genreList.push(...data.styles);
    const genreStr = [...new Set(genreList)].join(', ');

    // 5. Label
    const labelStr = data.labels 
      ? data.labels.map(l => l.name).join(', ') 
      : '';

    // 6. Catalog Number
    const catalogStr = data.labels 
      ? data.labels.map(l => l.catno).join(', ') 
      : '';

    // 7. Country
    const countryStr = data.country || '';

    // 8. Release Date / Year
    const dateStr = data.released || (data.year ? String(data.year) : '');

    // 9. Barcode / UPC (find identifier of type 'barcode')
    let barcodeStr = '';
    if (data.identifiers) {
      const barcodeObj = data.identifiers.find(i => i.type === 'barcode');
      if (barcodeObj && barcodeObj.value) {
        // Remove spaces, dashes, dots, and any text annotations like "barcode text"
        barcodeStr = barcodeObj.value.replace(/[^0-9X]/gi, '');
      }
    }

    // 10. Images (Front Cover & Back Cover)
    let frontImg = '';
    let backImg = '';
    if (data.images && data.images.length > 0) {
      const primary = data.images.find(img => img.type === 'primary');
      frontImg = primary ? primary.resource_url : data.images[0].resource_url;
      
      const secondary = data.images.filter(img => img.type !== 'primary');
      if (secondary.length > 0) {
        backImg = secondary[0].resource_url;
      }
    }

    // 11. YouTube videos
    let youtubeStr = '';
    if (data.videos) {
      youtubeStr = data.videos.map(v => v.uri).join(', ');
    }

    // 12. Number In Set (Sum of format quantities)
    let numInSet = '';
    if (data.formats) {
      const totalQty = data.formats.reduce((sum, f) => sum + (parseInt(f.qty, 10) || 0), 0);
      if (totalQty > 0) {
        numInSet = String(totalQty);
      }
    }

    // 13. Description (Tracks & Notes)
    const descLines = [];
    if (data.tracklist && data.tracklist.length > 0) {
      descLines.push("TRACKLIST:");
      data.tracklist.forEach(t => {
        if (t.title) {
          const pos = t.position ? `${t.position}. ` : '';
          const dur = t.duration ? ` (${t.duration})` : '';
          descLines.push(`${pos}${t.title}${dur}`);
        }
      });
    }
    if (data.notes) {
      if (descLines.length > 0) descLines.push("");
      descLines.push("RELEASE NOTES:");
      descLines.push(data.notes);
    }
    const descriptionStr = descLines.join('\n');

    const result = {
      Artist: artistStr,
      Title: titleStr,
      Format: formatStr,
      Genre: genreStr,
      Label: labelStr,
      Release_Catalog_Number: catalogStr,
      Release_Country: countryStr,
      Release_Date: dateStr,
      Bar_Code: barcodeStr,
      Front_Image_URL: frontImg,
      Back_Image_URL: backImg,
      YouTube_Audio_Image_URLs: youtubeStr,
      Number_In_Set: numInSet,
      Description: descriptionStr,
      Discogs_ID: String(data.id),
      Discogs_url: `https://www.discogs.com/release/${data.id}`
    };

    return new Response(JSON.stringify({ success: true, result: result }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
