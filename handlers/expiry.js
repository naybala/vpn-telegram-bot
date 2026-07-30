const cron = require("node-cron");
const db = require("../db");
const { getClient } = require("../bot");

// How many days before expiry to send a warning (configurable via env)
const WARN_DAYS = Number(process.env.WARN_DAYS_BEFORE) || 3;


// ==================================================================
// 🕐 EXPIRY JOBS
//
// Job 1 — Daily at 08:00: warn users whose key expires in WARN_DAYS
// Job 2 — Daily at 08:30: delete expired keys from Outline + mark DB
// ==================================================================

// ── Helper: get telegram bot instance ─────────────────────────────
let _bot = null;
function setBotInstance(botInstance) {
  _bot = botInstance;
}

// ── Warn users approaching expiry ─────────────────────────────────
async function warnExpiringKeys() {
  console.log("🔔 [Expiry] Checking for keys expiring soon...");
  try {
    const [rows] = await db.execute(`
      SELECT *
      FROM user_keys
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at > NOW()
        AND expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
    `, [WARN_DAYS]);

    for (const row of rows) {
      const expiresAt = new Date(row.expires_at);
      const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      const expiresDisplay = expiresAt.toLocaleDateString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      try {
        await _bot.telegram.sendMessage(
          row.telegram_id,
          `⚠️ **VPN Plan သတိပေးချက်**\n\n` +
          `သင်၏ VPN Key သည် **${daysLeft}** ရက်အတွင်း (**${expiresDisplay}**) သက်တမ်းကုန်မည်ဖြစ်သည်။\n\n` +
          `ဆက်လက်အသုံးပြုလိုပါက Plan အသစ်ဝယ်ယူပြီး Admin ထံဆက်သွယ်ပါ။\n` +
          `'၀ယ်မည်' Button ကို နှိပ်ပါ။`,
          { parse_mode: "Markdown" }
        );
        console.log(`🔔 [Expiry] Warned user ${row.telegram_id} (expires in ${daysLeft} days)`);
      } catch (e) {
        console.warn(`⚠️ [Expiry] Could not notify user ${row.telegram_id}: ${e.message}`);
      }
    }

    if (rows.length === 0) console.log("✅ [Expiry] No keys expiring soon.");
  } catch (e) {
    console.error("❌ [Expiry] warnExpiringKeys error:", e.message);
  }
}

// ── Expire & delete overdue keys ──────────────────────────────────
async function expireOverdueKeys() {
  console.log("🗑️  [Expiry] Checking for expired keys...");
  try {
    const [rows] = await db.execute(`
      SELECT * FROM user_keys
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
    `);

    for (const row of rows) {
      // 1. Delete from Outline server
      try {
        const client = getClient(row.server_index);
        await client.delete(`/access-keys/${row.key_id}`);
        console.log(`🗑️  [Expiry] Deleted Outline key ${row.key_id} for user ${row.telegram_id}`);
      } catch (e) {
        // If key not found on server it's already gone — still mark expired
        if (e.response?.status !== 404) {
          console.warn(`⚠️ [Expiry] Could not delete Outline key ${row.key_id}: ${e.message}`);
        }
      }

      // 2. Delete key row permanently from DB
      await db.execute(
        "DELETE FROM user_keys WHERE id = ?",
        [row.id]
      );

      // 3. Notify user
      try {
        await _bot.telegram.sendMessage(
          row.telegram_id,
          `❌ **VPN Plan သက်တမ်းကုန်ဆုံးပြီ**\n\n` +
          `သင်၏ VPN Key သည် သက်တမ်းကုန်ဆုံးသောကြောင့် ပိတ်ထားပြီးဖြစ်သည်။\n\n` +
          `ဆက်လက်အသုံးပြုလိုပါက Plan အသစ်ဝယ်ယူပြီး Admin ထံဆက်သွယ်ပါ။\n` +
          `'၀ယ်မည်' Button ကို နှိပ်ပါ။`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        console.warn(`⚠️ [Expiry] Could not notify user ${row.telegram_id}: ${e.message}`);
      }

      console.log(`✅ [Expiry] Expired key id=${row.id} for user ${row.telegram_id}`);
    }

    if (rows.length === 0) console.log("✅ [Expiry] No expired keys to process.");
  } catch (e) {
    console.error("❌ [Expiry] expireOverdueKeys error:", e.message);
  }
}

// ── Register cron schedules ───────────────────────────────────────
function startExpiryJobs(botInstance) {
  setBotInstance(botInstance);

  // Warn expiring keys — every day at 08:00
  cron.schedule("0 8 * * *", warnExpiringKeys, { timezone: "Asia/Rangoon" });

  // Expire overdue keys — every day at 08:30
  cron.schedule("30 8 * * *", expireOverdueKeys, { timezone: "Asia/Rangoon" });

  console.log("⏰ Expiry cron jobs registered (08:00 warn / 08:30 expire, Asia/Rangoon)");
}

module.exports = { startExpiryJobs };
