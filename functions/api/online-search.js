// functions/api/online-search.js
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const db = env.DB;

    const queryVal = url.searchParams.get('query') || '';
    const typeVal = url.searchParams.get('type') || 'artist';
    const formatVal = url.searchParams.get('format') || '%';
    const letterVal = url.searchParams.get('letter') || '';

    // Pagination parameters
    let limit = parseInt(url.searchParams.get('limit') || '10', 10);
    if (![10, 20, 40, 80].includes(limit)) {
      limit = 10;
    }
    let page = parseInt(url.searchParams.get('page') || '1', 10);
    if (page < 1) {
      page = 1;
    }
    const offset = (page - 1) * limit;

    const hideZeros = url.searchParams.get('hideZeros') === 'true';

    let filterSql = "";
    if (hideZeros) {
      filterSql += " AND Quantity > 0";
    }
    let bindParams = [];

    // Filter by Letter (A-Z or 0-9)
    if (letterVal) {
      if (letterVal === '0-9') {
        filterSql += " AND (substr(Artist, 1, 1) BETWEEN '0' AND '9' OR substr(Artist, 1, 1) = '#' OR Artist GLOB '[0-9]*')";
      } else {
        filterSql += " AND (substr(Artist, 1, 1) = ? OR substr(Artist, 1, 1) = ?)";
        bindParams.push(letterVal.toLowerCase(), letterVal.toUpperCase());
      }
    }

    // Filter by Query text
    if (queryVal) {
      if (typeVal === 'artist') {
        filterSql += " AND Artist LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else if (typeVal === 'title') {
        filterSql += " AND Title LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else if (typeVal === 'label') {
        filterSql += " AND Label LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else if (typeVal === 'genre') {
        filterSql += " AND Genre LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else if (typeVal === 'barcode') {
        filterSql += " AND Bar_Code LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else if (typeVal === 'ref') {
        filterSql += " AND Seller_Reference_Number LIKE ?";
        bindParams.push(`%${queryVal}%`);
      } else {
        filterSql += " AND (Artist LIKE ? OR Title LIKE ?)";
        bindParams.push(`%${queryVal}%`, `%${queryVal}%`);
      }
    }

    // Filter by Format
    if (formatVal && formatVal !== '%') {
      if (formatVal === 'vinyl') {
        filterSql += " AND (Format LIKE '%vinyl%' OR Format LIKE '%LP%' OR Format LIKE '%7\"%' OR Format LIKE '%10\"%' OR Format LIKE '%12\"%' OR Format LIKE '%78%' OR Format LIKE '%EP%')";
      } else if (formatVal === 'cd') {
        filterSql += " AND (Format LIKE '%CD%')";
      } else if (formatVal === 'vinyllp') {
        filterSql += " AND (Format LIKE '%LP%' AND Format NOT LIKE '%Box%')";
      } else if (formatVal === 'vinyl7') {
        filterSql += " AND (Format LIKE '%7\"%')";
      } else if (formatVal === 'vinyl10') {
        filterSql += " AND (Format LIKE '%10\"%')";
      } else if (formatVal === 'vinyl12') {
        filterSql += " AND (Format LIKE '%12\"%')";
      } else if (formatVal === 'vinyl78') {
        filterSql += " AND (Format LIKE '%78%')";
      } else if (formatVal === 'cdsing') {
        filterSql += " AND (Format LIKE '%CD Single%' OR Format LIKE '%CD Sing%')";
      } else if (formatVal === 'ep') {
        filterSql += " AND (Format LIKE '%EP%')";
      } else if (formatVal === 'cassette') {
        filterSql += " AND (Format LIKE '%Cassette%')";
      } else if (formatVal === 'video') {
        filterSql += " AND (Format LIKE '%Video%' OR Format LIKE '%VHS%' OR Format LIKE '%DVD%')";
      } else if (formatVal === 'book') {
        filterSql += " AND (Format LIKE '%Book%')";
      } else if (formatVal === 'clothing') {
        filterSql += " AND (Format LIKE '%Clothing%' OR Format LIKE '%Shirt%')";
      } else if (formatVal === 'memorabilia') {
        filterSql += " AND (Format LIKE '%Memorabilia%')";
      } else {
        filterSql += " AND Format LIKE ?";
        bindParams.push(`%${formatVal}%`);
      }
    }

    // 1. Get total record count matching the filters
    const countQuery = "SELECT COUNT(*) as total FROM Online_Inventory WHERE 1=1" + filterSql;
    const countStmt = db.prepare(countQuery);
    const countResult = await (bindParams.length > 0 ? countStmt.bind(...bindParams) : countStmt).first();
    const total = countResult ? countResult.total : 0;

    // 2. Fetch the paginated rows
    const dataQuery = "SELECT * FROM Online_Inventory WHERE 1=1" + filterSql + " ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?";
    const dataParams = [...bindParams, limit, offset];
    const dataStmt = db.prepare(dataQuery);
    const results = await dataStmt.bind(...dataParams).all();

    return new Response(JSON.stringify({ 
      success: true, 
      results: results.results, 
      total: total, 
      page: page, 
      limit: limit 
    }), {
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
