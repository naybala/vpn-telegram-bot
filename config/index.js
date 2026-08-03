require("dotenv").config();

// ==================================================================
// ⚙️ CONFIGURATION
// ==================================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.USER_ID);   // Who can run /generate
const GROUP_ID = Number(process.env.GROUP_ID);   // Where notifications are sent
const DEFAULT_LIMIT_GB = 100;
const PLAN_DAYS = Number(process.env.PLAN_DAYS) || 30;  // Subscription duration in days
const CREDIT_VALUE = Number(process.env.CREDIT_VALUE) || 500; // Ks value per referral credit
const USER_LIMIT = Number(process.env.USER_LIMIT) || 0; // Max users per server (0 = unlimited)

// Load Server Lists
// API_URLS — required, filter blanks
const rawApiUrls = (process.env.API_URLS || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

// Per-server optional lists — keep empty slots so index alignment is preserved.
// e.g. DNS_HOSTNAMES=,sg.domain.com  →  server 0 gets null, server 1 gets "sg.domain.com"
const splitKeepIndex = (val) => (val || "").split(",").map((s) => s.trim());

const rawDnsList   = splitKeepIndex(process.env.DNS_HOSTNAMES);
const rawNames     = splitKeepIndex(process.env.SERVER_NAMES);
const rawPrices    = splitKeepIndex(process.env.SERVER_PRICES);

// Validation
const missing = [];
if (!BOT_TOKEN) missing.push("BOT_TOKEN");
if (!process.env.USER_ID) missing.push("USER_ID");
if (!process.env.GROUP_ID) missing.push("GROUP_ID");
if (!process.env.DB_HOST) missing.push("DB_HOST");
if (rawApiUrls.length === 0) missing.push("API_URLS");

if (missing.length > 0) {
  console.error(`❌ Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// Build Server Objects
// dns   → null if slot is empty (raw IP is used, no replacement)
// name  → "Server #N" fallback if slot is empty
// price → "7000 Ks" fallback if slot is empty
const SERVERS = rawApiUrls.map((url, index) => ({
  id: index,
  apiUrl: url,
  dns:   rawDnsList[index]  && rawDnsList[index].length > 0  ? rawDnsList[index]  : null,
  name:  rawNames[index]    && rawNames[index].length > 0    ? rawNames[index]    : `Server #${index + 1}`,
  price: rawPrices[index]   && rawPrices[index].length > 0   ? rawPrices[index]   : "7000 Ks",
}));



// Optional Proxy Config
const BOT_PROXY = process.env.BOT_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;

// Admin Contact
const adminAccount = process.env.ADMIN_ACCOUNT || "@admin";

// ==================================================================
// 💳 PAYMENT METHODS
// Each method is included only if its phone number is configured.
// ==================================================================
const PAYMENT_METHODS = [];

if (process.env.KPAY_PHONE_NUMBER) {
  PAYMENT_METHODS.push({
    key:    "kpay",
    label:  "💳 KPay",
    phone:  process.env.KPAY_PHONE_NUMBER,
    owner:  process.env.KPAY_OWNER || "",
    note:   "Note မှာ 'Family and Friends' ဟုရေးပေးပါ",
  });
}

if (process.env.AYAPAY_PHONE_NUMBER) {
  PAYMENT_METHODS.push({
    key:    "ayapay",
    label:  "🏦 AyaPay",
    phone:  process.env.AYAPAY_PHONE_NUMBER,
    owner:  process.env.AYAPAY_OWNER || "",
    note:   "AyaPay မှတစ်ဆင့် ပေးပို့ပါ",
  });
}

if (process.env.CBPAY_PHONE_NUMBER) {
  PAYMENT_METHODS.push({
    key:    "cbpay",
    label:  "🏧 CBPay",
    phone:  process.env.CBPAY_PHONE_NUMBER,
    owner:  process.env.CBPAY_OWNER || "",
    note:   "CBPay မှတစ်ဆင့် ပေးပို့ပါ",
  });
}

module.exports = {
  BOT_TOKEN,
  ADMIN_ID,
  GROUP_ID,
  DEFAULT_LIMIT_GB,
  PLAN_DAYS,
  CREDIT_VALUE,
  USER_LIMIT,
  SERVERS,
  BOT_PROXY,
  adminAccount,
  PAYMENT_METHODS,
};


