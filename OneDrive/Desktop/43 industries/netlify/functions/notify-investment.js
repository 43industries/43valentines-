const { Resend } = require('resend');

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
    const { email, amount, currency, note } = body;

    const toEmail =
      process.env.INVEST_INBOX_EMAIL ||
      process.env.TO_EMAIL ||
      'mayieka43@icloud.com';

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || 'onboarding@resend.dev';
      const { error } = await resend.emails.send({
        from: `43 Industries <${fromDomain}>`,
        to: [toEmail],
        subject: 'New portal investment commitment',
        html: `
          <h2>New commitment recorded via Investor Portal</h2>
          <p><strong>Email:</strong> ${escapeHtml(email || '—')}</p>
          <p><strong>Amount:</strong> ${escapeHtml(String(amount || '0'))} ${escapeHtml(currency || '')}</p>
          <p><strong>Note:</strong></p>
          <pre>${escapeHtml(note || '—')}</pre>
        `,
      });
      if (error) {
        console.error('Resend notify-investment error:', error);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('notify-investment error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong' }),
    };
  }
};

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

