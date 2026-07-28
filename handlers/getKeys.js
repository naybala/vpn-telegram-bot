const db = require("../db");

// ==================================================================
// 🔑 RETRIEVE SAVED KEYS HANDLER
// ==================================================================
async function handleGetKeys(ctx) {
  const userId = String(ctx.from.id).trim();

  try {
    const [rows] = await db.execute(
      "SELECT access_url FROM user_keys WHERE telegram_id = ?",
      [userId]
    );

    if (rows.length === 0) return ctx.reply("❌ You don't have any keys.");

    let msg = `🔑 **Your Saved Keys:**\n\n`;
    rows.forEach((row, index) => {
      msg += `**Key ${index + 1}:**\n\`${row.access_url}\`\n\n`;
    });
    msg += `👆 **Tap to Copy**`;

    ctx.replyWithMarkdown(msg);
  } catch (e) {
    console.error(e);
    ctx.reply("⚠️ Database Error.");
  }
}

module.exports = handleGetKeys;
