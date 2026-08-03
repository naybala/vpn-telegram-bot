const { Markup } = require("telegraf");
const { GROUP_ID, SERVERS, PLAN_DAYS, CREDIT_VALUE } = require("../config");
const { mainMenu } = require("../menus");
const db = require("../db");
const { ensureUser, isFirstTimeBuyer, getReferralInfo } = require("./referral");

// ==================================================================
// 🗂️ PENDING PAYMENTS STATE MACHINE
//
// step values:
//   'credit_choice'   → waiting for Yes/No inline button on credit usage
//   'credit_amount'   → waiting for user to type how many credits to use
//   'referral_code'   → waiting for user to type referral code or SKIP
//
// pendingPayments.set(userId, {
//   photoFileId, isRenewal, existingKeys, username,
//   step, creditsToUse, userCredits, isFirstTime
// })
// ==================================================================
const pendingPayments = new Map();

// ==================================================================
// 📸 PAYMENT PHOTO HANDLER
// ==================================================================
async function handlePhoto(ctx) {
  const userId = String(ctx.from.id);
  const username = ctx.from.first_name || "User";
  const firstName = ctx.from.first_name || null;
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

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

  // Check if user has any credits
  const refInfo = await getReferralInfo(userId).catch(() => null);
  const userCredits = refInfo?.credits || 0;

  // Build base state object
  const baseState = {
    photoFileId: photo.file_id,
    isRenewal,
    existingKeys,
    username,
    creditsToUse: 0,
    userCredits,
    isFirstTime,
  };

  // ── Step A: Ask about credit usage if user has credits ──────────
  if (userCredits > 0) {
    pendingPayments.set(userId, { ...baseState, step: "credit_choice" });

    return ctx.reply(
      `💰 **Credit ရှိပါသည်!**\n\n` +
      `သင့်တွင် **${userCredits} credit(s)** = **${userCredits * CREDIT_VALUE} Ks** ရှိပါသည်။\n\n` +
      `Credit ကို ဤဝယ်မှုတွင် သုံးမည်လား?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ ဟုတ်ကဲ့ (Yes)", `credit_yes_${userId}`),
            Markup.button.callback("❌ မသုံးပါ (No)", `credit_no_${userId}`),
          ],
        ]),
      }
    );
  }

  // ── No credits: go straight to referral or forward ───────────────
  if (isFirstTime) {
    pendingPayments.set(userId, { ...baseState, step: "referral_code" });
    return askReferralCode(ctx);
  }

  await forwardPaymentToAdmin(ctx, { ...baseState, userId });
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
      existingKeys.forEach((k) => {
        const sName = SERVERS[k.server_index]
          ? SERVERS[k.server_index].name
          : `Server #${k.server_index + 1}`;
        inlineButtons.push([
          Markup.button.callback(`🔄 Extend: ${sName} (+${PLAN_DAYS} Days)`, `adm_ext_${userId}_${k.id}`)
        ]);
      });
    }

    SERVERS.forEach((server, idx) => {
      inlineButtons.push([
        Markup.button.callback(`⚡ New Key: ${server.name}`, `adm_gen_${userId}_${idx}`)
      ]);
    });

    let actionText = `📋 **Action Needed for User \`${userId}\`**\n\n`;
    if (creditsToUse > 0) {
      actionText += `🎁 Credit Discount: **${creditsToUse} credits = ${creditsToUse * CREDIT_VALUE} Ks off**\n\n`;
    }
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
  }
}

module.exports = { handlePhoto, forwardPaymentToAdmin, pendingPayments, askReferralCode };
