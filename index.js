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
require("./routes");       // Registers all bot handlers

// ==================================================================
// 🔁 LAUNCH WITH RETRY (handles transient network errors on startup)
// ==================================================================
async function launchWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await bot.launch();
      console.log(`🤖 Bot Online with ${SERVERS.length} server(s)...`);
      return;
    } catch (err) {
      const isNetworkError = ["EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(err.code);
      if (isNetworkError && attempt < maxRetries) {
        const wait = delayMs * attempt;
        console.warn(`⚠️  Network error on attempt ${attempt}/${maxRetries}: ${err.code}. Retrying in ${wait / 1000}s...`);
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

