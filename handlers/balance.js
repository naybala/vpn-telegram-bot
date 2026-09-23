const db = require("../db");
const { getClient } = require("../bot");
const { SERVERS } = require("../config");

// ==================================================================
// 📊 BALANCE CHECK HANDLER
// ==================================================================
async function handleBalance(ctx) {
  const userId = String(ctx.from.id).trim();

  try {
    const [rows] = await db.execute(
      "SELECT * FROM user_keys WHERE telegram_id = ? AND status = 'active' ORDER BY created_at DESC",
      [userId]
    );

    if (rows.length === 0) return ctx.reply("❌ No active plan found.\n\nVPN Plan ဝယ်ယူရန် '၀ယ်မည်' ကိုနှိပ်ပါ။");

    let reportMessage = `📊 **Your Active Plans**\n\n`;

    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const serverIdx = entry.server_index;
      const serverName = SERVERS[serverIdx] ? SERVERS[serverIdx].name : `Server #${serverIdx + 1}`;
      const keyId = entry.key_id;

      const createdAt = new Date(entry.created_at).toLocaleDateString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      // Expiry info
      let expiryText = "♾️ No Expiry";
      let daysLeft = null;
      if (entry.expires_at) {
        const expiresAt = new Date(entry.expires_at);
        const now = new Date();
        daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        const expiresDisplay = expiresAt.toLocaleDateString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric",
        });
        if (daysLeft <= 0) {
          expiryText = `❌ Expired`;
        } else if (daysLeft <= 3) {
          expiryText = `⚠️ Expires **${expiresDisplay}** (${daysLeft} day(s) left!)`;
        } else {
          expiryText = `📅 Expires **${expiresDisplay}** (${daysLeft} days left)`;
        }
      }

      try {
        const client = getClient(serverIdx);
        const [keysRes, metricsRes] = await Promise.all([
          client.get("/access-keys"),
          client.get("/metrics/transfer"),
        ]);

        const keyData = keysRes.data.accessKeys.find((k) => String(k.id) === String(keyId));
        if (keyData) {
          const usedBytes = metricsRes.data.bytesTransferredByUserId[String(keyId)] || 0;
          const limitBytes = keyData.dataLimit ? keyData.dataLimit.bytes : 0;
          const usedGB = (usedBytes / 1000 ** 3).toFixed(2);
          const limitGB = (limitBytes / 1000 ** 3).toFixed(2);
          const leftGB = Math.max(0, (limitBytes - usedBytes) / 1000 ** 3).toFixed(2);

          let percent = 0;
          if (limitBytes > 0)
            percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
          const filled = Math.floor(percent / 10);
          const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

          reportMessage += `🔑 **Key #${i + 1}** — ${serverName}\n`;
          reportMessage += `📆 Created: **${createdAt}**\n`;
          reportMessage += `${expiryText}\n`;
          reportMessage += `💾 Used: **${usedGB} GB** / ${limitGB} GB — Left: **${leftGB} GB**\n`;
          reportMessage += `[${bar}] ${percent}%\n`;
          reportMessage += `──────────────────\n`;
        }
      } catch (e) {
        reportMessage += `🔑 **Key #${i + 1} (${serverName})**: ⚠️ Server Offline\n`;
        reportMessage += `${expiryText}\n`;
        reportMessage += `──────────────────\n`;
      }
    }

    ctx.replyWithMarkdown(reportMessage);
  } catch (e) {
    console.error(e);
    ctx.reply("⚠️ Database/Server Error.");
  }
}

module.exports = handleBalance;

