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

bot.launch();
console.log(`🤖 Bot Online with ${SERVERS.length} server(s)...`);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
