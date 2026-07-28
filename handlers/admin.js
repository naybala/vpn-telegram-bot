const { ADMIN_ID, SERVERS, DEFAULT_LIMIT_GB } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");

// ==================================================================
// 👮 ADMIN: /generate COMMAND
// Creates an Outline key, stores it in MySQL, and sends it to user.
// Only ADMIN_ID can execute this command.
// ==================================================================
async function handleGenerate(ctx) {
  // Guard: admin-only
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.split(" ");
  const rawId = parts[1];
  const photoUrl = parts[2] || null;

  if (!rawId) return ctx.reply("❌ Usage: /generate <userId>");
  const targetUserId = String(rawId).trim();

  // 🎲 Random Load Balancing across servers
  const serverIndex = Math.floor(Math.random() * SERVERS.length);
  const selectedServer = SERVERS[serverIndex];

  await ctx.reply(`⏳ Generating on Server #${serverIndex + 1}...`);

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

    // 4. Save to MySQL
    const sql = `
      INSERT INTO user_keys
        (telegram_id, server_index, outline_api_url, generated_user_name, key_id, access_url, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.execute(sql, [
      targetUserId,
      serverIndex,
      selectedServer.apiUrl,
      uniqueName,
      key.id,
      finalAccessUrl,
      photoUrl,
    ]);

    // 5. Deliver Key to User
    const userMessage =
      `🚀 **Payment Accepted!**\n\n` +
      `Here is your **New ${DEFAULT_LIMIT_GB} GB Key**:\n` +
      `\`${finalAccessUrl}#VIP_${uniqueName}\`\n\n` +
      `👆 **Tap to Copy**`;

    await ctx.telegram.sendMessage(targetUserId, userMessage, {
      parse_mode: "Markdown",
    });

    ctx.reply(`✅ Success! Key generated and sent to user ${targetUserId}.`);
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

module.exports = handleGenerate;
