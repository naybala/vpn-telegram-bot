const { GROUP_ID } = require("../config");
const { mainMenu } = require("../menus");

// ==================================================================
// 📸 PAYMENT PHOTO HANDLER
// Forwards the receipt to the admin group with user info.
// ==================================================================
async function handlePhoto(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.first_name;
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  // Acknowledge to the user
  await ctx.reply("✅ **Receipt Received!** Verifying...", mainMenu);

  // Forward to admin group with caption
  await ctx.telegram.sendPhoto(GROUP_ID, photo.file_id, {
    caption: `💰 **Payment**\nFrom: ${username} (ID: \`${userId}\`)`,
    parse_mode: "Markdown",
  });

  // Send pre-filled /generate command for admin to approve
  await ctx.telegram.sendMessage(GROUP_ID, `/generate ${userId} ${photo.file_id}`);
}

module.exports = handlePhoto;
