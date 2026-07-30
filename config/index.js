require("dotenv").config();

// ==================================================================
// ⚙️ CONFIGURATION
// ==================================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.USER_ID);   // Who can run /generate
const GROUP_ID = Number(process.env.GROUP_ID);   // Where notifications are sent
const DEFAULT_LIMIT_GB = 100;
const PLAN_DAYS = Number(process.env.PLAN_DAYS) || 30;  // Subscription duration in days

// Load Server Lists
const rawApiUrls = (process.env.API_URLS || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
const rawDnsList = (process.env.DNS_HOSTNAMES || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
const rawNames = (process.env.SERVER_NAMES || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
const rawPrices = (process.env.SERVER_PRICES || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

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
const SERVERS = rawApiUrls.map((url, index) => ({
  id: index,
  apiUrl: url,
  dns: rawDnsList[index] || null,
  name: rawNames[index] || `Server #${index + 1}`,
  price: rawPrices[index] || "7000 Ks",
}));


// Optional Proxy Config
const BOT_PROXY = process.env.BOT_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;

// Payment & Contact Info
const KPayPhoneNumber = process.env.KPAY_PHONE_NUMBER || "09763684400";
const kpayOwner = process.env.KPAY_OWNER || "Nay Ba La";
const adminAccount = process.env.ADMIN_ACCOUNT || "@neverDavion";

module.exports = {
  BOT_TOKEN,
  ADMIN_ID,
  GROUP_ID,
  DEFAULT_LIMIT_GB,
  PLAN_DAYS,
  SERVERS,
  BOT_PROXY,
  KPayPhoneNumber,
  kpayOwner,
  adminAccount,
  KPAY_PHONE_NUMBER: KPayPhoneNumber,
  KPAY_OWNER: kpayOwner,
  ADMIN_ACCOUNT: adminAccount,
};


