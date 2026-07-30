const { SERVERS } = require("../config");
const db = require("../db");

// ==================================================================
// 🔑 RETRIEVE SAVED KEYS HANDLER
// Allows users to re-retrieve active keys if deleted/lost from chat.
// ==================================================================
async function handleGetKeys(ctx) {
  const userId = String(ctx.from.id).trim();

  try {
    const [rows] = await db.execute(
      `SELECT * FROM user_keys 
       WHERE telegram_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [userId]
    );

    if (rows.length === 0) {
      return ctx.reply(
        "❌ သင့်တွင် Active ဖြစ်နေသော VPN Key မရှိပါ။\n\n" +
        "ဝယ်ယူလိုပါက **'၀ယ်မည်'** Button ကို နှိပ်ပါ:"
      );
    }

    let msg = `🔑 **သင်၏ Active VPN Key (များ):**\n\n`;

    rows.forEach((row, index) => {
      const serverName = SERVERS[row.server_index]
        ? SERVERS[row.server_index].name
        : `Server #${row.server_index + 1}`;

      const expiryDisplay = row.expires_at
        ? new Date(row.expires_at).toLocaleDateString("en-GB", {
            day: "2-digit", month: "2-digit", year: "numeric",
          })
        : "No expiry";

      msg += `${index + 1}. 🌐 **${serverName}**\n`;
      msg += `📅 သက်တမ်းကုန်မည်: **${expiryDisplay}**\n`;
      msg += `\`${row.access_url}\`\n\n`;
    });

    msg += `👆 **Tap to Copy Key**\n\n` +
           `⚠️ Key ပျောက်သွားပါက ဤ Button မှ ပြန်လည်ရယူနိုင်ပါသည်။`;

    ctx.replyWithMarkdown(msg);
  } catch (e) {
    console.error("Error in handleGetKeys:", e);
    ctx.reply("⚠️ Key များ ရယူစဉ် အမှားအယွင်း ဖြစ်ပေါ်ခဲ့ပါသည်။");
  }
}

module.exports = handleGetKeys;

