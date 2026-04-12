require("dotenv").config();
const axios = require("axios");
const { formatForWhatsApp } = require("./phone");

const WA_BASE = "https://graph.facebook.com/v18.0";

async function sendWhatsApp(to, message) {
  const phone = formatForWhatsApp(to);

  try {
    const response = await axios.post(
      `${WA_BASE}/${process.env.WA_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const msgId = response.data.messages?.[0]?.id;
    console.log(`[WhatsApp] Sent to ${phone} | ID: ${msgId}`);
    return { success: true, messageId: msgId };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    console.error(`[WhatsApp] Error sending to ${phone}:`, errMsg);
    return { success: false, error: errMsg };
  }
}

module.exports = { sendWhatsApp };
