const { Markup } = require("telegraf");
const { GROUP_ID, SERVERS, PLAN_DAYS } = require("../config");
const { mainMenu } = require("../menus");
const db = require("../db");

// ==================================================================
// 📸 PAYMENT PHOTO HANDLER
// Checks if user has an active key (renewal) or is a new customer.
// Forwards receipt + interactive approval buttons to admin group.
// ==================================================================
async function handlePhoto(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.first_name || "User";
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  // Acknowledge to the user immediately (always, even if admin forwarding fails)
  try {
    await ctx.reply(
      `✅ **Receipt ရပြီ!** စစ်ဆေးနေပါသည်...\n\n` +
      `Admin မှ မကြာမီ ဆောင်ရွက်ပေးမည်ဖြစ်သည်။ ခဏစောင့်ပါ 🙏`,
      { parse_mode: "Markdown", ...mainMenu }
    );
  } catch (e) {
    console.warn("⚠️ Could not reply to user:", e.message);
  }

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

    caption += `🌐 Current Server: **${serverName}**\n`;
    caption += `📅 Current Expiry: **${currentExpiry}**\n`;
    caption += `➕ Extension Plan: **+${PLAN_DAYS} days**`;
  }

  // Forward receipt photo + admin action buttons to admin group
  try {
    await ctx.telegram.sendPhoto(GROUP_ID, photo.file_id, {
      caption,
      parse_mode: "Markdown",
    });

    // Build interactive inline action buttons
    const inlineButtons = [];

    if (isRenewal) {
      inlineButtons.push([
        Markup.button.callback(`🔄 Thantang Toke (+${PLAN_DAYS} Days)`, `adm_ext_${userId}`)
      ]);
    }

    SERVERS.forEach((server, idx) => {
      inlineButtons.push([
        Markup.button.callback(`⚡ Key App: ${server.name}`, `adm_gen_${userId}_${idx}`)
      ]);
    });

    let actionText = `📋 **Action Needed for User \`${userId}\`**\n\n`;
    actionText += `Click button below to approve instantly:\n\n`;
    actionText += `Manual command (tap to copy):\n`;
    if (isRenewal) {
      actionText += `\`\`\`\n/extend ${userId}\n\`\`\``;
    } else {
      actionText += `\`\`\`\n/generate ${userId} 1\n\`\`\``;
    }

    await ctx.telegram.sendMessage(GROUP_ID, actionText, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(inlineButtons),
    });
  } catch (e) {
    console.error(`❌ Could not forward to admin group (GROUP_ID=${GROUP_ID}): ${e.message}`);
    console.error(`   → If the group was upgraded to a supergroup, update GROUP_ID in .env`);
  }
}

module.exports = handlePhoto;


module.exports = handlePhoto;

