const { Telegraf, Markup, Input } = require("telegraf");
require("dotenv").config();
const axios = require("axios");
const https = require("https");
const mysql = require("mysql2/promise"); // Using Promise wrapper for async/await

// ==================================================================
// ⚙️ CONFIGURATION
// ==================================================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.USER_ID);   // Who can run /generate
const GROUP_ID = Number(process.env.GROUP_ID);   // Where notifications are sent

// Load Server Lists
const rawApiUrls = (process.env.API_URLS || "").split(',').map(s => s.trim()).filter(s => s.length > 0);
const rawDnsList = (process.env.DNS_HOSTNAMES || "").split(',').map(s => s.trim()).filter(s => s.length > 0);

// Validation
const missing = [];
if (!BOT_TOKEN) missing.push("BOT_TOKEN");
if (!process.env.USER_ID) missing.push("USER_ID");
if (!process.env.GROUP_ID) missing.push("GROUP_ID");
if (!process.env.DB_HOST) missing.push("DB_HOST");
if (rawApiUrls.length === 0) missing.push("API_URLS");

if (missing.length > 0) {
  console.error(`❌ Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// Build Server Objects
const SERVERS = rawApiUrls.map((url, index) => ({
    id: index,
    apiUrl: url,
    dns: rawDnsList[index] || null
}));

const DEFAULT_LIMIT_GB = 100;

// ==================================================================
// 🗄️ DATABASE CONNECTION
// ==================================================================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test DB Connection
db.getConnection()
    .then(conn => {
        console.log("✅ Connected to MySQL Database");
        conn.release();
    })
    .catch(err => {
        console.error("❌ Database Connection Failed:", err.message);
        process.exit(1);
    });

// ==================================================================
// 🌐 API CLIENT
// ==================================================================
const ipv4Agent = new https.Agent({ family: 4 });

const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    agent: ipv4Agent
  }
});
// const agent = new https.Agent({ rejectUnauthorized: false });
const agent = new https.Agent({ family: 4, rejectUnauthorized: false });

function getClient(serverIndex) {
    const server = SERVERS[serverIndex];
    if (!server) throw new Error("Invalid Server Index");
    return axios.create({ baseURL: server.apiUrl, httpsAgent: agent });
}

// ==================================================================
// 🔘 UI DEFINITION
// ==================================================================
const mainMenu = Markup.keyboard([
  ["လက်ကျန်စစ်", "🔑 မိမိ Key ယူရန်"], // Added "Get My Key"
  ["၀ယ်မည်", "ဆက်သွယ်ရန်"],
  ["အသုံးပြုပုံ"]
]).resize();

// ==================================================================
// 👋 1. START COMMAND
// ==================================================================
bot.start((ctx) => {
  ctx.replyWithMarkdown(
    ` **Yoke Lan VPNကို ကြိုဆိုပါတယ်!**\n\n\n` +
      `${DEFAULT_LIMIT_GB}GB Plan ဝယ်ယူရန်အတွက်\n\n` +
      `1. **4,000 Ks** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ \n09968256835(Htin Linn Phyo)\n\n` +
      `2. Noteမှာ 'Family and Friends' ဟုရေးပေးပါ\n\n` +
      `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။\n\n`,
      mainMenu
  );
});

const KPayPhoneNumber = "09968256835";
const kpayOwner = "Htin Linn Phyo";

// ==================================================================
// 👂 2. BUTTON HANDLERS
// ==================================================================
bot.hears("၀ယ်မည်", (ctx) => {
  ctx.reply(
    `💳 **100GB ၀ယ်ယူရန်**\n\n` +
      `1. **4,000 Ks** ကို KPay မှတစ်ဆင့် ပေးပို့ပါ\n` +
      `\`${KPayPhoneNumber}\` - ${kpayOwner}\n` +
      `👆 **Tap to Copy** \n\n` +
      `2. Note မှာ 'Family and Friends' ဟုရေးပေးပါ\n` +
      `3. ပေးပို့ပြီးနောက် **Screenshot** ကို ဒီ Chat ထဲတွင် တင်ပေးပါ။`,
    { parse_mode: "Markdown" } 
  );
});

bot.hears("ဆက်သွယ်ရန်", (ctx) => ctx.reply(`အက်ဒမင်ဆီသို့တိုက်ရိုက်ဆက်သွယ်ရန် @yokeLanAdmin`));
bot.hears("လက်ကျန်စစ်", handleBalance);
bot.hears("🔑 မိမိ Key ယူရန်", handleGetKeys); // New Handler

bot.hears("အသုံးပြုပုံ", (ctx) => {
  ctx.reply(`📖 **VPN အသုံးပြုနည်း**\n`);
  try { ctx.replyWithPhoto(Input.fromLocalFile("images/instruction.jpeg")); } catch (e) {}
});

bot.command("mybalance", handleBalance);

// ==================================================================
// 📸 3. PHOTO HANDLER
// ==================================================================
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.first_name;

  ctx.reply("✅ **Receipt Received!** Verifying...", mainMenu);
  const photoURl = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  await bot.telegram.sendPhoto(GROUP_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
      caption: `💰 **Payment**\nFrom: ${username} (ID: \`${userId}\`)`,
    }
  );
  await bot.telegram.sendMessage(GROUP_ID, `/generate ${userId} ${photoURl}`);
});

// ==================================================================
// 👮 4. ADMIN COMMAND: GENERATE (MYSQL STORAGE)
// ==================================================================
bot.command("generate", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const rawId = ctx.message.text.split(" ")[1];
  const photoUrl = ctx.message.text.split(" ")[2];
  
  if (!rawId) return ctx.reply("❌ Usage: /generate 12345");
  const targetUserId = String(rawId).trim();

  // 🎲 Random Load Balancing
  const serverIndex = Math.floor(Math.random() * SERVERS.length);
  const selectedServer = SERVERS[serverIndex];

  ctx.reply(`⏳ Generating on Server #${serverIndex + 1}...`);

  try {
    const client = getClient(serverIndex);

    // 1. Create Key
    const createRes = await client.post("/access-keys");
    const key = createRes.data;

    // 2. Rename & Limit
    const uniqueName = `User_${targetUserId}_${Date.now().toString().slice(-4)}`;
    await client.put(`/access-keys/${key.id}/name`, { name: uniqueName });
    await client.put(`/access-keys/${key.id}/data-limit`, { limit: { bytes: DEFAULT_LIMIT_GB * 1024 ** 3 } });

    // 3. DNS Swap
    let finalAccessUrl = key.accessUrl;
    if (selectedServer.dns) {
        finalAccessUrl = finalAccessUrl.replace(/@(\d{1,3}\.){3}\d{1,3}/, '@' + selectedServer.dns);
    }

    // 4. SAVE TO MYSQL (Include the Access URL!)
    const sql = `INSERT INTO user_keys (telegram_id, server_index,outline_api_url ,generated_user_name,key_id, access_url, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    await db.execute(sql, [targetUserId, serverIndex, selectedServer.apiUrl, uniqueName, key.id, finalAccessUrl, photoUrl]);

    // 5. Send to User
    const userMessage =
      `🚀 **Payment Accepted!**\n\n` +
      `Here is your **New 100 GB Key**:\n` +
      `\`${finalAccessUrl}#VIP_${uniqueName}\`\n\n` +
      `👆 **Tap to Copy**`;

    await bot.telegram.sendMessage(targetUserId, userMessage, { parse_mode: "Markdown" });
    ctx.reply(`✅ Success! Saved to DB.`);

  } catch (e) {
    console.error(e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
});

// ==================================================================
// 📊 5. BALANCE CHECK (READ FROM MYSQL)
// ==================================================================
async function handleBalance(ctx) {
  const userId = String(ctx.from.id).trim();

  try {
      // Get Keys from MySQL
      const [rows] = await db.execute("SELECT * FROM user_keys WHERE telegram_id = ?", [userId]);
      
      if (rows.length === 0) return ctx.reply("❌ No active plan found.");

      let reportMessage = `📊 **Your Usage Report**\n\n`;
      let activeCount = 0;

      for (let i = 0; i < rows.length; i++) {
          const entry = rows[i];
          const serverIdx = entry.server_index;
          const keyId = entry.key_id;
          const createdAt = new Date(entry.created_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });

          try {
              const client = getClient(serverIdx);
              const [keysRes, metricsRes] = await Promise.all([
                  client.get("/access-keys"),
                  client.get("/metrics/transfer")
              ]);

              const keyData = keysRes.data.accessKeys.find((k) => k.id === keyId);
              if (keyData) {
                  activeCount++;
                  const usedBytes = metricsRes.data.bytesTransferredByUserId[keyId] || 0;
                  const limitBytes = keyData.dataLimit ? keyData.dataLimit.bytes : 0;
                  const limitGB = (limitBytes / 1024 ** 3).toFixed(2);
                  const leftGB = ((limitBytes - usedBytes) / 1024 ** 3).toFixed(2);

                  let percent = 0;
                  if (limitBytes > 0) percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
                  const filled = Math.floor(percent / 10);
                  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

                  reportMessage += `🔑 **Key #${i + 1} **\n`;
                  reportMessage += `Created: **${createdAt}**\n`;
                  reportMessage += `✅ Left: **${leftGB} GB** / ${limitGB} GB\n`;
                  reportMessage += `[${bar}] ${percent}%\n------------------\n`;
              }
          } catch (e) {
              reportMessage += `🔑 **Key #${i + 1}**: ⚠️ Offline\n`;
          }
      }
      ctx.replyWithMarkdown(reportMessage);
  } catch (e) {
      console.error(e);
      ctx.reply("⚠️ Database/Server Error.");
  }
}

// ==================================================================
// 🔑 6. RETRIEVE KEYS COMMAND (NEW FEATURE)
// ==================================================================
async function handleGetKeys(ctx) {
    const userId = String(ctx.from.id).trim();
    try {
        const [rows] = await db.execute("SELECT access_url FROM user_keys WHERE telegram_id = ?", [userId]);
        
        if (rows.length === 0) return ctx.reply("❌ You don't have any keys.");

        let msg = `🔑 **Your Saved Keys:**\n\n`;
        rows.forEach((row, index) => {
            msg += `**Key ${index + 1}:**\n\`${row.access_url}\`\n\n`;
        });
        msg += `👆 **Tap to Copy**`;
        
        ctx.replyWithMarkdown(msg);
    } catch (e) {
        console.error(e);
        ctx.reply("⚠️ Database Error.");
    }
}

// ==================================================================
// 🚀 START
// ==================================================================
bot.launch();
console.log(`🤖 MySQL Bot Online with ${SERVERS.length} Servers...`);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));