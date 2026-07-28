const { Telegraf } = require("telegraf");
const axios = require("axios");
const https = require("https");
const { BOT_TOKEN, SERVERS } = require("../config");

// ==================================================================
// 🌐 BOT INSTANCE + API CLIENT
// ==================================================================
const ipv4Agent = new https.Agent({ family: 4 });
const httpsAgent = new https.Agent({ family: 4, rejectUnauthorized: false });

const bot = new Telegraf(BOT_TOKEN, {
  telegram: { agent: ipv4Agent },
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
