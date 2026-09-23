const { ADMIN_ID, SERVERS, PLAN_DAYS } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");

// ==================================================================
// 🔗 ADMIN: /synckey COMMAND
// Registers an existing Outline key (created on the dashboard) into
// the user_keys DB table so the bot can track it.
//
// Usage:
//   /synckey <userId> <keyId> [serverIndex(1-based)] [days]
//
// Examples:
//   /synckey 7570112968 45           → server 1, default PLAN_DAYS
//   /synckey 7570112968 45 2         → server 2, default PLAN_DAYS
//   /synckey 7570112968 45 1 30      → server 1, 30 days from now
// ==================================================================
async function handleSyncKey(ctx) {
  if (ctx.from.id !== ADMIN_ID) return;

  const parts     = ctx.message.text.trim().split(/\s+/);
  const rawUserId = parts[1];
  const rawKeyId  = parts[2];
  const rawServer = parts[3];
  const rawDays   = parts[4];

  if (!rawUserId || !rawKeyId) {
    return ctx.reply(
      `❌ Usage: /synckey <userId> <keyId> [serverIndex] [days]\n\n` +
      `Examples:\n` +
      `/synckey 7570112968 45\n` +
      `/synckey 7570112968 45 2 30`,
    );
  }

  const targetUserId = String(rawUserId).trim();
  const keyId        = String(rawKeyId).trim();

  // Resolve server index (1-based input → 0-based internal)
  let serverIndex = 0;
  if (rawServer && !isNaN(rawServer)) {
    const p = parseInt(rawServer, 10);
    if (p >= 1 && p <= SERVERS.length) serverIndex = p - 1;
  }

  const selectedServer = SERVERS[serverIndex];
  if (!selectedServer) {
    return ctx.reply(`❌ Invalid server index. You have ${SERVERS.length} server(s).`);
  }

  // Resolve expiry (days from now)
  const daysToAdd = rawDays && !isNaN(rawDays) ? parseInt(rawDays, 10) : PLAN_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysToAdd);
  const expiresDisplay = expiresAt.toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  await ctx.reply(
    `⏳ Syncing key ${keyId} on ${selectedServer.name} for user ${targetUserId}...`
  );

  try {
    // 1. Verify the key actually exists on Outline
    const client    = getClient(serverIndex);
    const keysRes   = await client.get("/access-keys");
    const accessKeys = keysRes.data.accessKeys || keysRes.data || [];
    const keyData   = accessKeys.find((k) => String(k.id) === String(keyId));

    if (!keyData) {
      return ctx.reply(
        `❌ Key ID ${keyId} not found on ${selectedServer.name}.\n` +
        `Check the key ID and server index, then try again.`
      );
    }

    // 2. Prevent duplicate entries
    const [existing] = await db.execute(
      "SELECT id FROM user_keys WHERE key_id = ? AND server_index = ?",
      [keyId, serverIndex]
    );
    if (existing.length > 0) {
      return ctx.reply(
        `⚠️ Key ID ${keyId} is already in the database (row id: ${existing[0].id}).\nNo duplicate inserted.`
      );
    }

    // 3. Build access URL with optional DNS swap
    let finalAccessUrl = keyData.accessUrl || "";
    if (selectedServer.dns && finalAccessUrl) {
      finalAccessUrl = finalAccessUrl.replace(
        /@(\d{1,3}\.){3}\d{1,3}/,
        "@" + selectedServer.dns
      );
    }

    const uniqueName = keyData.name || `User_${targetUserId}_sync`;

    // 4. Insert into user_keys
    await db.execute(
      `INSERT INTO user_keys
         (telegram_id, server_index, outline_api_url, generated_user_name, key_id, access_url, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetUserId, serverIndex, selectedServer.apiUrl, uniqueName, keyId, finalAccessUrl, expiresAt]
    );

    // 5. Confirm to admin
    await ctx.reply(
      `✅ Key Synced!\n\n` +
      `👤 User: ${targetUserId}\n` +
      `🌐 Server: ${selectedServer.name}\n` +
      `🔑 Key ID: ${keyId}\n` +
      `📅 Expires: ${expiresDisplay} (+${daysToAdd} days)\n\n` +
      `User can now see it via "လက်ကျန်စစ်".`
    );

    // 6. Notify the user
    try {
      await ctx.telegram.sendMessage(
        targetUserId,
        `✅ သင်၏ VPN Key ကို မှတ်တမ်းတင်ပြီးပါပြီ!\n\n` +
        `🌐 Server: ${selectedServer.name}\n` +
        `📅 Expires: ${expiresDisplay}\n\n` +
        `VPN Key:\n${finalAccessUrl}#VIP_${uniqueName}\n\nTap to Copy`
      );
    } catch (e) {
      console.warn(`⚠️ [SyncKey] Could not DM user ${targetUserId}:`, e.message);
      await ctx.reply(
        `⚠️ Key registered in DB but could not send key to user.\n` +
        `They may not have started the bot yet.`
      );
    }

  } catch (e) {
    console.error("Error in handleSyncKey:", e);
    ctx.reply(`❌ Sync failed: ${e.message}`);
  }
}

module.exports = handleSyncKey;
