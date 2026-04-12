require("dotenv").config();
const AfricasTalking = require("africastalking");
const { formatForSms } = require("./phone");

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

const sms = at.SMS;

async function sendSMS(to, message) {
  const phone = formatForSms(to);

  try {
    const result = await sms.send({
      to: [phone],
      message,
      from: process.env.AT_SENDER_ID || "GWETHE",
    });

    const recipient = result.SMSMessageData.Recipients[0];

    if (recipient.status === "Success") {
      console.log(`[SMS] Sent to ${phone} | Cost: ${recipient.cost}`);
      return { success: true, messageId: recipient.messageId, cost: recipient.cost };
    }
    console.error(`[SMS] Failed to ${phone}: ${recipient.status}`);
    return { success: false, error: recipient.status };
  } catch (err) {
    console.error(`[SMS] Error:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSMS };
