const templates = require("./templates");

const sampleOrder = {
  order_id: "GWT-2047",
  customer_phone: "0712345678",
  name: "Aisha Wanjiru",
  grade: "Giza Meru",
  qty: 2,
  amount: 350,
  rider: "Kamau Mwangi",
  rider_plate: "KBZ 482N",
  rider_rating: "4.9",
  eta: "10:48 AM",
};

const events = [
  "order_confirmed",
  "rider_assigned",
  "rider_nearby",
  "delivered",
  "payment_failed",
];

const labels = {
  order_confirmed: "✅ Order Confirmed",
  rider_assigned: "🛵 Rider Assigned",
  rider_nearby: "📍 Rider Nearby",
  delivered: "🎉 Delivered",
  payment_failed: "⚠️  Payment Failed",
};

console.log("╔══════════════════════════════════════════════╗");
console.log("║      GWETHE — Notification Preview           ║");
console.log("╚══════════════════════════════════════════════╝\n");

events.forEach((event) => {
  const tpl = templates[event];
  console.log(`━━━ ${labels[event]} ━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log("\n📱 SMS:");
  console.log(tpl.sms(sampleOrder));
  console.log("\n💬 WhatsApp:");
  console.log(tpl.whatsapp(sampleOrder));
  console.log("\n");
});
