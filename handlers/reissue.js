const { ADMIN_ID, SERVERS, DEFAULT_LIMIT_GB } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");

// ==================================================================
// 🔄 ADMIN: /reissue COMMAND
// Re-creates/resets a user's key if it was deleted, leaked, or corrupted,
// while preserving their active subscription expiry date.
// Usage: /reissue <userId>
// ==================================================================
async function handleReissue(ctx) {
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  const rawId = parts[1];

  if (!rawId) {
    return ctx.reply(
      `❌ **Usage:**\n\`\`\`\n/reissue <userId>\n\`\`\`\n` +
      `Example:\n\`\`\`\n/reissue 7570112968\n\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetUserId = String(rawId).trim();

  try {
    // 1. Fetch user's active key record
    const [rows] = await db.execute(
      `SELECT * FROM user_keys 
       WHERE telegram_id = ? AND status = 'active' 
       ORDER BY created_at DESC LIMIT 1`,
      [targetUserId]
    );

    if (rows.length === 0) {
      return ctx.reply(`❌ No active key found for user \`${targetUserId}\`.`, { parse_mode: "Markdown" });
    }

    const oldRecord = rows[0];
    const serverIndex = oldRecord.server_index;
    const selectedServer = SERVERS[serverIndex];

    if (!selectedServer) {
      return ctx.reply(`❌ Invalid server configuration for index ${serverIndex}.`);
    }

    await ctx.reply(`⏳ Re-issuing key for user \`${targetUserId}\` on **${selectedServer.name}**...`, { parse_mode: "Markdown" });

    const client = getClient(serverIndex);

    // 2. Try deleting old key from Outline Manager API if it exists
    if (oldRecord.key_id) {
      try {
        await client.delete(`/access-keys/${oldRecord.key_id}`);
      } catch (err) {
        console.warn(`⚠️ Could not delete old key ID ${oldRecord.key_id} from Outline:`, err.message);
      }
    }

    // 3. Create fresh key on Outline Server
    const createRes = await client.post("/access-keys");
    const newKey = createRes.data;

    const uniqueName = `User_${targetUserId}_${Date.now().toString().slice(-4)}`;
    await client.put(`/access-keys/${newKey.id}/name`, { name: uniqueName });
    await client.put(`/access-keys/${newKey.id}/data-limit`, {
      limit: { bytes: DEFAULT_LIMIT_GB * 1024 ** 3 },
    });

    // 4. DNS Hostname Swap
    let finalAccessUrl = newKey.accessUrl;
    if (selectedServer.dns) {
      finalAccessUrl = finalAccessUrl.replace(
        /@(\d{1,3}\.){3}\d{1,3}/,
        "@" + selectedServer.dns
      );
    }

    // 5. Update record in MySQL DB (preserve expires_at)
    await db.execute(
      `UPDATE user_keys 
       SET key_id = ?, access_url = ?, generated_user_name = ?, outline_api_url = ?
       WHERE id = ?`,
      [newKey.id, finalAccessUrl, uniqueName, selectedServer.apiUrl, oldRecord.id]
    );

    const expiresDisplay = oldRecord.expires_at
      ? new Date(oldRecord.expires_at).toLocaleDateString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      : "No expiry";

    // 6. Deliver New Key to User
    const userMessage =
      `🔄 **Your VPN Key Has Been Re-issued!**\n\n` +
      `🌐 Server: **${selectedServer.name}**\n` +
      `📅 Expiry Date: **${expiresDisplay}** (Unchanged)\n\n` +
      `New Key:\n` +
      `\`${finalAccessUrl}#VIP_${uniqueName}\`\n\n` +
      `👆 **Tap to Copy**\n\n` +
      `⚠️ Key ဟောင်းကို အစားထိုး အသုံးပြုပါ။`;

    await ctx.telegram.sendMessage(targetUserId, userMessage, {
      parse_mode: "Markdown",
    });

    ctx.reply(`✅ Successfully re-issued key for user \`${targetUserId}\` on **${selectedServer.name}**!`, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Error in handleReissue:", e);
    ctx.reply(`❌ Re-issue failed: ${e.message}`);
  }
}

module.exports = handleReissue;
