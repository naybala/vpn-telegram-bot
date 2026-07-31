const { ADMIN_ID, PLAN_DAYS, SERVERS } = require("../config");
const db = require("../db");

// ==================================================================
// 🔄 CORE EXTEND LOGIC
// ==================================================================
async function executeExtendKey({ targetUserId, keyDbId = null, daysToAdd = PLAN_DAYS, telegram }) {
  let rows = [];
  if (keyDbId) {
    [rows] = await db.execute(
      `SELECT * FROM user_keys WHERE id = ? AND telegram_id = ?`,
      [keyDbId, targetUserId]
    );
  } else {
    [rows] = await db.execute(
      `SELECT * FROM user_keys
       WHERE telegram_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [targetUserId]
    );
  }

  if (rows.length === 0) {
    throw new Error(`User ${targetUserId} has no matching key to extend.`);
  }

  const key = rows[0];
  const serverName = SERVERS[key.server_index]
    ? SERVERS[key.server_index].name
    : `Server #${key.server_index + 1}`;

  const baseDate = key.expires_at && new Date(key.expires_at) > new Date()
    ? new Date(key.expires_at)
    : new Date();

  const newExpiry = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + daysToAdd);

  const newExpiryDisplay = newExpiry.toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  await db.execute(
    "UPDATE user_keys SET expires_at = ?, status = 'active' WHERE id = ?",
    [newExpiry, key.id]
  );

  const userMessage =
    `✅ **Plan သက်တမ်းတိုးပြီးပါပြီ!**\n\n` +
    `🌐 Server: **${serverName}**\n` +
    `➕ Extended by: **${daysToAdd} days**\n` +
    `📅 New Expiry: **${newExpiryDisplay}**\n\n` +
    `ဆက်လက်အသုံးပြုနိုင်ပါပြီ။ Key တူသည်ဖြစ်သောကြောင့် ပြောင်းရန်မလိုပါ။`;

  await telegram.sendMessage(targetUserId, userMessage, {
    parse_mode: "Markdown",
  });

  return { serverName, newExpiryDisplay, daysToAdd };
}

// ==================================================================
// 👮 ADMIN: /extend COMMAND
// Usage: /extend <userId> [days]
// ==================================================================
async function handleExtend(ctx) {
  // Guard: admin-only
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  const rawId = parts[1];
  const customDays = parts[2] ? parseInt(parts[2], 10) : null;

  if (!rawId) {
    return ctx.reply(
      `❌ **Usage:**\n\`\`\`\n/extend <userId> [days]\n\`\`\`\n` +
      `Example:\n\`\`\`\n/extend 7570112968 30\n\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetUserId = String(rawId).trim();
  const daysToAdd = customDays && customDays > 0 ? customDays : PLAN_DAYS;

  try {
    const res = await executeExtendKey({
      targetUserId,
      daysToAdd,
      telegram: ctx.telegram,
    });

    ctx.reply(
      `✅ Extended user \`${targetUserId}\`'s key on **${res.serverName}** by **${res.daysToAdd} days**.\n` +
      `📅 New expiry: **${res.newExpiryDisplay}**`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

module.exports = { handleExtend, executeExtendKey };

