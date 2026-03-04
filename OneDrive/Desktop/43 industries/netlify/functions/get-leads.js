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
      .from('leads')
      .select('id, name, email, role, message, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('get-leads error:', error);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch leads' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ leads: data || [] }),
    };
  } catch (err) {
    console.error('get-leads error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong' }),
    };
  }
};
