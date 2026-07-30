const { ADMIN_ID, PLAN_DAYS, SERVERS } = require("../config");
const db = require("../db");

// ==================================================================
// 🔄 ADMIN: /extend COMMAND
// Extends the expiry of a user's most recent active key.
//
// Usage:
//   /extend <userId>           → extend by PLAN_DAYS (default 30)
//   /extend <userId> <days>    → extend by custom number of days
// ==================================================================
async function handleExtend(ctx) {
  // Guard: admin-only
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.split(" ");
  const rawId = parts[1];
  const customDays = parts[2] ? parseInt(parts[2], 10) : null;

  if (!rawId) {
    return ctx.reply(
      "❌ Usage:\n" +
      "/extend <userId>         — extend by default plan days\n" +
      "/extend <userId> <days>  — extend by custom days"
    );
  }

  const targetUserId = String(rawId).trim();
  const daysToAdd = customDays && customDays > 0 ? customDays : PLAN_DAYS;

  try {
    // Find the user's most recently active key
    const [rows] = await db.execute(
      `SELECT * FROM user_keys
       WHERE telegram_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [targetUserId]
    );

    if (rows.length === 0) {
      return ctx.reply(
        `❌ User ${targetUserId} has no active keys.\n\n` +
        `Use /generate ${targetUserId} to create a new key.`
      );
    }

    const key = rows[0];
    const serverName = SERVERS[key.server_index]
      ? SERVERS[key.server_index].name
      : `Server #${key.server_index + 1}`;

    // Current expiry: if already expired/null, extend from NOW; otherwise from current expires_at
    const baseDate = key.expires_at && new Date(key.expires_at) > new Date()
      ? new Date(key.expires_at)
      : new Date();

    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);

    const newExpiryDisplay = newExpiry.toLocaleDateString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    // Update DB
    await db.execute(
      "UPDATE user_keys SET expires_at = ?, status = 'active' WHERE id = ?",
      [newExpiry, key.id]
    );

    // Notify user
    const userMessage =
      `✅ **Plan သက်တမ်းတိုးပြီးပါပြီ!**\n\n` +
      `🌐 Server: **${serverName}**\n` +
      `➕ Extended by: **${daysToAdd} days**\n` +
      `📅 New Expiry: **${newExpiryDisplay}**\n\n` +
      `ဆက်လက်အသုံးပြုနိုင်ပါပြီ။ Key တူသည်ဖြစ်သောကြောင့် ပြောင်းရန်မလိုပါ။`;

    await ctx.telegram.sendMessage(targetUserId, userMessage, {
      parse_mode: "Markdown",
    });

    // Confirm to admin
    ctx.reply(
      `✅ Extended user ${targetUserId}'s key on ${serverName} by ${daysToAdd} days.\n` +
      `📅 New expiry: ${newExpiryDisplay}`
    );
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

module.exports = handleExtend;
