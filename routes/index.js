const { Input, Markup } = require("telegraf");
const { bot } = require("../bot");
const {
  DEFAULT_LIMIT_GB,
  SERVERS,
  KPayPhoneNumber,
  kpayOwner,
  adminAccount,
} = require("../config");
const { mainMenu } = require("../menus");
const handleBalance = require("../handlers/balance");
const handleGetKeys = require("../handlers/getKeys");
const handlePhoto = require("../handlers/photo");
const handleGenerate = require("../handlers/admin");

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

// Buy (Shows Server Selection List)
bot.hears("၀ယ်မည်", (ctx) => {
  if (SERVERS.length === 0) {
    return ctx.reply("❌ ရရှိနိုင်သော Server မရှိသေးပါ။");
  }

  // If only 1 server, reply directly with payment details
  if (SERVERS.length === 1) {
    const s = SERVERS[0];
    return ctx.reply(
      `💳 **${s.name} (${DEFAULT_LIMIT_GB}GB) ၀ယ်ယူရန်**\n\n` +
        `💰 ဈေးနှုန်း: **${s.price}**\n\n` +
        `1. **${s.price}** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ\n` +
        `\`${KPayPhoneNumber}\` - ${kpayOwner}\n` +
        `👆 **Tap to Copy** \n\n` +
        `2. Note မှာ 'Family and Friends' ဟုရေးပေးပါ\n` +
        `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။`,
      { parse_mode: "Markdown" },
    );
  }

  // Multiple servers: build inline keyboard buttons
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
  msg += `\nမိမိ ဝယ်ယူလိုသော Server ကို အောက်ပါ Button မှ ရွေးချယ်ပါ:`;

  ctx.reply(msg, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Callback Action when a user selects a server button
bot.action(/^select_server_(\d+)$/, (ctx) => {
  const serverId = parseInt(ctx.match[1], 10);
  const server = SERVERS[serverId];
  if (!server) return ctx.answerCbQuery("❌ Invalid Server");

  ctx.answerCbQuery();
  ctx.reply(
    `💳 **${server.name} (${DEFAULT_LIMIT_GB}GB) ၀ယ်ယူရန်**\n\n` +
      `💰 ဈေးနှုန်း: **${server.price}**\n\n` +
      `1. **${server.price}** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ\n` +
      `\`${KPayPhoneNumber}\` - ${kpayOwner}\n` +
      `👆 **Tap to Copy** \n\n` +
      `2. Note မှာ 'Family and Friends' ဟုရေးပေးပါ\n` +
      `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။`,
    { parse_mode: "Markdown" },
  );
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
// 👮 ADMIN COMMAND
// ==================================================================
bot.command("generate", handleGenerate);
