const { Markup } = require("telegraf");
const { GROUP_ID, SERVERS, PLAN_DAYS, CREDIT_VALUE } = require("../config");
const { mainMenu } = require("../menus");
const db = require("../db");
const { ensureUser, isFirstTimeBuyer } = require("./referral");

// ==================================================================
// 🗂️ STATE STORES
// userCreditState → tracks pre-screenshot credit selection per user:
//   userId → { userCredits, creditsToUse, step: 'credit_choice' | 'credit_amount' | 'done' }
//
// pendingPayments → tracks post-screenshot referral code input per user:
//   userId → { photoFileId, isRenewal, existingKeys, username, creditsToUse, step: 'referral_code' }
// ==================================================================
const userCreditState = new Map();
const pendingPayments = new Map();

// ==================================================================
// 📸 PAYMENT PHOTO HANDLER
// ==================================================================
async function handlePhoto(ctx) {
  const userId = String(ctx.from.id);
  const username = ctx.from.first_name || "User";
  const firstName = ctx.from.first_name || null;
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  // Retrieve pre-selected creditsToUse if user chose any during payment method step
  const userCred = userCreditState.get(userId);
  const creditsToUse = userCred?.creditsToUse || 0;
  userCreditState.delete(userId); // consume state

  // Ensure user row exists (auto-handles existing 50+ users)
  await ensureUser(userId, firstName).catch(() => {});

  // Acknowledge receipt immediately
  try {
    await ctx.reply(
      `✅ **Receipt ရပြီ!** စစ်ဆေးနေပါသည်...\n\n` +
      `Admin မှ မကြာမီ ဆောင်ရွက်ပေးမည်ဖြစ်သည်။ ခဏစောင့်ပါ 🙏`,
      { parse_mode: "Markdown", ...mainMenu }
    );
  } catch (e) {
    console.warn("⚠️ Could not reply to user:", e.message);
  }

  // Check existing keys
  let existingKeys = [];
  try {
    const [rows] = await db.execute(
      "SELECT * FROM user_keys WHERE telegram_id = ? AND status = 'active' ORDER BY created_at DESC",
      [userId]
    );
    existingKeys = rows;
  } catch (e) {
    console.warn("⚠️ Could not query existing keys for user:", e.message);
  }

  const isRenewal = existingKeys.length > 0;
  const isFirstTime = !isRenewal
    ? await isFirstTimeBuyer(userId).catch(() => false)
    : false;

  // Build base payload for admin notification
  const payload = {
    photoFileId: photo.file_id,
    isRenewal,
    existingKeys,
    username,
    userId,
    creditsToUse,
  };

  // ── First-time buyer: ask for referral code before forwarding ──
  if (isFirstTime) {
    pendingPayments.set(userId, { ...payload, step: "referral_code" });
    return askReferralCode(ctx);
  }

  // ── Renewal or returning user: forward directly ─────────────────
  await forwardPaymentToAdmin(ctx, payload);
}

// ==================================================================
// 🤝 ASK FOR REFERRAL CODE
// ==================================================================
function askReferralCode(ctx) {
  return ctx.reply(
    `🤝 **Referral Code ရှိပါသလား?**\n\n` +
    `မိတ်ဆွေ၏ Referral Code ရှိပါက ရိုက်ထည့်ပါ။\n` +
    `မရှိပါက SKIP ဟုရိုက်ပါ။\n\n` +
    `Example: \`USR\\_XXXXXX\``,
    { parse_mode: "Markdown" }
  );
}

// ==================================================================
// 📤 FORWARD PAYMENT TO ADMIN GROUP
// ==================================================================
async function forwardPaymentToAdmin(ctx, { photoFileId, isRenewal, existingKeys, username, userId, creditsToUse = 0 }) {
  const latestKey = existingKeys[0];

  let caption = `💰 **${isRenewal ? "🔄 RENEWAL" : "🆕 NEW"} Payment**\n`;
  caption += `From: **${username}** (ID: \`${userId}\`)\n`;

  if (creditsToUse > 0) {
    caption += `🎁 Credits Used: **${creditsToUse}** (= **${creditsToUse * CREDIT_VALUE} Ks** discount)\n`;
  }

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

  try {
    await ctx.telegram.sendPhoto(GROUP_ID, photoFileId, {
      caption,
      parse_mode: "Markdown",
    });

    const inlineButtons = [];

    if (isRenewal) {
      // ── Section 1: Extend existing key(s) ──────────────────────────
      existingKeys.forEach((k) => {
        const sName = SERVERS[k.server_index]
          ? SERVERS[k.server_index].name
          : `Server #${k.server_index + 1}`;
        const cbData = creditsToUse > 0
          ? `adm_ext_${userId}_${k.id}_${creditsToUse}`
          : `adm_ext_${userId}_${k.id}`;
        inlineButtons.push([
          Markup.button.callback(`🔄 EXTEND existing key: ${sName} (+${PLAN_DAYS} Days +100GB)`, cbData)
        ]);
      });
    }

    // ── Section 2: Generate a brand-new key on any server ──────────
    SERVERS.forEach((server, idx) => {
      const cbData = creditsToUse > 0
        ? `adm_gen_${userId}_${idx}_${creditsToUse}`
        : `adm_gen_${userId}_${idx}`;
      inlineButtons.push([
        Markup.button.callback(`⚡ NEW KEY: ${server.name}`, cbData)
      ]);
    });

    let actionText = `📋 **Action Needed for User \`${userId}\`**\n\n`;
    if (isRenewal) {
      actionText += `⚠️ This user already has ${existingKeys.length} active key(s).\n\n`;
      actionText += `Choose carefully:\n`;
      actionText += `• **🔄 EXTEND** → keeps same key, adds +${PLAN_DAYS} days +100GB\n`;
      actionText += `• **⚡ NEW KEY** → creates a brand-new key (new row in DB)\n\n`;
    }
    if (creditsToUse > 0) {
      actionText += `🎁 Credit Discount: **${creditsToUse} credits = ${creditsToUse * CREDIT_VALUE} Ks off**\n\n`;
    }
    actionText += `Manual commands (tap to copy):\n`;
    if (isRenewal) {
      actionText += `\`\`\`\n/extend ${userId}\n\`\`\``;
    }
    actionText += `\`\`\`\n/generate ${userId} 1\n\`\`\``;

    await ctx.telegram.sendMessage(GROUP_ID, actionText, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(inlineButtons),
    });
  } catch (e) {
    console.error(`❌ Could not forward to admin group (GROUP_ID=${GROUP_ID}): ${e.message}`);
  }
}

module.exports = {
  handlePhoto,
  forwardPaymentToAdmin,
  pendingPayments,
  userCreditState,
  askReferralCode,
};
