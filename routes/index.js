const { Input, Markup } = require("telegraf");
const { bot } = require("../bot");
const {
  DEFAULT_LIMIT_GB,
  SERVERS,
  PAYMENT_METHODS,
  adminAccount,
} = require("../config");
const { mainMenu } = require("../menus");
const handleBalance = require("../handlers/balance");
const handleGetKeys = require("../handlers/getKeys");
const handlePhoto = require("../handlers/photo");
const handleGenerate = require("../handlers/admin");
const handleExtend = require("../handlers/extend");

// ==================================================================
// 👋 START COMMAND
// ==================================================================
bot.start((ctx) => {
  let serverListText = "";
  if (SERVERS.length > 0) {
    serverListText = SERVERS.map(
      (s) => `• **${s.name}**: ${s.price} (${DEFAULT_LIMIT_GB}GB)`,
    ).join("\n");
  }

  ctx.replyWithMarkdown(
    `🙏 **Ye Gu Saung VPN မှကြိုဆိုပါတယ်!**\n\n` +
      `⚡ **လက်ရှိရရှိနိုင်သော Server များ:**\n${serverListText}\n\n` +
      `ဝယ်ယူလိုပါက အောက်ပါ **'၀ယ်မည်'** Button ကို နှိပ်ပြီး Server ရွေးချယ်နိုင်ပါသည်။`,
    mainMenu,
  );
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
bot.hears("၀ယ်မည်", (ctx) => {
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
  const pmKey    = ctx.match[1];
  const serverId = parseInt(ctx.match[2], 10);

  const server = SERVERS[serverId];
  const pm     = PAYMENT_METHODS.find((m) => m.key === pmKey);

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

// Get saved keys
bot.hears("🔑 မိမိ Key ယူရန်", handleGetKeys);

// How to use (instructions image)
bot.hears("အသုံးပြုပုံ", (ctx) => {
  ctx.reply(`📖 **VPN အသုံးပြုနည်း**\n`);
  try {
    ctx.replyWithPhoto(Input.fromLocalFile("images/instruction.jpeg"));
  } catch (e) {}
});

// ==================================================================
// 📸 PHOTO HANDLER (payment receipt)
// ==================================================================
bot.on("photo", handlePhoto);

// ==================================================================
// 👮 ADMIN COMMANDS
// ==================================================================
bot.command("generate", handleGenerate);  // /generate <userId> [photoId] [serverIdx]
bot.command("extend", handleExtend);      // /extend <userId> [days]




