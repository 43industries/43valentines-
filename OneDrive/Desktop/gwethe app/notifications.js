const { sendSMS } = require("./sms");
const { sendWhatsApp } = require("./whatsapp");
const templates = require("./templates");

async function notify(event, orderData, options = {}) {
  const { sms: smsEnabled = true, whatsapp: waEnabled = true } = options;

  const tpl = templates[event];
  if (!tpl) {
    console.error(`[Notify] Unknown event: "${event}"`);
    return { success: false, error: `Unknown event: ${event}` };
  }

  const phone = orderData.customer_phone;
  if (!phone) {
    console.error(`[Notify] No phone number for order ${orderData.order_id}`);
    return { success: false, error: "Missing customer phone" };
  }

  const results = {};

  if (smsEnabled) {
    const smsText = tpl.sms(orderData);
    results.sms = await sendSMS(phone, smsText);
  }

  if (waEnabled) {
    const waText = tpl.whatsapp(orderData);
    results.whatsapp = await sendWhatsApp(phone, waText);
  }

  const smsOk = !results.sms || results.sms.success !== false;
  const waOk = !results.whatsapp || results.whatsapp.success !== false;
  const attempted = Boolean(results.sms || results.whatsapp);
  const success = attempted && smsOk && waOk;

  return { ...results, success };
}

module.exports = {
  notifyOrderConfirmed: (order, opts) => notify("order_confirmed", order, opts),
  notifyRiderAssigned: (order, opts) => notify("rider_assigned", order, opts),
  notifyRiderNearby: (order, opts) => notify("rider_nearby", order, opts),
  notifyDelivered: (order, opts) => notify("delivered", order, opts),
  notifyPaymentFailed: (order, opts) => notify("payment_failed", order, opts),
  notify,
};
