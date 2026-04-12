# Gwethe Notifications Service

SMS and WhatsApp notification backend for the Gwethe jaba delivery app.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express webhook server — receives order events |
| `notifications.js` | Dispatcher — routes events to SMS + WhatsApp; adds `success` summary |
| `sms.js` | Africa's Talking SMS sender |
| `whatsapp.js` | Meta WhatsApp Cloud API sender |
| `phone.js` | Shared Kenya phone normalization for SMS and WhatsApp |
| `middleware/webhookAuth.js` | Shared secret checks for webhooks |
| `templates.js` | Message templates for every event |
| `test-messages.js` | Preview all messages without real API calls |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Where to get it |
|----------|----------------|
| `AT_API_KEY` | africastalking.com → API Key |
| `AT_USERNAME` | Your Africa's Talking username |
| `AT_SENDER_ID` | Register "GWETHE" as a Sender ID on AT |
| `WA_API_KEY` | Meta Developer Portal → WhatsApp → Access Token |
| `WA_PHONE_NUMBER_ID` | Meta Developer Portal → WhatsApp → Phone Number ID |
| `WEBHOOK_SECRET` | Generate a long random string; **required in production** |
| `MPESA_CALLBACK_SECRET` | Optional; only if a reverse proxy adds Bearer / `X-Webhook-Secret` (Safaricom does not send this) |

### 3. Preview messages (no API needed)

```bash
npm run test:messages
```

### 4. Start the server

```bash
npm start
```

Development with auto-reload:

```bash
npm run dev
```

## Securing order webhooks

For `POST /webhook/order-confirmed` and the other order routes (not M-Pesa unless you set `MPESA_CALLBACK_SECRET`), send the same value as `WEBHOOK_SECRET` using either:

- Header `Authorization: Bearer <WEBHOOK_SECRET>`, or
- Header `X-Webhook-Secret: <WEBHOOK_SECRET>`

In **production** (`NODE_ENV=production`), `WEBHOOK_SECRET` must be set or the server returns `503` for those routes.

In development, if `WEBHOOK_SECRET` is unset, order webhooks stay open for local testing (a warning is printed at startup).

## Webhook endpoints

```
POST /webhook/order-confirmed
POST /webhook/rider-assigned
POST /webhook/rider-nearby
POST /webhook/delivered
POST /webhook/payment-failed
POST /webhook/mpesa/callback   ← M-Pesa STK callback URL
GET  /health
```

The server accepts **JSON** and **urlencoded** bodies (Safaricom may send either). M-Pesa `Body` may be an object or a JSON string; both are handled.

## Request body (order webhooks)

JSON order object, for example:

```json
{
  "order_id": "GWT-2047",
  "customer_phone": "0712345678",
  "name": "Aisha Wanjiru",
  "grade": "Giza Meru",
  "qty": 2,
  "amount": 350,
  "rider": "Kamau Mwangi",
  "rider_plate": "KBZ 482N",
  "rider_rating": "4.9",
  "eta": "10:48 AM"
}
```

## Calling from your Gwethe app

```javascript
const axios = require("axios");
const NOTIFY_URL = "http://localhost:3000";
const secret = process.env.GWETHE_NOTIFY_SECRET;

await axios.post(
  `${NOTIFY_URL}/webhook/order-confirmed`,
  order,
  { headers: { Authorization: `Bearer ${secret}` } }
);
```

## Cost estimate (Africa's Talking Kenya)

| Channel | Per message | Per order (avg 4 msgs) |
|---------|-------------|------------------------|
| SMS | ~KSh 0.60 | ~KSh 2.40 |
| WhatsApp | ~KSh 0.45 | ~KSh 1.80 |
| Both channels | — | ~KSh 4.20 |

**24 orders/day ≈ KSh 100/day ≈ KSh 3,000/month**

## Deployment

Use a public HTTPS URL so your app can POST webhooks and M-Pesa can POST `/webhook/mpesa/callback`. Examples: **Railway.app**, **Render.com**.

M-Pesa callback URL example:

```
https://your-domain.com/webhook/mpesa/callback
```

For production, also restrict by network where possible (firewall, IP allowlist in front of Express) because the M-Pesa callback path cannot use the same shared secret Safaricom would not know.
