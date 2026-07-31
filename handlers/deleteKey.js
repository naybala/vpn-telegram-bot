const { Markup } = require("telegraf");
const { ADMIN_ID, SERVERS } = require("../config");
const { getClient } = require("../bot");
const db = require("../db");

// ==================================================================
// 🗑️ DELETE KEY HANDLERS (User & Admin)
// ==================================================================

// 1. User taps "🗑️ Key ဖျက်မည်" button -> ask confirmation or list keys
async function handleUserDeleteRequest(ctx) {
  const userId = String(ctx.from.id).trim();

  try {
    const [rows] = await db.execute(
      `SELECT * FROM user_keys 
       WHERE telegram_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [userId]
    );

    if (rows.length === 0) {
      return ctx.reply("❌ သင့်တွင် ဖျက်ရန် Active ဖြစ်နေသော Key မရှိပါ။");
    }

    // Single key -> direct confirmation button
    if (rows.length === 1) {
      const key = rows[0];
      const serverName = SERVERS[key.server_index]
        ? SERVERS[key.server_index].name
        : `Server #${key.server_index + 1}`;

      const buttons = Markup.inlineKeyboard([
        [
          Markup.button.callback("🗑️ သေချာပါသည် (Delete)", `confirm_delete_key_${key.id}`),
          Markup.button.callback("❌ မဖျက်ပါ။ (Cancel)", "cancel_delete_key"),
        ],
      ]);

      return ctx.reply(
        `⚠️ **VPN Key ဖျက်ရန် အတည်ပြုပါ:**\n\n` +
        `🌐 Server: **${serverName}**\n` +
        `🔑 Name: \`${key.generated_user_name}\`\n\n` +
        `Key ကို ဖျက်လိုက်ပါက Server မှ ချက်ချင်း ဖျက်ဆီးသွားမည်ဖြစ်ပြီး ပြန်လည် အသုံးပြု၍ ရတော့မည် မဟုတ်ပါ။`,
        { parse_mode: "Markdown", ...buttons }
      );
    }

    // Multiple keys -> show key selection list
    const buttons = rows.map((key) => {
      const serverName = SERVERS[key.server_index]
        ? SERVERS[key.server_index].name
        : `Server #${key.server_index + 1}`;
      return [
        Markup.button.callback(`🗑️ Delete: ${serverName} (${key.generated_user_name})`, `confirm_delete_key_${key.id}`)
      ];
    });

    buttons.push([Markup.button.callback("❌ မဖျက်ပါ။ (Cancel)", "cancel_delete_key")]);

    ctx.reply(
      `🗑️ **ဖျက်လိုသော VPN Key ကို ရွေးချယ်ပါ:**\n\n` +
      `သင့်တွင် Active Key **${rows.length}** ခု ရှိပါသည်။`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
    );
  } catch (e) {
    console.error("Error in handleUserDeleteRequest:", e);
    ctx.reply("⚠️ အမှားအယွင်း ဖြစ်ပေါ်ခဲ့ပါသည်။");
  }
}

// 2. User confirms deletion via inline button
async function handleUserDeleteConfirm(ctx) {
  const keyDbId = ctx.match[1];
  const userId = String(ctx.from.id).trim();

  try {
    ctx.answerCbQuery("⏳ Key ဖျက်နေသည်...");

    const [rows] = await db.execute(
      `SELECT * FROM user_keys WHERE id = ? AND telegram_id = ? AND status = 'active'`,
      [keyDbId, userId]
    );

    if (rows.length === 0) {
      return ctx.editMessageText("❌ သင့်တွင် ဖျက်ရန် Active Key မရှိပါ သို့မဟုတ် ဖျက်ပြီးဖြစ်သည်။");
    }

    const key = rows[0];
    const serverIndex = key.server_index;

    // Delete from Outline Server
    try {
      const client = getClient(serverIndex);
      await client.delete(`/access-keys/${key.key_id}`);
      console.log(`✅ Deleted Outline Key ID ${key.key_id} from Server Index ${serverIndex}`);
    } catch (err) {
      console.warn("⚠️ Could not delete key from Outline server:", err.message);
    }

    // Delete record completely from MySQL DB table
    await db.execute("DELETE FROM user_keys WHERE id = ?", [key.id]);

    await ctx.editMessageText(
      `✅ **VPN Key ကို အောင်မြင်စွာ ဖျက်လိုက်ပါပြီ။**\n\n` +
      `Server နှင့် Database မှ ရာသက်ပန် ဖျက်ဆီးပြီးဖြစ်သည်။\n` +
      `နောက်တစ်ကြိမ် ဝယ်ယူလိုပါက **'၀ယ်မည်'** Button မှတစ်ဆင့် ဝယ်ယူနိုင်ပါသည်။`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("Error in handleUserDeleteConfirm:", e);
    ctx.reply(`❌ Error: ${e.message}`);
  }
}

// 3. Admin /deletekey <userId> command
async function handleAdminDeleteKey(ctx) {
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  const rawId = parts[1];

  if (!rawId) {
    return ctx.reply(
      `❌ **Usage:**\n\`\`\`\n/deletekey <userId>\n\`\`\`\n` +
      `Example:\n\`\`\`\n/deletekey 7570112968\n\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  const targetUserId = String(rawId).trim();

  try {
    const [rows] = await db.execute(
      `SELECT * FROM user_keys WHERE telegram_id = ?`,
      [targetUserId]
    );

    if (rows.length === 0) {
      return ctx.reply(`❌ No key records found for user \`${targetUserId}\`.`, { parse_mode: "Markdown" });
    }

    for (const key of rows) {
      try {
        const client = getClient(key.server_index);
        await client.delete(`/access-keys/${key.key_id}`);
        console.log(`✅ Deleted Outline Key ID ${key.key_id} from Server Index ${key.server_index}`);
      } catch (err) {
        console.warn(`⚠️ Could not delete key ${key.key_id} from server:`, err.message);
      }

      // Hard delete row from DB table
      await db.execute("DELETE FROM user_keys WHERE id = ?", [key.id]);
    }

    // Notify user
    try {
      await ctx.telegram.sendMessage(
        targetUserId,
        `⚠️ **သင့် VPN Key ကို Admin မှ ဖျက်သိမ်းလိုက်ပါပြီ။**`
      );
    } catch (_) {}

    ctx.reply(`✅ Permanently deleted all key(s) for user \`${targetUserId}\` from Outline server and database.`, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Error in handleAdminDeleteKey:", e);
    ctx.reply(`❌ Delete failed: ${e.message}`);
  }
}

module.exports = {
  handleUserDeleteRequest,
  handleUserDeleteConfirm,
  handleAdminDeleteKey,
};
