const { Input } = require("telegraf");
const { bot } = require("../bot");
const { DEFAULT_LIMIT_GB } = require("../config");
const { mainMenu } = require("../menus");
const handleBalance = require("../handlers/balance");
const handleGetKeys = require("../handlers/getKeys");
const handlePhoto = require("../handlers/photo");
const handleGenerate = require("../handlers/admin");

const KPayPhoneNumber = "09763684400";
const kpayOwner = "Nay Ba La";

// ==================================================================
// 👋 START COMMAND
// ==================================================================
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    ` **Ye Gu Saung VPN မှကြိုဆိုပါတယ်!**\n\n\n` +
      `${DEFAULT_LIMIT_GB}GB Plan ဝယ်ယူရန်အတွက်\n\n` +
      `1. **7000 Ks** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ \n${KPayPhoneNumber}(${kpayOwner})\n\n` +
      `2. Noteမှာ 'Family and Friends' ဟုရေးပေးပါ\n\n` +
      `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။\n\n`,
    mainMenu,
  );
});

// ==================================================================
// 👂 BUTTON HANDLERS
// ==================================================================

// Buy
bot.hears("၀ယ်မည်", (ctx) => {
  ctx.reply(
    `💳 **100GB ၀ယ်ယူရန်**\n\n` +
      `1. **7000 Ks** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ\n` +
      `\`${KPayPhoneNumber}\` - ${kpayOwner}\n` +
      `👆 **Tap to Copy** \n\n` +
      `2. Note မှာ 'Family and Friends' ဟုရေးပေးပါ\n` +
      `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။`,
    { parse_mode: "Markdown" },
  );
});

// Contact
bot.hears("ဆက်သွယ်ရန်", (ctx) =>
  ctx.reply(`အက်ဒမင်ဆီသို့တိုက်ရိုက်ဆက်သွယ်ရန် @neverDavion`),
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
