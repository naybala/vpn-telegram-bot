const db = require("../db");
const { CREDIT_VALUE } = require("../config");

// ==================================================================
// 🤝 REFERRAL SYSTEM — CORE LOGIC
// ==================================================================

// ── Generate a unique referral code ───────────────────────────────
function generateCode(telegramId) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1 ambiguity
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `USR_${String(telegramId).slice(-4)}${suffix}`;
}

// ── Ensure a user row exists; create one if not (handles existing users) ──
async function ensureUser(telegramId, firstName = null) {
  const id = String(telegramId);
  const [rows] = await db.execute(
    "SELECT id FROM users WHERE telegram_id = ?",
    [id]
  );

  if (rows.length > 0) return; // already exists

  // Generate a code, retry once if collision
  let code = generateCode(id);
  const [clash] = await db.execute(
    "SELECT id FROM users WHERE referral_code = ?",
    [code]
  );
  if (clash.length > 0) code = generateCode(id + Date.now());

  await db.execute(
    "INSERT INTO users (telegram_id, first_name, referral_code) VALUES (?, ?, ?)",
    [id, firstName, code]
  );
}

// ── Get user's referral code and credit balance ───────────────────
async function getReferralInfo(telegramId) {
  const [rows] = await db.execute(
    "SELECT referral_code, credits FROM users WHERE telegram_id = ?",
    [String(telegramId)]
  );
  return rows[0] || null;
}

// ── Validate a referral code entered by a new buyer ───────────────
// Returns { valid: true, referrerId } or { valid: false, reason }
async function validateReferralCode(code, newUserId) {
  const normalised = code.trim().toUpperCase();
  const newId = String(newUserId);

  // 1. Does the code exist?
  const [codeRows] = await db.execute(
    "SELECT telegram_id FROM users WHERE referral_code = ?",
    [normalised]
  );
  if (codeRows.length === 0) return { valid: false, reason: "not_found" };

  const referrerId = codeRows[0].telegram_id;

  // 2. Cannot use your own code
  if (referrerId === newId) return { valid: false, reason: "own_code" };

  // 3. This user hasn't already been referred
  const [alreadyRows] = await db.execute(
    "SELECT id FROM referrals WHERE referred_id = ?",
    [newId]
  );
  if (alreadyRows.length > 0) return { valid: false, reason: "already_used" };

  return { valid: true, referrerId };
}

// ── Register a referral (pending credit until payment approved) ───
async function registerReferral(referrerId, referredId, code) {
  await db.execute(
    `INSERT IGNORE INTO referrals (referrer_id, referred_id, referral_code, credited)
     VALUES (?, ?, ?, 0)`,
    [String(referrerId), String(referredId), code.toUpperCase()]
  );
}

// ── Award credit to referrer after admin approves payment ─────────
async function awardCredit(referrerId, telegram) {
  const id = String(referrerId);

  // 1. Mark referral as credited
  await db.execute(
    "UPDATE referrals SET credited = 1 WHERE referrer_id = ? AND credited = 0",
    [id]
  );

  // 2. Increment credit balance
  await db.execute(
    "UPDATE users SET credits = credits + 1 WHERE telegram_id = ?",
    [id]
  );

  // 3. Get new total for notification
  const [rows] = await db.execute(
    "SELECT credits FROM users WHERE telegram_id = ?",
    [id]
  );
  const total = rows[0]?.credits || 1;

  // 4. Notify referrer
  try {
    await telegram.sendMessage(
      id,
      `🎉 **Referral Credit ရရှိပါပြီ!**\n\n` +
        `သင်၏ Referral Code ကိုအသုံးပြု၍ VPN ဝယ်ယူသူ ရှိပါသည်!\n` +
        `✅ **+1 Credit** ရရှိပါသည်။\n\n` +
        `💰 Total: **${total} credit(s)** = **${total * CREDIT_VALUE} Ks**\n\n` +
        `_Credit ကို နောက်ထပ် VPN ဝယ်ရာတွင် Discount အဖြစ် Admin ထံ ပြောပါ။_`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.warn(`⚠️ [Referral] Could not notify referrer ${id}: ${e.message}`);
  }
}

// ── Check if a user is eligible to be asked for a referral code ──
// (first-time buyer only — no existing keys AND no existing referral record)
async function isFirstTimeBuyer(telegramId) {
  const id = String(telegramId);

  const [keyRows] = await db.execute(
    "SELECT id FROM user_keys WHERE telegram_id = ? LIMIT 1",
    [id]
  );
  if (keyRows.length > 0) return false; // already has a key

  const [refRows] = await db.execute(
    "SELECT id FROM referrals WHERE referred_id = ? LIMIT 1",
    [id]
  );
  return refRows.length === 0; // true only if never been referred
}

module.exports = {
  ensureUser,
  getReferralInfo,
  validateReferralCode,
  registerReferral,
  awardCredit,
  isFirstTimeBuyer,
};
