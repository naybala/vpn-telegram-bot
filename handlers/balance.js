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
      "SELECT * FROM user_keys WHERE telegram_id = ?",
      [userId]
    );

    if (rows.length === 0) return ctx.reply("❌ No active plan found.");

    let reportMessage = `📊 **Your Usage Report**\n\n`;
    let activeCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const serverIdx = entry.server_index;
      const serverName = SERVERS[serverIdx] ? SERVERS[serverIdx].name : `Server #${serverIdx + 1}`;
      const keyId = entry.key_id;
      const createdAt = new Date(entry.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      try {
        const client = getClient(serverIdx);
        const [keysRes, metricsRes] = await Promise.all([
          client.get("/access-keys"),
          client.get("/metrics/transfer"),
        ]);

        const keyData = keysRes.data.accessKeys.find((k) => k.id === keyId);
        if (keyData) {
          activeCount++;
          const usedBytes = metricsRes.data.bytesTransferredByUserId[keyId] || 0;
          const limitBytes = keyData.dataLimit ? keyData.dataLimit.bytes : 0;
          const limitGB = (limitBytes / 1024 ** 3).toFixed(2);
          const leftGB = ((limitBytes - usedBytes) / 1024 ** 3).toFixed(2);

          let percent = 0;
          if (limitBytes > 0)
            percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
          const filled = Math.floor(percent / 10);
          const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

          reportMessage += `🔑 **Key #${i + 1} (${serverName})**\n`;
          reportMessage += `Created: **${createdAt}**\n`;
          reportMessage += `✅ Left: **${leftGB} GB** / ${limitGB} GB\n`;
          reportMessage += `[${bar}] ${percent}%\n------------------\n`;
        }
      } catch (e) {
        reportMessage += `🔑 **Key #${i + 1} (${serverName})**: ⚠️ Offline\n`;
      }
    }


    ctx.replyWithMarkdown(reportMessage);
  } catch (e) {
    console.error(e);
    ctx.reply("⚠️ Database/Server Error.");
  }
}

module.exports = handleBalance;
