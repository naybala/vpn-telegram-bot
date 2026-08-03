const { Input, Markup } = require("telegraf");
const { bot } = require("../bot");
const {
  DEFAULT_LIMIT_GB,
  SERVERS,
  PAYMENT_METHODS,
  GROUP_ID,
} = require("../config");
const { mainMenu } = require("../menus");
const handleBalance = require("../handlers/balance");
const handleGetKeys = require("../handlers/getKeys");
const handlePhoto = require("../handlers/photo");
const { handleGenerate, executeGenerateKey } = require("../handlers/admin");
const { handleExtend, executeExtendKey } = require("../handlers/extend");

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

  // If only 1 server and 1 payment method, skip directly to payment details
  if (SERVERS.length === 1 && PAYMENT_METHODS.length === 1) {
    return ctx.reply(paymentDetails(SERVERS[0], PAYMENT_METHODS[0]), {
      parse_mode: "Markdown",
    });
  }

  // If only 1 server but multiple payment methods, skip server step
  if (SERVERS.length === 1) {
    const s = SERVERS[0];
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
  const buttons = SERVERS.map((server) => [
    Markup.button.callback(
      `🌐 ${server.name} — ${server.price}`,
      `select_server_${server.id}`,
    ),
  ]);

  let msg = `🌐 **VPN Server နေရာ ရွေးချယ်ပါ**\n\n`;
  SERVERS.forEach((server, index) => {
    msg += `${index + 1}. **${server.name}** — ${server.price} / ${DEFAULT_LIMIT_GB}GB\n`;
  });
  msg += `\nမိမိ ဝယ်ယူလိုသော Server ကို Button မှ ရွေးချယ်ပါ:`;

  ctx.reply(msg, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Buy — Step 2: Server selected → show payment method selection
bot.action(/^select_server_(\d+)$/, (ctx) => {
  const serverId = parseInt(ctx.match[1], 10);
  const server = SERVERS[serverId];
  if (!server) return ctx.answerCbQuery("❌ Invalid Server");

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

// Buy — Step 3: Payment method selected → show payment details
bot.action(/^pay_([a-z]+)_(\d+)$/, (ctx) => {
  const pmKey = ctx.match[1];
  const serverId = parseInt(ctx.match[2], 10);

  const server = SERVERS[serverId];
  const pm = PAYMENT_METHODS.find((m) => m.key === pmKey);

  if (!server || !pm) return ctx.answerCbQuery("❌ Invalid selection");

  ctx.answerCbQuery();
  ctx.reply(paymentDetails(server, pm), { parse_mode: "Markdown" });
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
bot.action(/^adm_gen_(\d+)_(\d+)$/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const serverIndex = parseInt(ctx.match[2], 10);
  const adminName = ctx.from.first_name || "Admin";

  try {
    await ctx.answerCbQuery("⏳ Key ပြုလုပ်နေသည်...");
    const res = await executeGenerateKey({
      targetUserId,
      serverIndex,
      telegram: ctx.telegram,
    });

    const originalText = ctx.callbackQuery.message.text || "";
    await ctx.editMessageText(
      `${originalText}\n\n` +
        `✅ **Approved & Key Generated!**\n` +
        `👤 User: \`${targetUserId}\`\n` +
        `🌐 Server: **${res.serverName}** (Expires ${res.expiresDisplay})\n` +
        `👮 Approved by: **${adminName}**`,
      { parse_mode: "Markdown" },
    );
  } catch (e) {
    ctx.reply(`❌ Key generation error: ${e.message}`);
  }
});

// Admin Inline Action: Extend plan
bot.action(/^adm_ext_(\d+)(?:_(\d+))?$/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const keyDbId = ctx.match[2] ? parseInt(ctx.match[2], 10) : null;
  const adminName = ctx.from.first_name || "Admin";

  try {
    await ctx.answerCbQuery("⏳ သက်တမ်းတိုးနေသည်...");
    const res = await executeExtendKey({
      targetUserId,
      keyDbId,
      telegram: ctx.telegram,
    });

    const originalText = ctx.callbackQuery.message.text || "";
    await ctx.editMessageText(
      `${originalText}\n\n` +
        `✅ **Plan Extended!**\n` +
        `👤 User: \`${targetUserId}\` (+${res.daysToAdd} days)\n` +
        `🌐 Server: **${res.serverName}**\n` +
        `📅 New Expiry: **${res.newExpiryDisplay}**\n` +
        `👮 Approved by: **${adminName}**`,
      { parse_mode: "Markdown" },
    );
  } catch (e) {
    ctx.reply(`❌ Extension error: ${e.message}`);
  }
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

// Fallback for custom typed text messages
bot.on("text", (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  ctx.reply(
    "⚠️ **ကျေးဇူးပြု၍ အောက်ပါ Menu Button များကို သာ အသုံးပြုပေးပါ။**",
    mainMenu,
  );
});
