const { ADMIN_ID, SERVERS, DEFAULT_LIMIT_GB, PLAN_DAYS } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");

// ==================================================================
// 👮 ADMIN: /generate COMMAND
// Creates an Outline key, stores it in MySQL, and sends it to user.
// Only ADMIN_ID can execute this command.
// Usage: /generate <userId> [photo_file_id] [serverIndex(1-based)]
// ==================================================================
async function handleGenerate(ctx) {
  // Guard: admin-only
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.split(" ");
  const rawId = parts[1];
  const photoUrl = parts[2] || null;

  if (!rawId) return ctx.reply("❌ Usage: /generate <userId> [photoId] [serverIndex]");
  const targetUserId = String(rawId).trim();

  // Server selection: read 4th parameter (1-based) if provided, otherwise random
  let serverIndex = Math.floor(Math.random() * SERVERS.length);
  if (parts[3] !== undefined && !isNaN(parts[3])) {
    const parsedIdx = parseInt(parts[3], 10);
    if (parsedIdx > 0 && parsedIdx <= SERVERS.length) {
      serverIndex = parsedIdx - 1; // convert 1-based to 0-based
    } else if (parsedIdx >= 0 && parsedIdx < SERVERS.length) {
      serverIndex = parsedIdx;
    }
  }

  const selectedServer = SERVERS[serverIndex];

  // Compute expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PLAN_DAYS);
  const expiresDisplay = expiresAt.toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  await ctx.reply(`⏳ Generating key on **${selectedServer.name}**...`, { parse_mode: "Markdown" });

  try {
    const client = getClient(serverIndex);

    // 1. Create Key
    const createRes = await client.post("/access-keys");
    const key = createRes.data;

    // 2. Rename & Set Data Limit
    const uniqueName = `User_${targetUserId}_${Date.now().toString().slice(-4)}`;
    await client.put(`/access-keys/${key.id}/name`, { name: uniqueName });
    await client.put(`/access-keys/${key.id}/data-limit`, {
      limit: { bytes: DEFAULT_LIMIT_GB * 1024 ** 3 },
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

    await ctx.telegram.sendMessage(targetUserId, userMessage, {
      parse_mode: "Markdown",
    });

    ctx.reply(`✅ Success! Key (expires ${expiresDisplay}) generated on ${selectedServer.name} and sent to user ${targetUserId}.`);
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

module.exports = handleGenerate;
