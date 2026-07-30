const { GROUP_ID, SERVERS, PLAN_DAYS } = require("../config");
const { mainMenu } = require("../menus");
const db = require("../db");

// ==================================================================
// 📸 PAYMENT PHOTO HANDLER
// Checks if user has an active key (renewal) or is a new customer.
// Forwards receipt + appropriate admin command to the admin group.
// ==================================================================
async function handlePhoto(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.first_name || "User";
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  // Acknowledge to the user
  await ctx.reply(
    `✅ **Receipt ရပြီ!** စစ်ဆေးနေပါသည်...\n\n` +
    `Admin မှ မကြာမီ ဆောင်ရွက်ပေးမည်ဖြစ်သည်။ ခဏစောင့်ပါ 🙏`,
    { parse_mode: "Markdown", ...mainMenu }
  );

  // Check if user already has an active key
  let existingKeys = [];
  try {
    const [rows] = await db.execute(
      "SELECT * FROM user_keys WHERE telegram_id = ? AND status = 'active' ORDER BY created_at DESC",
      [String(userId)]
    );
    existingKeys = rows;
  } catch (e) {
    console.warn("⚠️ Could not query existing keys for user:", e.message);
  }

  const isRenewal = existingKeys.length > 0;
  const latestKey = existingKeys[0];

  // Build admin group caption
  let caption = `💰 **${isRenewal ? "🔄 RENEWAL" : "🆕 NEW"} Payment**\n`;
  caption += `From: **${username}** (ID: \`${userId}\`)\n`;

  if (isRenewal && latestKey) {
    const serverName = SERVERS[latestKey.server_index]
      ? SERVERS[latestKey.server_index].name
      : `Server #${latestKey.server_index + 1}`;
    const currentExpiry = latestKey.expires_at
      ? new Date(latestKey.expires_at).toLocaleDateString("en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      : "No expiry set";

    caption += `🌐 Server: **${serverName}**\n`;
    caption += `📅 Current Expiry: **${currentExpiry}**\n`;
    caption += `➕ Extend by: **${PLAN_DAYS} days**`;
  }

  // Forward receipt photo to admin group
  await ctx.telegram.sendPhoto(GROUP_ID, photo.file_id, {
    caption,
    parse_mode: "Markdown",
  });

  // Send pre-filled admin command
  if (isRenewal) {
    // Renewal: suggest /extend command
    await ctx.telegram.sendMessage(
      GROUP_ID,
      `📋 **Action needed:**\n\n` +
      `✅ Tap to extend plan:\n/extend ${userId}\n\n` +
      `Or extend by custom days:\n/extend ${userId} 30\n\n` +
      `🆕 Or create a new key instead:\n/generate ${userId} ${photo.file_id}`,
      { parse_mode: "Markdown" }
    );
  } else {
    // New user: suggest /generate command
    await ctx.telegram.sendMessage(
      GROUP_ID,
      `📋 **Action needed:**\n\n` +
      `✅ Tap to generate new key:\n/generate ${userId} ${photo.file_id}`,
      { parse_mode: "Markdown" }
    );
  }
}

module.exports = handlePhoto;

