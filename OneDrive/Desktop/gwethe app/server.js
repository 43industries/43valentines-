require("dotenv").config();
const express = require("express");
const {
  notifyOrderConfirmed,
  notifyRiderAssigned,
  notifyRiderNearby,
  notifyDelivered,
  notifyPaymentFailed,
} = require("./notifications");
const { webhookSecret, mpesaCallbackSecret } = require("./middleware/webhookAuth");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

function extractStkCallback(body) {
  if (!body || typeof body !== "object") return null;
  let inner = body.Body;
  if (typeof inner === "string") {
    try {
      inner = JSON.parse(inner);
    } catch {
      return null;
    }
  }
  if (!inner || typeof inner !== "object") return null;
  return inner.stkCallback ?? null;
}

app.get("/health", (_, res) => res.json({ status: "ok", service: "gwethe-notifications" }));

app.post("/webhook/order-confirmed", webhookSecret, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] order_confirmed → #${order.order_id}`);
    const result = await notifyOrderConfirmed(order);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] order_confirmed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/rider-assigned", webhookSecret, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] rider_assigned → #${order.order_id}, rider: ${order.rider}`);
    const result = await notifyRiderAssigned(order);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] rider_assigned", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/rider-nearby", webhookSecret, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] rider_nearby → #${order.order_id}`);
    const result = await notifyRiderNearby(order);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] rider_nearby", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/delivered", webhookSecret, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] delivered → #${order.order_id}`);
    const result = await notifyDelivered(order);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] delivered", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/payment-failed", webhookSecret, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] payment_failed → #${order.order_id}`);
    const result = await notifyPaymentFailed(order);
    res.json(result);
  } catch (err) {
    console.error("[Webhook] payment_failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/webhook/mpesa/callback", mpesaCallbackSecret, (req, res) => {
  try {
    const stk = extractStkCallback(req.body);

    if (!stk) {
      return res.status(400).json({ error: "Invalid M-Pesa callback" });
    }

    const resultCode = stk.ResultCode;
    const checkoutRequestId = stk.CheckoutRequestID;

    if (resultCode === 0) {
      console.log(`[M-Pesa] Payment success checkout=${checkoutRequestId}`);
    } else {
      console.log(`[M-Pesa] Payment failed checkout=${checkoutRequestId}: ${stk.ResultDesc}`);
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("[Webhook] mpesa/callback", err);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Error" });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    if (!process.env.WEBHOOK_SECRET && process.env.NODE_ENV !== "production") {
      console.warn("\n[WARN] WEBHOOK_SECRET is unset — order webhooks are open. Set it before exposing this port.\n");
    }
    console.log(`\nGwethe Notifications Server on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Webhooks: /webhook/*\n`);
  });
}

module.exports = { app };
