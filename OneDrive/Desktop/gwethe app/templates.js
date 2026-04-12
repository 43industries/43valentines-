const templates = {
  order_confirmed: {
    sms: (d) =>
      `Hi ${d.name}, your Gwethe order #${d.order_id} is confirmed! ` +
      `${d.grade} x${d.qty} for KSh ${d.amount}. We're preparing it now. ` +
      `Track: gwethe.ke/track/${d.order_id}`,

    whatsapp: (d) =>
      `*Gwethe* ✅ Order confirmed!\n\n` +
      `Hey ${d.name}, your order is in!\n` +
      `📦 ${d.grade} x${d.qty}\n` +
      `💰 KSh ${d.amount}\n` +
      `🔖 Ref: #${d.order_id}\n\n` +
      `We're bundling your jaba fresh right now. Hang tight! 🌿`,
  },

  rider_assigned: {
    sms: (d) =>
      `${d.name}, your jaba is on the way! Rider ${d.rider} (${d.rider_plate}) is heading to you. ` +
      `ETA: ${d.eta}. Track: gwethe.ke/track/${d.order_id}`,

    whatsapp: (d) =>
      `*Gwethe* 🛵 Your rider is on the way!\n\n` +
      `Hey ${d.name}!\n` +
      `👤 Rider: ${d.rider}\n` +
      `🏍️ Plate: ${d.rider_plate}\n` +
      `⭐ Rating: ${d.rider_rating}\n` +
      `🕐 ETA: ${d.eta}\n\n` +
      `Reply *CALL* to get the rider's number.`,
  },

  rider_nearby: {
    sms: (d) =>
      `${d.name}, ${d.rider} is almost there! Step outside — your jaba arrives in ~5 mins. Order #${d.order_id}.`,

    whatsapp: (d) =>
      `*Gwethe* 📍 Almost there!\n\n` +
      `Hey ${d.name}, ${d.rider} is less than 500m away!\n\n` +
      `🟢 Step outside — delivery in ~5 mins!`,
  },

  delivered: {
    sms: (d) =>
      `${d.name}, your jaba has been delivered! Enjoy your ${d.grade}. ` +
      `Rate us: gwethe.ke/rate/${d.order_id} — Team Gwethe 🌿`,

    whatsapp: (d) =>
      `*Gwethe* 🎉 Delivered!\n\n` +
      `Hey ${d.name}, your order is with you!\n\n` +
      `Enjoy your ${d.grade} 🌿\n\n` +
      `How was your experience?\n` +
      `👉 gwethe.ke/rate/${d.order_id}`,
  },

  payment_failed: {
    sms: (d) =>
      `${d.name}, your Gwethe payment of KSh ${d.amount} didn't go through. ` +
      `Retry: gwethe.ke/retry/${d.order_id} or call 0700-GWETHE.`,

    whatsapp: (d) =>
      `*Gwethe* ⚠️ Payment not received\n\n` +
      `Hey ${d.name}, your M-Pesa payment of KSh ${d.amount} didn't complete.\n\n` +
      `Retry here 👉 gwethe.ke/retry/${d.order_id}\n` +
      `📞 Need help? Call 0700-GWETHE`,
  },
};

module.exports = templates;
