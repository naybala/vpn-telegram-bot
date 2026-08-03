const { Input, Markup } = require("telegraf");
const { bot } = require("../bot");
const {
  DEFAULT_LIMIT_GB,
  SERVERS,
  PAYMENT_METHODS,
  GROUP_ID,
  CREDIT_VALUE,
  USER_LIMIT,
} = require("../config");
const db = require("../db");
const { mainMenu } = require("../menus");
const handleBalance = require("../handlers/balance");
const handleGetKeys = require("../handlers/getKeys");
const { handlePhoto, forwardPaymentToAdmin, pendingPayments, userCreditState, askReferralCode } = require("../handlers/photo");
const { handleGenerate, executeGenerateKey } = require("../handlers/admin");
const { handleExtend, executeExtendKey } = require("../handlers/extend");
const { ensureUser, validateReferralCode, registerReferral, getReferralInfo } = require("../handlers/referral");

// ==================================================================
// 👋 START COMMAND
// ==================================================================
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || "User";
  const username = ctx.from.username ? `@${ctx.from.username}` : "No username";

  let serverListText = "";
  if (SERVERS.length > 0) {
    serverListText = SERVERS.map(
      (s) => `• **${s.name}**: ${s.price} (${DEFAULT_LIMIT_GB}GB)`,
    ).join("\n");
  }

  // 1. Reply to user
  ctx.replyWithMarkdown(
    `🙏 **Ye Gu Saung VPN မှကြိုဆိုပါတယ်!**\n\n` +
      `⚡ **လက်ရှိရရှိနိုင်သော Server များ:**\n${serverListText}\n\n` +
      `ဝယ်ယူလိုပါက အောက်ပါ **'၀ယ်မည်'** Button ကို နှိပ်ပြီး Server ရွေးချယ်နိုင်ပါသည်။`,
    mainMenu,
  );

  // 2. Announce to Admin Group
  if (GROUP_ID) {
    try {
      await ctx.telegram.sendMessage(
        GROUP_ID,
        `🔔 **New Activity Notification**\n\n` +
          `👤 User: **${firstName}** (${username})\n` +
          `🆔 User ID: \`${userId}\`\n\n` +
          `📢 **User is trying to buy our VPN!**`,
        { parse_mode: "Markdown" },
      );
    } catch (e) {
      console.warn("⚠️ Could not notify admin group on start:", e.message);
    }
  }
});

// ==================================================================
// 👂 BUTTON HANDLERS
// ==================================================================

// Helper: build payment method buttons for a given server
function paymentButtons(serverId) {
  return PAYMENT_METHODS.map((pm) => [
    Markup.button.callback(pm.label, `pay_${pm.key}_${serverId}`),
  ]);
}

// Helper: build payment details message
function paymentDetails(server, pm) {
  return (
    `💳 **${server.name} (${DEFAULT_LIMIT_GB}GB) — ${pm.label}**\n\n` +
    `💰 ဈေးနှုန်း: **${server.price}**\n\n` +
    `1. **${server.price}** ကို ${pm.label} မှတစ်ဆင့် ပေးပို့ပါ\n` +
    `\`${pm.phone}\` — ${pm.owner}\n` +
    `👆 **Tap to Copy**\n\n` +
    `2. ${pm.note}\n` +
    `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။`
  );
}

// Helper: get active user count for each server from DB
async function getServerUserCounts() {
  const counts = {};
  try {
    const [rows] = await db.execute(
      "SELECT server_index, COUNT(*) as count FROM user_keys WHERE status = 'active' GROUP BY server_index"
    );
    rows.forEach((r) => {
      counts[r.server_index] = r.count;
    });
  } catch (e) {
    console.warn("⚠️ Could not query server user counts:", e.message);
  }
  return counts;
}

// Buy — Step 1: Show server list
bot.hears("၀ယ်မည်", async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || "User";
  const username = ctx.from.username ? `@${ctx.from.username}` : "No username";

  // Notify Admin Group
  if (GROUP_ID) {
    try {
      await ctx.telegram.sendMessage(
        GROUP_ID,
        `🛒 **Buy Button Clicked**\n\n` +
          `👤 User: **${firstName}** (${username})\n` +
          `🆔 User ID: \`${userId}\`\n\n` +
          `📢 **User clicked "၀ယ်မည်" to view plans and buy VPN!**`,
        { parse_mode: "Markdown" },
      );
    } catch (e) {
      console.warn("⚠️ Could not notify admin group on '၀ယ်မည်':", e.message);
    }
  }

  if (SERVERS.length === 0) {
    return ctx.reply("❌ ရရှိနိုင်သော Server မရှိသေးပါ။");
  }

  const userCounts = await getServerUserCounts();

  // If only 1 server and 1 payment method, skip directly to payment details
  if (SERVERS.length === 1 && PAYMENT_METHODS.length === 1) {
    const s = SERVERS[0];
    if (USER_LIMIT > 0 && (userCounts[s.id] || 0) >= USER_LIMIT) {
      return ctx.reply(`❌ **${s.name}** Server မှာ လူပြည့်သွားပါပြီ (Limit: ${USER_LIMIT})! Admin ထံ ဆက်သွယ်ပါ။`, { parse_mode: "Markdown" });
    }
    return ctx.reply(paymentDetails(s, PAYMENT_METHODS[0]), {
      parse_mode: "Markdown",
    });
  }

  // If only 1 server but multiple payment methods, skip server step
  if (SERVERS.length === 1) {
    const s = SERVERS[0];
    if (USER_LIMIT > 0 && (userCounts[s.id] || 0) >= USER_LIMIT) {
      return ctx.reply(`❌ **${s.name}** Server မှာ လူပြည့်သွားပါပြီ (Limit: ${USER_LIMIT})! Admin ထံ ဆက်သွယ်ပါ။`, { parse_mode: "Markdown" });
    }
    const buttons = paymentButtons(s.id);
    return ctx.reply(
      `🌐 **${s.name}** — ${s.price} / ${DEFAULT_LIMIT_GB}GB\n\n` +
        `💳 **ငွေပေးချေနည်း ရွေးချယ်ပါ:**`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  // Multiple servers — show server selection
  const buttons = SERVERS.map((server) => {
    const activeCount = userCounts[server.id] || 0;
    const isFull = USER_LIMIT > 0 && activeCount >= USER_LIMIT;

    if (isFull) {
      return [
        Markup.button.callback(
          `🌐 ${server.name} — ${server.price} (Full)`,
          `server_full_${server.id}`,
        ),
      ];
    } else {
      return [
        Markup.button.callback(
          `🌐 ${server.name} — ${server.price}`,
          `select_server_${server.id}`,
        ),
      ];
    }
  });

  let msg = `🌐 **VPN Server နေရာ ရွေးချယ်ပါ**\n\n`;
  SERVERS.forEach((server, index) => {
    const activeCount = userCounts[server.id] || 0;
    const isFull = USER_LIMIT > 0 && activeCount >= USER_LIMIT;
    const statusText = isFull ? " *(Full)*" : "";
    msg += `${index + 1}. **${server.name}** — ${server.price} / ${DEFAULT_LIMIT_GB}GB${statusText}\n`;
  });
  msg += `\nမိမိ ဝယ်ယူလိုသော Server ကို Button မှ ရွေးချယ်ပါ:`;

  ctx.reply(msg, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Server Full Action Handler
bot.action(/^server_full_(\d+)$/, (ctx) => {
  const serverId = parseInt(ctx.match[1], 10);
  const server = SERVERS[serverId];
  const name = server ? server.name : "ဤ Server";
  return ctx.answerCbQuery(`❌ ${name} မှာ လူပြည့်သွားပါပြီ (Limit: ${USER_LIMIT})! အခြား Server ကို ရွေးပါ။`, { alert: true });
});

// Buy — Step 2: Server selected → show payment method selection
bot.action(/^select_server_(\d+)$/, async (ctx) => {
  const serverId = parseInt(ctx.match[1], 10);
  const server = SERVERS[serverId];
  if (!server) return ctx.answerCbQuery("❌ Invalid Server");

  if (USER_LIMIT > 0) {
    const userCounts = await getServerUserCounts();
    if ((userCounts[serverId] || 0) >= USER_LIMIT) {
      return ctx.answerCbQuery(`❌ ${server.name} မှာ လူပြည့်သွားပါပြီ (Limit: ${USER_LIMIT})! အခြား Server ကို ရွေးပါ။`, { alert: true });
    }
  }

  ctx.answerCbQuery();

  // If only 1 payment method, skip to payment details directly
  if (PAYMENT_METHODS.length === 1) {
    return ctx.reply(paymentDetails(server, PAYMENT_METHODS[0]), {
      parse_mode: "Markdown",
    });
  }

  // Multiple payment methods — show payment selection
  const buttons = paymentButtons(serverId);
  ctx.reply(
    `✅ **${server.name}** ကို ရွေးချယ်ပြီးပါပြီ\n\n` +
      `💳 **ငွေပေးချေနည်း ရွေးချယ်ပါ:**`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    },
  );
});

// Buy — Step 3: Payment method selected → show payment details & check credit
bot.action(/^pay_([a-z]+)_(\d+)$/, async (ctx) => {
  const pmKey = ctx.match[1];
  const serverId = parseInt(ctx.match[2], 10);

  const server = SERVERS[serverId];
  const pm = PAYMENT_METHODS.find((m) => m.key === pmKey);

  if (!server || !pm) return ctx.answerCbQuery("❌ Invalid selection");

  ctx.answerCbQuery();
  await ctx.reply(paymentDetails(server, pm), { parse_mode: "Markdown" });

  // Right after showing payment details, check if user has credits
  const userId = String(ctx.from.id);
  const refInfo = await getReferralInfo(userId).catch(() => null);
  const userCredits = refInfo?.credits || 0;

  if (userCredits > 0) {
    userCreditState.set(userId, {
      userCredits,
      creditsToUse: 0,
      serverPrice: server.price,
      step: "credit_choice",
    });

    await ctx.reply(
      `💰 **Credit ရှိပါသည်!**\n\n` +
        `သင့်တွင် **${userCredits} credit(s)** = **${userCredits * CREDIT_VALUE} Ks** ရှိပါသည်။\n\n` +
        `Credit ကို ဤဝယ်ယူမှုတွင် သုံးမည်လား?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ ဟုတ်ကဲ့ (Yes)", `credit_yes_${userId}`),
            Markup.button.callback("❌ မသုံးပါ (No)", `credit_no_${userId}`),
          ],
        ]),
      },
    );
  } else {
    await ctx.reply("📸 ငွေလွှဲပြီးပါက ပေးချေမှု Receipt (Screenshot) ပေးပို့ပေးပါ 🙏");
  }
});

// Contact
bot.hears("ဆက်သွယ်ရန်", (ctx) =>
  ctx.reply(`အက်ဒမင်ဆီသို့တိုက်ရိုက်ဆက်သွယ်ရန် ${adminAccount}`),
);

// Balance check
bot.hears("လက်ကျန်စစ်", handleBalance);
bot.command("mybalance", handleBalance);

const {
  handleUserDeleteRequest,
  handleUserDeleteConfirm,
  handleAdminDeleteKey,
} = require("../handlers/deleteKey");

// Get saved keys
bot.hears("🔑 မိမိ Key ယူရန်", handleGetKeys);

// Delete key
bot.hears("🗑️ Key ဖျက်မည်", handleUserDeleteRequest);
bot.action(/^confirm_delete_key_(\d+)$/, handleUserDeleteConfirm);
bot.action("cancel_delete_key", (ctx) => {
  ctx.answerCbQuery("Cancelled");
  ctx.editMessageText("❌ Key ဖျက်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။");
});

// How to use (instructions image)
bot.hears("လမ်းညွှန်ချက်များ", async (ctx) => {
  const fs = require("fs");

  // VPN Buy steps
  const buyImages = ["images/combine.jpeg"];

  const existingBuyImages = buyImages.filter((f) => fs.existsSync(f));

  if (existingBuyImages.length > 0) {
    await ctx.reply(`📖 **VPN ဝယ်နည်း**`, { parse_mode: "Markdown" });
    for (const imgPath of existingBuyImages) {
      try {
        await ctx.replyWithPhoto(Input.fromLocalFile(imgPath));
      } catch (e) {
        console.warn(`⚠️ Could not send image ${imgPath}:`, e.message);
      }
    }
  }

  // VPN usage instruction
  if (fs.existsSync("images/instruction.jpeg")) {
    await ctx.reply(`📖 **VPN အသုံးပြုနည်း**`, { parse_mode: "Markdown" });
    try {
      await ctx.replyWithPhoto(Input.fromLocalFile("images/instruction.jpeg"));
    } catch (e) {
      console.warn("⚠️ Could not send instruction image:", e.message);
    }
  }

  if (
    existingBuyImages.length === 0 &&
    !fs.existsSync("images/instruction.jpeg")
  ) {
    ctx.reply("⚠️ လမ်းညွှန်ပုံများ မတွေ့ပါ။ Admin ထံ ဆက်သွယ်ပါ။");
  }
});

// ==================================================================
// 📸 PHOTO HANDLER (payment receipt)
// ==================================================================
bot.on("photo", handlePhoto);

const handleReissue = require("../handlers/reissue");

// ==================================================================
// 👮 ADMIN COMMANDS & ACTIONS
// ==================================================================
bot.command("generate", handleGenerate); // /generate <userId> [photoId] [serverIdx]
bot.command("extend", handleExtend); // /extend <userId> [days]
bot.command("reissue", handleReissue); // /reissue <userId>
bot.command("deletekey", handleAdminDeleteKey); // /deletekey <userId>

// Admin Inline Action: Generate key
bot.action(/^adm_gen_(\d+)_(\d+)(?:_(\d+))?$/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const serverIndex = parseInt(ctx.match[2], 10);
  const creditsToUse = ctx.match[3] ? parseInt(ctx.match[3], 10) : 0;
  const adminName = ctx.from.first_name || "Admin";

  try {
    await ctx.answerCbQuery("⏳ Key ပြုလုပ်နေသည်...");
    const res = await executeGenerateKey({
      targetUserId,
      serverIndex,
      creditsToUse,
      telegram: ctx.telegram,
    });

    const originalText = ctx.callbackQuery.message.text || "";
    let approvedMsg =
      `${originalText}\n\n` +
      `✅ **Approved & Key Generated!**\n` +
      `👤 User: \`${targetUserId}\`\n` +
      `🌐 Server: **${res.serverName}** (Expires ${res.expiresDisplay})\n`;

    if (creditsToUse > 0) {
      approvedMsg += `🎁 Credits Deducted: **${creditsToUse}**\n`;
    }
    approvedMsg += `👮 Approved by: **${adminName}**`;

    await ctx.editMessageText(approvedMsg, { parse_mode: "Markdown" });
  } catch (e) {
    ctx.reply(`❌ Key generation error: ${e.message}`);
  }
});

// Admin Inline Action: Extend plan
bot.action(/^adm_ext_(\d+)(?:_(\d+))?(?:_(\d+))?$/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const keyDbId = ctx.match[2] ? parseInt(ctx.match[2], 10) : null;
  const creditsToUse = ctx.match[3] ? parseInt(ctx.match[3], 10) : 0;
  const adminName = ctx.from.first_name || "Admin";

  try {
    await ctx.answerCbQuery("⏳ သက်တမ်းတိုးနေသည်...");
    const res = await executeExtendKey({
      targetUserId,
      keyDbId,
      creditsToUse,
      telegram: ctx.telegram,
    });

    const originalText = ctx.callbackQuery.message.text || "";
    let approvedMsg =
      `${originalText}\n\n` +
      `✅ **Plan Extended!**\n` +
      `👤 User: \`${targetUserId}\` (+${res.daysToAdd} days)\n` +
      `🌐 Server: **${res.serverName}**\n` +
      `📅 New Expiry: **${res.newExpiryDisplay}**\n`;

    if (creditsToUse > 0) {
      approvedMsg += `🎁 Credits Deducted: **${creditsToUse}**\n`;
    }
    approvedMsg += `👮 Approved by: **${adminName}**`;

    await ctx.editMessageText(approvedMsg, { parse_mode: "Markdown" });
  } catch (e) {
    ctx.reply(`❌ Extension error: ${e.message}`);
  }
});

// ==================================================================
// 💰 CREDIT YES/NO INLINE CALLBACKS
// ==================================================================
bot.action(/^credit_yes_(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  await ctx.answerCbQuery();

  const state = userCreditState.get(userId);
  if (!state) return ctx.editMessageText("⏰ Session ကုန်သွားပါပြီ။ Payment Method ကို ပြန်လည်ရွေးချယ်ပါ။");

  userCreditState.set(userId, { ...state, step: "credit_amount" });

  await ctx.editMessageText(`✅ Credit သုံးရန် ရွေးချယ်ပြီးပါပြီ!`, { parse_mode: "Markdown" });

  return ctx.reply(
    `💰 **Credit အသုံးပြုမည်:**\n\n` +
      `သင့်တွင် **${state.userCredits} credit(s)** = **${state.userCredits * CREDIT_VALUE} Ks** ရှိသည်။\n\n` +
      `သုံးလိုသော Credit အရေအတွက် ထည့်ပါ (1 မှ ${state.userCredits} အထိ):`,
    { parse_mode: "Markdown" },
  );
});

bot.action(/^credit_no_(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];
  await ctx.answerCbQuery();

  const state = userCreditState.get(userId);
  if (state) {
    userCreditState.set(userId, { ...state, creditsToUse: 0, step: "done" });
  }

  await ctx.editMessageText(`❌ Credit မသုံးပါ`);
  return ctx.reply("📸 ငွေလွှဲပြီးပါက ပေးချေမှု Receipt (Screenshot) ပေးပို့ပေးပါ 🙏");
});

// Utility: run /chatid inside any group to get its real chat ID for GROUP_ID in .env
bot.command("chatid", (ctx) => {
  const id = ctx.chat.id;
  const type = ctx.chat.type;
  const title = ctx.chat.title || ctx.chat.first_name || "private";
  ctx.reply(`🆔 Chat ID: \`${id}\`\nType: ${type}\nName: ${title}`, {
    parse_mode: "Markdown",
  });
});

// ==================================================================
// 🤝 MULTI-STEP TEXT INPUT HANDLER
// Handles: credit_amount (before photo) & referral_code (after photo)
// ==================================================================
bot.on("text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();

  const userId = String(ctx.from.id);
  const firstName = ctx.from.first_name || null;
  const input = ctx.message.text.trim();

  // ── Step 1: Pre-photo Credit Amount input ─────────────────────
  if (userCreditState.has(userId)) {
    const state = userCreditState.get(userId);
    if (state.step === "credit_amount") {
      const amount = parseInt(input, 10);

      if (isNaN(amount) || amount < 1) {
        return ctx.reply(`❌ မှန်ကန်သော ဂဏန်းထည့်ပါ (1 မှ ${state.userCredits} အထိ):`);
      }

      if (amount > state.userCredits) {
        return ctx.reply(
          `❌ **Credit မလုံလောက်ပါ!**\n\n` +
            `သင့်တွင် **${state.userCredits} credit(s)** သာ ရှိသည်။\n` +
            `${state.userCredits} ထက် မပိုနိုင်ပါ။ ထပ်မံထည့်ပါ:`,
          { parse_mode: "Markdown" },
        );
      }

      userCreditState.set(userId, { ...state, creditsToUse: amount, step: "done" });

      const origPriceNum = parseInt((state.serverPrice || "7000").replace(/[^\d]/g, ""), 10) || 7000;
      const discountNum = amount * CREDIT_VALUE;
      const finalPriceNum = Math.max(0, origPriceNum - discountNum);

      const origStr = origPriceNum.toLocaleString();
      const discStr = discountNum.toLocaleString();
      const finalStr = finalPriceNum.toLocaleString();

      await ctx.reply(
        `✅ **${amount} credit(s)** (-${discStr} Ks) discount ကို မှတ်သားပြီးပါပြီ!\n\n` +
          `💰 မူလဈေးနှုန်း: **${origStr} Ks**\n` +
          `🎁 Credit Discount: **-${discStr} Ks**\n` +
          `💵 **ကျန်ရှိ ပေးချေရမည့်ပမာဏ: ${finalStr} Ks**\n\n` +
          `📸 **${finalStr} Ks** ငွေလွှဲပြီးပါက Receipt (Screenshot) ပေးပို့ပေးပါ 🙏`,
        { parse_mode: "Markdown" },
      );
      return;
    }
  }

  // ── Step 2: Post-photo Referral Code input ───────────────────
  if (pendingPayments.has(userId)) {
    const pending = pendingPayments.get(userId);

    if (pending.step === "referral_code") {
      const code = input.toUpperCase();

      if (code !== "SKIP") {
        const result = await validateReferralCode(code, userId);

        if (!result.valid) {
          const reason =
            result.reason === "own_code"
              ? "❌ သင်ကိုယ်တိုင်၏ Code ကို သုံး၍မရပါ။"
              : result.reason === "already_used"
              ? "❌ ဤ Code ကို ယခင်ကတည်းက သုံးပြီးဖြစ်သည်။"
              : "❌ Referral Code မမှန်ပါ။";

          return ctx.reply(`${reason}\n\nCode ထပ်မံထည့်ပါ သို့မဟုတ် SKIP ဟုရိုက်ပါ။`);
        }

        await registerReferral(result.referrerId, userId, code);
        await ctx.reply("✅ Referral Code မှတ်တမ်းတင်ပြီးပါပြီ! ကျေးဇူးတင်ပါသည်။");
      } else {
        await ctx.reply("👍 Skip ပြုလုပ်ပြီးပါပြီ။ ငွေပေးချေမှု စစ်ဆေးနေပါသည်...");
      }

      pendingPayments.delete(userId);
      await forwardPaymentToAdmin(ctx, { ...pending, userId });
      return;
    }

    pendingPayments.delete(userId);
    return;
  }

  // ── Default fallback for custom typed text ────────────────────
  await ensureUser(userId, firstName).catch(() => {});
  ctx.reply(
    "⚠️ **ကျေးဇူးပြု၍ အောက်ပါ Menu Button များကို သာ အသုံးပြုပေးပါ။**",
    mainMenu,
  );
});


