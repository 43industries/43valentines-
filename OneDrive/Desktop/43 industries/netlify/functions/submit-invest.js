const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, role, message } = body;

    if (!email || !name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name and email are required' }) };
    }

    const toEmail = process.env.INVEST_INBOX_EMAIL || process.env.TO_EMAIL || 'mayieka43@icloud.com';

    // 1. Send email (if Resend is configured)
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || 'onboarding@resend.dev';
      const { data, error } = await resend.emails.send({
        from: `43 Industries <${fromDomain}>`,
        to: [toEmail],
        replyTo: email,
        subject: `Investor inquiry from ${name}`,
        html: `
          <h2>New investor / partner inquiry</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Role / type:</strong> ${escapeHtml(role || '—')}</p>
          <p><strong>Message:</strong></p>
          <pre>${escapeHtml(message || '—')}</pre>
        `,
      });
      if (error) {
        console.error('Resend error:', error);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to send email' }) };
      }
    }

    // 2. Store lead in Supabase (if configured)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error: dbError } = await supabase.from('leads').insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: (role || '').trim() || null,
        message: (message || '').trim() || null,
      });
      if (dbError) console.error('Supabase insert error:', dbError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('submit-invest error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong' }) };
  }
};

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}
