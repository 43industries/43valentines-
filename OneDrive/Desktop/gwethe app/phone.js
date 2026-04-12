/**
 * Kenya mobile normalization shared by SMS (E.164 with +) and WhatsApp Cloud API (digits, no +).
 */

function toKenyaDigits(phone) {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("254") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;

  return null;
}

function formatForSms(phone) {
  const d = toKenyaDigits(phone);
  if (d) return `+${d}`;
  const fallback = String(phone).replace(/\D/g, "");
  if (fallback.startsWith("254")) return `+${fallback}`;
  return String(phone).trim() || phone;
}

/** Meta WhatsApp Cloud API: country code + national number, no plus sign. */
function formatForWhatsApp(phone) {
  const d = toKenyaDigits(phone);
  if (d) return d;
  return String(phone).replace(/\D/g, "") || String(phone);
}

module.exports = { toKenyaDigits, formatForSms, formatForWhatsApp };
