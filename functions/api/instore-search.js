// functions/api/instore-search.js
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const db = env.DB;

    // Determine if UPC-specific search
    const upcParam = url.searchParams.get('upc');
    const queryParam = url.searchParams.get('query');
    const query = upcParam || queryParam || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 80);
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
    const offset = (page - 1) * limit;

    let filterSql = '';
    let bindParams = [];

    if (query) {
      // Search across UPC (exact or partial), Artist, and Title
      filterSql = ' AND (UPC LIKE ? OR Artist LIKE ? OR Title LIKE ?)';
      bindParams = [`%${query}%`, `%${query}%`, `%${query}%`];
    }

    const hideZeros = url.searchParams.get('hideZeros') === 'true';
    const quantityCondition = hideZeros ? ' AND Quantity > 0' : '';

    // Total count
    const countQuery = 'SELECT COUNT(*) as total FROM Inventory WHERE 1=1' + quantityCondition + filterSql;
    const countResult = await (
      bindParams.length > 0
        ? db.prepare(countQuery).bind(...bindParams)
        : db.prepare(countQuery)
    ).first();
    const total = countResult ? countResult.total : 0;

    // Data query
    const dataQuery =
      'SELECT id, UPC, Quantity, Format, Artist, Title, Vendor_Number, Year, SRP FROM Inventory WHERE 1=1' +
      quantityCondition +
      filterSql +
      ' ORDER BY Artist ASC, Title ASC LIMIT ? OFFSET ?';
    const dataParams = [...bindParams, limit, offset];
    const results = await db.prepare(dataQuery).bind(...dataParams).all();

    return new Response(
      JSON.stringify({
        success: true,
        results: results.results,
        total,
        page,
        limit,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
