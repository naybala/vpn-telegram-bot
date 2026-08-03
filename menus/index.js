const { Markup } = require("telegraf");

// ==================================================================
// 🔘 MAIN MENU KEYBOARD
// ==================================================================
const mainMenu = {
  ...Markup.keyboard([
    ["လက်ကျန်စစ်", "🔑 မိမိ Key ယူရန်"],
    ["၀ယ်မည်", "ဆက်သွယ်ရန်"],
    ["လမ်းညွှန်ချက်များ", "🗑️ Key ဖျက်မည်"],
  ]).resize(),
  input_field_placeholder: "👇 Button များကို သာ နှိပ်ပါ...",
};

module.exports = { mainMenu };
