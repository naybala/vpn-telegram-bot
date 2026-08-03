const { ADMIN_ID, SERVERS, DEFAULT_LIMIT_GB, PLAN_DAYS } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");
const { awardCredit } = require("./referral");

// ==================================================================
// 🔑 CORE KEY GENERATION LOGIC
// ==================================================================
async function executeGenerateKey({ targetUserId, photoUrl = null, serverIndex = 0, telegram }) {
  const selectedServer = SERVERS[serverIndex];
  if (!selectedServer) throw new Error(`Invalid server index: ${serverIndex}`);

  // Compute expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PLAN_DAYS);
  const expiresDisplay = expiresAt.toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const client = getClient(serverIndex);

  // 1. Create Key
  const createRes = await client.post("/access-keys");
  const key = createRes.data;

  // 2. Rename & Set Data Limit
  const uniqueName = `User_${targetUserId}_${Date.now().toString().slice(-4)}`;
  await client.put(`/access-keys/${key.id}/name`, { name: uniqueName });
  await client.put(`/access-keys/${key.id}/data-limit`, {
    limit: { bytes: DEFAULT_LIMIT_GB * 1000 ** 3 },
  });

  // 3. DNS Swap (replace raw IP with custom hostname if configured)
  let finalAccessUrl = key.accessUrl;
  if (selectedServer.dns) {
    finalAccessUrl = finalAccessUrl.replace(
      /@(\d{1,3}\.){3}\d{1,3}/,
      "@" + selectedServer.dns
    );
  }

  // 4. Save to MySQL (with expires_at)
  const sql = `
    INSERT INTO user_keys
      (telegram_id, server_index, outline_api_url, generated_user_name, key_id, access_url, photo_url, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db.execute(sql, [
    targetUserId,
    serverIndex,
    selectedServer.apiUrl,
    uniqueName,
    key.id,
    finalAccessUrl,
    photoUrl,
    expiresAt,
  ]);

  // 5. Deliver Key to User
  const userMessage =
    `🚀 **Payment Accepted!**\n\n` +
    `🌐 Server: **${selectedServer.name}**\n` +
    `📦 Plan: **${DEFAULT_LIMIT_GB} GB / ${PLAN_DAYS} Days**\n` +
    `📅 Expires: **${expiresDisplay}**\n\n` +
    `Here is your VPN Key:\n` +
    `\`${finalAccessUrl}#VIP_${uniqueName}\`\n\n` +
    `👆 **Tap to Copy**\n\n` +
    `⚠️ Key ကို သိမ်းဆည်းထားပြီး မျှဝေခြင်းမပြုပါနှင့်။`;

  await telegram.sendMessage(targetUserId, userMessage, {
    parse_mode: "Markdown",
  });

  // 6. Award referral credit if this user was referred
  try {
    const [refRows] = await db.execute(
      "SELECT * FROM referrals WHERE referred_id = ? AND credited = 0",
      [String(targetUserId)]
    );
    if (refRows.length > 0) {
      await awardCredit(refRows[0].referrer_id, telegram);
    }
  } catch (e) {
    console.warn("⚠️ [Referral] Could not award credit:", e.message);
  }

  return { serverName: selectedServer.name, expiresDisplay, uniqueName };
}

// ==================================================================
// 👮 ADMIN: /generate COMMAND
// Usage: /generate <userId> [photoId] [serverIndex(1-based)]
// ==================================================================
async function handleGenerate(ctx) {
  // Guard: admin-only
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  const rawId = parts[1];
  const photoUrl = parts[2] && parts[2] !== "1" && parts[2] !== "2" ? parts[2] : null;

  if (!rawId) {
    return ctx.reply(
      `❌ **Usage:**\n\`\`\`\n/generate <userId> [photoId] [serverIndex]\n\`\`\`\n` +
      `Example:\n\`\`\`\n/generate 7570112968\n\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetUserId = String(rawId).trim();

  // Determine server index
  let serverIndex = 0;
  const lastPart = parts[parts.length - 1];
  if (!isNaN(lastPart)) {
    const p = parseInt(lastPart, 10);
    if (p > 0 && p <= SERVERS.length) serverIndex = p - 1;
  }

  await ctx.reply(`⏳ Generating key on **${SERVERS[serverIndex]?.name || "Server"}**...`, { parse_mode: "Markdown" });

  try {
    const res = await executeGenerateKey({
      targetUserId,
      photoUrl,
      serverIndex,
      telegram: ctx.telegram,
    });

    ctx.reply(`✅ Success! Key (expires ${res.expiresDisplay}) generated on **${res.serverName}** and sent to user \`${targetUserId}\`.`, { parse_mode: "Markdown" });
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

module.exports = { handleGenerate, executeGenerateKey };

