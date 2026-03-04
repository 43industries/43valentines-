const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const adminKey = event.headers['x-admin-key'] || event.queryStringParameters?.key;
  const expected = process.env.ADMIN_SECRET;

  if (!expected || adminKey !== expected) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Database not configured' }),
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('investments')
      .select(
        `
        id,
        amount,
        currency,
        status,
        investor_id,
        created_at,
        investor:investor_profiles (
          full_name,
          created_at
        )
      `
      );

    if (error) {
      console.error('get-investments-admin error:', error);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch investments' }),
      };
    }

    // Aggregate by investor for a quick overview.
    const byInvestor = {};
    (data || []).forEach((row) => {
      const invId = row.investor_id || 'unknown';
      if (!byInvestor[invId]) {
        byInvestor[invId] = {
          investor_id: invId,
          name: row.investor?.full_name || '—',
          email: null, // Email is only available via auth; keep this minimal.
          total_amount: 0,
          currency: row.currency || 'USD',
          count: 0,
        };
      }
      byInvestor[invId].total_amount += Number(row.amount || 0);
      byInvestor[invId].count += 1;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rows: Object.values(byInvestor),
      }),
    };
  } catch (err) {
    console.error('get-investments-admin error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong' }),
    };
  }
};

