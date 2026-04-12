/**
 * Protects order webhooks from open internet abuse (SMS/WhatsApp cost).
 * Send either header: Authorization: Bearer <WEBHOOK_SECRET>
 * or: X-Webhook-Secret: <WEBHOOK_SECRET>
 */

function requireBearerOrHeaderSecret(secret) {
  return (req, res, next) => {
    const auth = req.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const header = (req.get("x-webhook-secret") || "").trim();
    if (bearer === secret || header === secret) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };
}

function webhookSecret(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "Server misconfigured: set WEBHOOK_SECRET in production",
      });
    }
    return next();
  }
  return requireBearerOrHeaderSecret(secret)(req, res, next);
}

/** Optional: set when M-Pesa hits a reverse proxy that injects this header (Safaricom will not). */
function mpesaCallbackSecret(req, res, next) {
  const secret = process.env.MPESA_CALLBACK_SECRET;
  if (!secret) return next();
  return requireBearerOrHeaderSecret(secret)(req, res, next);
}

module.exports = { webhookSecret, mpesaCallbackSecret };
