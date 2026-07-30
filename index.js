// ==================================================================
// 🚀 ENTRY POINT
// Load order matters:
//   1. config  → dotenv + validation
//   2. db      → MySQL pool
//   3. bot     → Telegraf instance
//   4. routes  → Register all handlers
// ==================================================================
require("./config");       // Loads .env and validates required vars
require("./db");           // Connects to MySQL (exits on failure)

const { bot } = require("./bot");
const { SERVERS } = require("./config");
const { startExpiryJobs } = require("./handlers/expiry");

// Log chat ID for all incoming updates to easily copy real GROUP_ID
bot.use((ctx, next) => {
  if (ctx.chat) {
    console.log(`📩 [Telegram Update] Chat ID: ${ctx.chat.id} | Type: ${ctx.chat.type} | Title/Name: ${ctx.chat.title || ctx.chat.first_name || "Unknown"}`);
  }
  return next();
});

require("./routes");       // Registers all bot handlers

// ==================================================================
// 🛡️  GLOBAL ERROR HANDLER
// Catches any unhandled middleware/handler errors so the bot doesn't
// crash on a bad GROUP_ID, failed Outline request, etc.
// ==================================================================
bot.catch((err, ctx) => {
  console.error(`❌ Unhandled handler error for update ${ctx?.update?.update_id}:`, err.message);
  // Optionally tell the user something went wrong
  try {
    ctx?.reply("⚠️ တစ်ခုခု မှားသွားသည်။ ထပ်မံကြိုးစားပါ သို့မဟုတ် Admin ထံဆက်သွယ်ပါ။");
  } catch (_) {}
});

// ==================================================================
// 🔁 LAUNCH WITH RETRY (handles transient network errors on startup)
// ==================================================================
async function launchWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.launch({ dropPendingUpdates: true });
      console.log(`🤖 Bot Online with ${SERVERS.length} server(s)...`);
      startExpiryJobs(bot);   // Start daily expiry/warning cron jobs
      return;
    } catch (err) {
      const isNetworkError = ["EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(err.code);
      // 400 Bad Request during launch usually means a stale pending update (e.g. wrong GROUP_ID).
      // Telegraf will skip past it on the next poll — don't exit, just warn.
      const isUpdateError = err.message && err.message.includes("Bad Request");
      if ((isNetworkError || isUpdateError) && attempt < maxRetries) {
        const wait = isUpdateError ? 2000 : delayMs * attempt;
        console.warn(`⚠️  Launch hiccup on attempt ${attempt}/${maxRetries}: ${err.message}. Retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.error(`❌ Bot launch failed after ${attempt} attempt(s):`, err.message);
        process.exit(1);
      }
    }
  }
}

launchWithRetry();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

