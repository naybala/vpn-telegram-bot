const { Telegraf } = require("telegraf");
const axios = require("axios");
const https = require("https");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { BOT_TOKEN, SERVERS, BOT_PROXY } = require("../config");

// ==================================================================
// 🌐 BOT INSTANCE + API CLIENT
// ==================================================================
let telegramAgent = undefined;

if (BOT_PROXY) {
  if (BOT_PROXY.startsWith("socks")) {
    telegramAgent = new SocksProxyAgent(BOT_PROXY);
  } else {
    telegramAgent = new HttpsProxyAgent(BOT_PROXY);
  }
  console.log(`📡 Using proxy for Telegram API: ${BOT_PROXY}`);
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const bot = new Telegraf(BOT_TOKEN, {
  ...(telegramAgent ? { telegram: { agent: telegramAgent } } : {}),
});

/**
 * Returns an axios client pre-configured for a given Outline server.
 * @param {number} serverIndex
 */
function getClient(serverIndex) {
  const server = SERVERS[serverIndex];
  if (!server) throw new Error(`Invalid Server Index: ${serverIndex}`);
  return axios.create({ baseURL: server.apiUrl, httpsAgent });
}

module.exports = { bot, getClient };

