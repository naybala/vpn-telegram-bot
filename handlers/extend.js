const { ADMIN_ID, PLAN_DAYS, SERVERS, DEFAULT_LIMIT_GB } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");
const { deductCredits } = require("./referral");

// ==================================================================
// 🔄 CORE EXTEND LOGIC
// ==================================================================
async function executeExtendKey({ targetUserId, keyDbId = null, daysToAdd = PLAN_DAYS, creditsToUse = 0, telegram }) {
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
  const serverIndex = key.server_index;
  const serverName = SERVERS[serverIndex]
    ? SERVERS[serverIndex].name
    : `Server #${serverIndex + 1}`;

  // ── Update Outline API Data Limit (+100GB / DEFAULT_LIMIT_GB) ──────
  const addedBytes = DEFAULT_LIMIT_GB * 1000 ** 3;
  let newLimitGb = DEFAULT_LIMIT_GB * 2;

  try {
    const client = getClient(serverIndex);
    const keysRes = await client.get("/access-keys");
    const accessKeys = keysRes.data.accessKeys || keysRes.data || [];
    const outlineKey = accessKeys.find((k) => String(k.id) === String(key.key_id));

    const currentBytes = outlineKey?.dataLimit?.bytes || DEFAULT_LIMIT_GB * 1000 ** 3;
    const newBytes = currentBytes + addedBytes;
    newLimitGb = Math.round(newBytes / (1000 ** 3));

    await client.put(`/access-keys/${key.key_id}/data-limit`, {
      limit: { bytes: newBytes },
    });
  } catch (e) {
    console.warn(`⚠️ Could not update data limit on Outline server: ${e.message}`);
  }

  // ── Update Expiry Date ───────────────────────────────────────────
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
    `➕ Extended by: **+${DEFAULT_LIMIT_GB} GB / +${daysToAdd} days**\n` +
    `📊 Total Data Limit: **${newLimitGb} GB**\n` +
    `📅 New Expiry: **${newExpiryDisplay}**\n\n` +
    `ဆက်လက်အသုံးပြုနိုင်ပါပြီ။ Key တူသည်ဖြစ်သောကြောင့် ပြောင်းရန်မလိုပါ။`;

  await telegram.sendMessage(targetUserId, userMessage, {
    parse_mode: "Markdown",
  });

  // Deduct used credits if any
  if (creditsToUse > 0) {
    await deductCredits(targetUserId, creditsToUse).catch((e) =>
      console.warn("⚠️ [Referral] Could not deduct credits:", e.message)
    );
  }

  return { serverName, newExpiryDisplay, daysToAdd, newLimitGb };
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

