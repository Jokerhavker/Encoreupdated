import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import {
  Command,
  BotUser,
  BotGroup,
  Setting,
  Statlog,
  PendingAction,
  UsedTransaction,
  Coupon,
  getCachedAppUrl,
} from "./db.js";

// Helper to resolve active preview/prod domain dynamically
export function getAppUrl(): string {
  const cached = getCachedAppUrl();
  if (cached) return cached;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return process.env.VITE_APP_URL || process.env.APP_URL || "https://ais-dev-7zposvri3knpwk5wp3qxma-68179712237.asia-southeast1.run.app";
}

// Global map to track user purchase/checkout state
const botShopStates = new Map<string, {
  state: 'awaiting_credit_qty' | 'awaiting_utr' | 'awaiting_coupon';
  type: 'sub' | 'credits';
  productId: string; // tier ID or command name
  amount: number;
  creditsCount?: number;
  couponCode?: string;
  originalAmount?: number;
}>();

// Super Admin Telegram IDs
export const BOT_ADMIN_IDS = ["8033206631", "8241699347"];

export function isBotSuperAdmin(userId: string | number | undefined): boolean {
  if (!userId) return false;
  return BOT_ADMIN_IDS.includes(String(userId));
}

// Session map for in-bot admin wizard
interface BotAdminSession {
  action:
    | 'search_user'
    | 'add_credits_direct'
    | 'sub_credits_direct'
    | 'add_credits_custom'
    | 'sub_credits_custom'
    | 'set_credits_custom'
    | 'set_coins_prompt'
    | 'set_coins_custom'
    | 'vip_prompt'
    | 'vip_custom'
    | 'ban_prompt'
    | 'ban_custom'
    | 'broadcast_prompt'
    | 'broadcast_confirm'
    | 'add_credits_amount'
    | 'sub_credits_amount'
    | 'set_credits_amount'
    | 'set_coins_amount';
  targetUserId?: string;
  targetCommand?: string;
  broadcastText?: string;
}
const botAdminSessions = new Map<string, BotAdminSession>();

async function resolveTargetUser(input: string): Promise<any> {
  const clean = String(input || '').trim();
  if (!clean) return null;

  // 1. Try numeric telegramId
  let user = await BotUser.findOne({ telegramId: clean });
  if (user) return user;

  // 2. Try @username or username
  const norm = clean.replace(/^@/, '');
  user = await BotUser.findOne({ username: new RegExp(`^${norm}$`, 'i') });
  if (user) return user;

  // 3. Try name matching
  user = await BotUser.findOne({
    $or: [
      { username: new RegExp(norm, 'i') },
      { firstName: new RegExp(norm, 'i') },
      { lastName: new RegExp(norm, 'i') }
    ]
  });
  return user;
}

function getUserCommonCredits(userDoc: any, cmd: string): number {
  if (!userDoc || !userDoc.commonCredits) return 0;
  const cleanCmd = cmd.startsWith('/') ? cmd : '/' + cmd;
  if (typeof userDoc.commonCredits.get === 'function') {
    return userDoc.commonCredits.get(cleanCmd) || 0;
  }
  return userDoc.commonCredits[cleanCmd] || 0;
}

function setUserCommonCredits(userDoc: any, cmd: string, amount: number) {
  if (!userDoc.commonCredits) {
    userDoc.commonCredits = new Map();
  }
  const cleanCmd = cmd.startsWith('/') ? cmd : '/' + cmd;
  if (typeof userDoc.commonCredits.set === 'function') {
    userDoc.commonCredits.set(cleanCmd, amount);
  } else {
    userDoc.commonCredits[cleanCmd] = amount;
  }
  userDoc.markModified('commonCredits');
}

function addOrRemoveUserCredits(userDoc: any, cmd: string, delta: number): number {
  const current = getUserCommonCredits(userDoc, cmd);
  const newBalance = Math.max(0, current + delta);
  setUserCommonCredits(userDoc, cmd, newBalance);
  return newBalance;
}

function setUserDailyLimit(userDoc: any, cmd: string, limit: number, isUnlimited = false) {
  const cleanCmd = cmd.startsWith('/') ? cmd : '/' + cmd;
  let list = userDoc.commandCredits || [];
  const idx = list.findIndex((c: any) => c.command === cleanCmd);
  if (idx >= 0) {
    list[idx].dailyLimit = limit;
    list[idx].isUnlimited = isUnlimited;
  } else {
    list.push({ command: cleanCmd, dailyLimit: limit, isUnlimited });
  }
  userDoc.commandCredits = list;
  userDoc.markModified('commandCredits');
}

async function renderAdminUserProfile(user: any): Promise<{ text: string; markup: any }> {
  const creditCmds = await Command.find({ isCreditBased: true });
  let creditsText = "";

  if (creditCmds.length > 0) {
    creditCmds.forEach((cmd: any) => {
      const override = user.commandCredits?.find((c: any) => c.command === cmd.command);
      const limit = override?.isUnlimited ? "Unlimited" : (override?.dailyLimit ?? cmd.defaultDailyCredits ?? 0);
      const commonBal = getUserCommonCredits(user, cmd.command);
      creditsText += `• \`${cmd.command}\`: Daily \`${limit}\` | Extra: *${commonBal}*\n`;
    });
  } else {
    creditsText = "• No credit-based commands configured in system\n";
  }

  const expiryStr = user.isPremium
    ? (user.premiumExpiresAt ? new Date(user.premiumExpiresAt).toLocaleDateString("en-IN") : "Lifetime")
    : "None";

  const userText = `👤 *USER DETAILS INSPECTION*\n\n` +
    `🆔 *Telegram ID:* \`${user.telegramId}\`\n` +
    `👤 *Name:* ${user.firstName || 'N/A'} ${user.username ? `(@${user.username})` : ''}\n` +
    `📊 *Status:* ${user.isBanned ? "🚫 BANNED" : "✅ ACTIVE"}\n` +
    `👑 *Role:* ${user.isAdmin ? "🛡️ Admin" : user.isPremium ? "⭐ VIP Member" : "Standard User"}\n` +
    `⏳ *VIP Expiry:* \`${expiryStr}\`\n` +
    `🪙 *ENC Coins Balance:* *${user.encCoins || 0}*\n` +
    `📈 *Total Interactions:* ${user.interactions || 0}\n` +
    `💬 *Started Bot in PM:* ${user.hasStartedBot ? "Yes" : "No"}\n` +
    `👥 *Group Daily Limit:* ${user.isGroupUnlimited ? "Unlimited" : (user.groupCreditsLimit ?? 50)} (Used: ${user.groupCreditsUsed || 0})\n\n` +
    `⚡ *Command Credits Breakdown:*\n${creditsText}`;

  const markup = {
    inline_keyboard: [
      [
        { text: "⚡ Add Credits", callback_data: `adm_add_c:${user.telegramId}` },
        { text: "➖ Remove Credits", callback_data: `adm_sub_c:${user.telegramId}` }
      ],
      [
        { text: "✏️ Set Daily Limit", callback_data: `adm_lim_c:${user.telegramId}` },
        { text: "🪙 Edit ENC Coins", callback_data: `adm_coin_menu:${user.telegramId}` }
      ],
      [
        { text: "👑 VIP Management", callback_data: `adm_vip_menu:${user.telegramId}` },
        { text: user.isBanned ? "🟢 Unban User" : "🚫 Ban User", callback_data: `adm_ban:${user.telegramId}` }
      ],
      [
        { text: "🔄 Reset Today's Usage", callback_data: `adm_reset_usage:${user.telegramId}` },
        { text: "🔍 Search Another User", callback_data: "adm_search_user" }
      ],
      [
        { text: "🔙 Admin Menu", callback_data: "admin_main_menu" }
      ]
    ]
  };

  return { text: userText, markup };
}

async function showAdminMainMenu(ctx: any) {
  const userId = String(ctx.from?.id);
  if (!isBotSuperAdmin(userId)) {
    const replyOpts = ctx.callbackQuery ? {} : { reply_parameters: { message_id: ctx.message?.message_id } };
    return ctx.reply("⛔ *Access Denied:* This admin panel is reserved for authorized bot administrators (Ayush & Arush).", { parse_mode: "Markdown", ...replyOpts });
  }

  botAdminSessions.delete(userId);

  const [totalUsers, totalGroups, totalCommands, bannedCount, premiumCount] = await Promise.all([
    BotUser.countDocuments(),
    BotGroup.countDocuments(),
    Command.countDocuments(),
    BotUser.countDocuments({ isBanned: true }),
    BotUser.countDocuments({ isPremium: true })
  ]);

  const activeToday = await BotUser.countDocuments({
    "commandUsage.lastResetDate": new Date().toISOString().split("T")[0]
  });

  const appUrl = getAppUrl();
  const adminName = userId === "8033206631" ? "Ayush" : userId === "8241699347" ? "Arush" : (ctx.from?.first_name || "Admin");

  const messageText = `👑 *ENCORE XOSINT — SUPER ADMIN PANEL* 👑\n\n` +
    `👋 Logged in as: *${adminName}* (\`${userId}\`)\n\n` +
    `📊 *Live Database Statistics:*\n` +
    `• 👥 Total Users: *${totalUsers.toLocaleString()}*\n` +
    `• ⚡ Active Users Today: *${activeToday.toLocaleString()}*\n` +
    `• 🏰 Tracked Groups: *${totalGroups.toLocaleString()}*\n` +
    `• ⚡ Available Commands: *${totalCommands.toLocaleString()}*\n` +
    `• 👑 VIP / Premium Users: *${premiumCount.toLocaleString()}*\n` +
    `• 🚫 Banned Users: *${bannedCount.toLocaleString()}*\n\n` +
    `⚡ *Quick Text Commands:*\n` +
    `• Search: \`/user <id or username>\`\n` +
    `• Add Credits: \`/addcredits <id> <command> <amount>\`\n` +
    `• Remove Credits: \`/removecredits <id> <command> <amount>\`\n` +
    `• Set Daily Limit: \`/setcredits <id> <command> <limit>\`\n` +
    `• Set Coins: \`/setcoins <id> <amount>\` | \`/addcoins <id> <amount>\`\n` +
    `• VIP: \`/setvip <id> [days]\` | \`/removevip <id>\`\n` +
    `• Moderation: \`/ban <id>\` | \`/unban <id>\`\n\n` +
    `Choose an administration option below:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔍 Search & Inspect User Details", callback_data: "adm_search_user" }],
      [
        { text: "⚡ Add Credits to User", callback_data: "adm_add_credits_direct" },
        { text: "➖ Remove Credits from User", callback_data: "adm_sub_credits_direct" }
      ],
      [
        { text: "🪙 Edit ENC Coins", callback_data: "adm_coins_prompt" },
        { text: "👑 VIP Management", callback_data: "adm_vip_prompt" }
      ],
      [
        { text: "🚫 Ban / Unban User", callback_data: "adm_ban_prompt" },
        { text: "📢 Broadcast Message", callback_data: "adm_broadcast_prompt" }
      ],
      [
        { text: "📊 Detailed System Analytics", callback_data: "adm_system_stats" },
        { text: "🌐 Open Web Admin Portal", web_app: { url: `${appUrl}/users` } }
      ],
      [{ text: "🔙 Return to Start Menu", callback_data: "view_start" }]
    ]
  };

  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    await ctx.editMessageText(messageText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(messageText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => {});
  }
}

// Slice Gateway Verification call logic
async function verifySlicePayment(paymentId: string, amount: number) {
  const cleanPaymentId = String(paymentId).trim();
  if (!cleanPaymentId) return null;

  try {
    const res = await axios.get(`https://sliceapi.vercel.app/api/v1/verify?utr=${encodeURIComponent(cleanPaymentId)}`, { timeout: 15000 });
    const data = res.data;
    if (data && (data.success === true || data.status === "VERIFIED") && data.transaction) {
      const txn = data.transaction;
      const txnAmount = Number(txn.amount);
      if (Math.abs(txnAmount - Number(amount)) < 1.0) {
        return {
          utr: String(txn.utr || txn.txnId || cleanPaymentId),
          txn_id: String(txn.txnId || txn.utr || cleanPaymentId),
          amount: txnAmount,
          payer: txn.payer || ''
        };
      }
    }
  } catch (err: any) {
    console.error("[Bot Slice Gateway verification error]", err?.message || err);
  }
  return null;
}

// Render root bot shop menu
async function showBotShopMenu(ctx: any) {
  const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  if (isGroup) {
    await ctx.reply(
      `🛍️ *ENCORE XOSINT Bot Shop*\n\nPlease message me in PM to browse plans and purchase credits or subscriptions.`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
    return;
  }

  const messageText = `🛍️ *ENCORE XOSINT Bot Shop* 🛍️\n\n` +
    `Welcome to our bot store! Upgrade your membership or purchase command credits for extended usage.\n\n` +
    `💳 *Supported Payment Handle:* \`ionfwarush@slc\` (Slice UPI)\n\n` +
    `Select an option below to proceed:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "👑 Premium Subscriptions", callback_data: "shop_sub_tier_menu" }],
      [{ text: "⚡ Buy Command Credits", callback_data: "shop_credits_menu" }],
      [{ text: "🔙 Back to Start", callback_data: "view_start" }]
    ]
  };

  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    await ctx.editMessageText(messageText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(messageText, { parse_mode: "Markdown", reply_markup: keyboard }).catch(() => {});
  }
}

// Bot Subscription Checkout QR and parameters builder
async function generateSubCheckoutMessage(ctx: any, userId: string, matchedTier: any, amount: number, couponCode?: string) {
  botShopStates.set(userId, {
    state: 'awaiting_utr',
    type: 'sub',
    productId: matchedTier.id,
    amount: amount,
    couponCode: couponCode
  });

  const cleanName = `${matchedTier.name} Subscription`.replace(/[^a-zA-Z0-9]/g, ' ');
  const upiString = `upi://pay?pa=ionfwarush@slc&pn=ENCORE_XOSINT_Shop&am=${amount}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

  let couponText = "";
  if (couponCode) {
    couponText = `🎉 *Coupon Code Applied:* \`${couponCode}\`\n`;
  }

  const captionText = `🎫 *Subscription Checkout: ${matchedTier.name}*\n\n` +
    couponText +
    `💰 *Payable Amount:* ₹${amount} / month\n\n` +
    `Please scan the QR code above to pay. After paying, send me the *UTR / Transaction ID* (Fampay/PhonePe/GPay) to instantly verify your purchase:\n\n` +
    `Press cancel to terminate checkout:`;

  try {
    await ctx.replyWithPhoto({ url: qrCodeUrl }, {
      caption: captionText,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
  } catch (err: any) {
    console.warn("replyWithPhoto failed, sending text fallback", err.message);
    await ctx.reply(captionText + `\n\n🖼️ [Payment QR Code](${qrCodeUrl})`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
  }
}

// Logic to handle Coupon code text input
async function handleCouponInput(ctx: any, userId: string, text: string) {
  const stateData = botShopStates.get(userId);
  if (!stateData || stateData.state !== 'awaiting_coupon') return;

  const codeEntered = text.trim().toUpperCase();
  if (text.startsWith("/")) {
    if (text === "/cancel" || text === "/shop" || text === "/start") {
      botShopStates.delete(userId);
      await ctx.reply("❌ Coupon entry canceled. Session terminated.");
    } else {
      await ctx.reply("⚠️ Invalid promo code. Send a code (letters & numbers) or click skip coupon to continue.");
    }
    return;
  }

  const coupon = await Coupon.findOne({ code: codeEntered });
  const tierId = stateData.productId;

  const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
  const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
  let matchedTier = tiers.find((t: any) => t.id === tierId);

  if (!matchedTier && tierId === 'premium') {
    const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
    const shopSettings = shopSettingsSetting?.value || {};
    matchedTier = {
      id: 'premium',
      name: 'Bot Paid Subscription',
      price: shopSettings.premiumMonthlyPrice || 80,
      discountPercent: shopSettings.premiumDiscountPercent || 15,
      commands: [],
    };
  }

  if (!matchedTier) {
    botShopStates.delete(userId);
    await ctx.reply("❌ Error: Plan details could not be found. Checkout canceled.");
    return;
  }

  if (!coupon) {
    await ctx.reply(`❌ *Invalid Coupon Code*\n\nWe couldn't find details for \`${codeEntered}\`.\n\nPlease type correctly, or click *Skip Coupon* below to checkout without a coupon code:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⏭️ Skip Coupon", callback_data: "shop_skip_coupon" }],
          [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
    return;
  }

  if (!coupon.isActive) {
    await ctx.reply(`❌ *Coupon Inactive*\n\nThe promo code \`${codeEntered}\` has been deactivated.\n\nPlease try another code or click *Skip Coupon*:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⏭️ Skip Coupon", callback_data: "shop_skip_coupon" }],
          [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
    return;
  }

  if (coupon.usedCount >= coupon.maxUses) {
    await ctx.reply(`❌ *Coupon Exhausted / Used Max Times*\n\nThe code \`${codeEntered}\` has already been fully redeemed.\n\nPlease try another code or click *Skip Coupon*:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⏭️ Skip Coupon", callback_data: "shop_skip_coupon" }],
          [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
    return;
  }

  if (coupon.tierId !== 'all' && coupon.tierId !== tierId) {
    await ctx.reply(`❌ *Applicability Failure*\n\nThe promo code \`${codeEntered}\` is not valid for *${matchedTier.name}*.\n\nPlease try another code or click *Skip Coupon*:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⏭️ Skip Coupon", callback_data: "shop_skip_coupon" }],
          [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
    return;
  }

  // Calculate discounted rate
  const original = stateData.originalAmount ?? matchedTier.price;
  const valDiscount = (original * coupon.discountPercent) / 100;
  const discountedRate = Math.round((original - valDiscount) * 100) / 100;

  // Generate checkout QR with discounted price
  await generateSubCheckoutMessage(ctx, userId, matchedTier, discountedRate, coupon.code);
}

// Logic to handle credit purchase count input
async function handleCreditsQtyInput(ctx: any, userId: string, text: string) {
  const stateData = botShopStates.get(userId);
  if (!stateData || stateData.state !== 'awaiting_credit_qty' || stateData.type !== 'credits') return;

  const qty = parseInt(text);
  if (isNaN(qty) || qty <= 0) {
    await ctx.reply("⚠️ *Invalid Quantity*\n\nPlease enter a valid positive integer number of credits (e.g. 50).");
    return;
  }

  // Fetch command detail
  const cmd = await Command.findOne({ command: stateData.productId });
  if (!cmd) {
    botShopStates.delete(userId);
    await ctx.reply("❌ This command credits package no longer exists in shop. Checkout canceled.");
    return;
  }

  const minLimit = cmd.minPurchaseCredits || 10;
  if (qty < minLimit) {
    await ctx.reply(`⚠️ *Quantity too low*\n\nThe minimum purchase amount for this command is *${minLimit} credits*. Please try entering a higher number:`, {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
      }
    });
    return;
  }

  // Cost calculation
  const pricePer = cmd.pricePerCredit || 0.5;
  const basePrice = qty * pricePer;

  // Check VIP premium discount
  const user = await BotUser.findOne({ telegramId: userId });
  let finalPrice = basePrice;
  let discountPercent = 0;
  let hasDiscount = false;

  if (user && user.isPremium) {
    // Calculate discount
    const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
    const subscriptionTiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
    const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
    const shopSettings = shopSettingsSetting?.value || {};

    if (user.premiumTier) {
      const matchedTier = subscriptionTiers.find((t: any) => t.id === user.premiumTier);
      discountPercent = matchedTier ? (matchedTier.discountPercent ?? (shopSettings.premiumDiscountPercent || 0)) : (shopSettings.premiumDiscountPercent || 0);
    } else {
      discountPercent = shopSettings.premiumDiscountPercent || 0;
    }

    if (discountPercent > 0) {
      const discountAmount = (basePrice * discountPercent) / 100;
      finalPrice = Math.round((basePrice - discountAmount) * 100) / 100;
      hasDiscount = true;
    }
  }

  // Update state to await UTR
  botShopStates.set(userId, {
    state: 'awaiting_utr',
    type: 'credits',
    productId: cmd.command,
    amount: finalPrice,
    creditsCount: qty
  });

  // Construct standard UPI payment URL
  const cleanName = `${qty} credits for ${cmd.command}`.replace(/[^a-zA-Z0-9]/g, ' ');
  const upiString = `upi://pay?pa=ionfwarush@slc&pn=ENCORE_XOSINT_Shop&am=${finalPrice}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

  let discountInfo = "";
  if (hasDiscount && discountPercent > 0) {
    discountInfo = `🔥 *VIP Discount:* Flat ${discountPercent}% OFF applied!\n(Original Price: ₹${basePrice.toFixed(2)})\n\n`;
  }

  const captionText = `⚡ *Checkout: Credits for ${cmd.command}*\n\n` +
    `📥 *Quantity:* ${qty} Credits\n` +
    `💰 *Payable Amount:* ₹${finalPrice}\n\n` +
    discountInfo +
    `Please scan the QR code above to pay. After paying, send me the *UTR / Transaction ID* here to verify.`;

  try {
    await ctx.replyWithPhoto({ url: qrCodeUrl }, {
      caption: captionText,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
  } catch (err: any) {
    console.warn("replyWithPhoto failed, sending text fallback", err.message);
    await ctx.reply(captionText + `\n\n🖼️ [Payment QR Code](${qrCodeUrl})`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
  }
}

// Logic to hand verification input (Transaction ID / UTR check)
async function handleUtrVerificationInput(ctx: any, userId: string, text: string) {
  const stateData = botShopStates.get(userId);
  if (!stateData || stateData.state !== 'awaiting_utr') return;

  const paymentId = text.trim();
  const amount = stateData.amount;
  const productId = stateData.productId;

  const waitMsg = await ctx.reply("🔍 *Verifying payment transaction...* Please wait up to 10 seconds...", { parse_mode: "Markdown" });

  try {
    // 1. Double spend protection
    const spentTxn = await UsedTransaction.findOne({ transactionId: paymentId });
    if (spentTxn) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply("⚠️ *Already Used*\n\nThis transaction/UTR ID has already been verified and used in our shop before. Please check again or click below to cancel:", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
      return;
    }

    // 2. Fetch from Slice Gateway API
    let foundTxn = await verifySlicePayment(paymentId, amount);

    if (!foundTxn) {
      try {
        const isSubscription = stateData.type === 'sub';
        const userDoc = await BotUser.findOne({ telegramId: userId });
        if (userDoc) {
          userDoc.purchaseHistory.push({
            productId,
            productName: isSubscription ? `${productId} Subscription` : `Credits for ${productId}`,
            price: Number(amount),
            transactionId: paymentId,
            utr: paymentId,
            date: new Date(),
            status: 'Failed'
          });
          await userDoc.save();
        }
      } catch (logErr) {
        console.error("Failed to log failed txn in bot.ts:", logErr);
      }

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(`⚠️ *Transaction Not Found*\n\nPayment transaction was not found on Slice Gateway or the amount does not match *₹${amount}*.\n\nMake sure:\n- Payment was completed successfully to \`ionfwarush@slc\`.\n- You entered the correct 12-digit UTR.\n- You paid the exact amount: *₹${amount}*\n\nPlease respond with the correct UTR, or click cancel:`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
          ]
        }
      });
      return;
    }

    const finalUtr = foundTxn.utr || paymentId;
    const finalTxnId = foundTxn.txn_id || paymentId;

    // Double check found details
    const doubleSpentCheckUtr = await UsedTransaction.findOne({ transactionId: finalUtr });
    const doubleSpentCheckTxn = await UsedTransaction.findOne({ transactionId: finalTxnId });
    if (doubleSpentCheckUtr || doubleSpentCheckTxn) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply("⚠️ *Already Spent*\n\nThis payment transaction was already applied/credited for another purchase. Checkout canceled.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
      return;
    }

    // 3. Mark Spent
    if (finalUtr) {
      await UsedTransaction.create({ transactionId: finalUtr, telegramId: userId, amount: Number(amount), type: productId });
    }
    if (finalTxnId && finalTxnId !== finalUtr) {
      await UsedTransaction.create({ transactionId: finalTxnId, telegramId: userId, amount: Number(amount), type: productId });
    }

    // 4. Update core user profile
    const userDoc = await BotUser.findOne({ telegramId: userId });
    if (!userDoc) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply("❌ Error: Your user profile does not exist in our database. Please run /start and try again.");
      botShopStates.delete(userId);
      return;
    }

    let finalProductName = '';
    const isSubscription = stateData.type === 'sub';

    if (isSubscription) {
      userDoc.isPremium = true;
      userDoc.premiumTier = productId;
      
      const currentExpiry = userDoc.premiumExpiresAt ? new Date(userDoc.premiumExpiresAt).getTime() : Date.now();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      userDoc.premiumExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

      // Fetch credits bonuses
      let tierName = 'Premium Membership';
      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      if (tiersSetting && Array.isArray(tiersSetting.value)) {
        const matched = tiersSetting.value.find((t: any) => t.id === productId);
        if (matched) {
          tierName = `${matched.name} Subscription`;
          if (Array.isArray(matched.commands)) {
            if (!userDoc.commonCredits) {
              userDoc.commonCredits = new Map();
            }
            for (const cmdConfig of matched.commands) {
              const bonusCredits = Number(cmdConfig.bonusCommonCredits || 0);
              if (cmdConfig.command && bonusCredits > 0) {
                const currentCommon = userDoc.commonCredits.get(cmdConfig.command) || 0;
                userDoc.commonCredits.set(cmdConfig.command, currentCommon + bonusCredits);
              }
            }
          }
        }
      }
      finalProductName = tierName;
    } else {
      // Command credits
      const creditsCount = stateData.creditsCount || 10;
      if (!userDoc.commonCredits) {
        userDoc.commonCredits = new Map();
      }
      const currentCommon = userDoc.commonCredits.get(productId) || 0;
      userDoc.commonCredits.set(productId, currentCommon + creditsCount);
      finalProductName = `${creditsCount} Credits for ${productId}`;
    }

    if (stateData.couponCode) {
      try {
        const coupon = await Coupon.findOne({ code: stateData.couponCode.toUpperCase() });
        if (coupon) {
          coupon.usedCount = (coupon.usedCount || 0) + 1;
          await coupon.save();
          finalProductName = `${finalProductName} (Coupon: ${coupon.code} -${coupon.discountPercent}%)`;
        }
      } catch (couponErr) {
        console.error("Failed to increment coupon usedCount in bot.ts:", couponErr);
      }
    }

    // Save purchase to history
    userDoc.purchaseHistory.push({
      productId,
      productName: finalProductName,
      price: Number(amount),
      transactionId: finalTxnId,
      utr: finalUtr,
      date: new Date(),
      status: 'Success'
    });

    userDoc.markModified('commonCredits');
    await userDoc.save();

    // 5. Clear state & Show Celebratory Success Message
    botShopStates.delete(userId);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const displayProductName = finalProductName || (productId === 'premium' ? '👑 Premium Subscription (Monthly)' : `💎 ${stateData.creditsCount || 10} Common Credits for ${productId}`);
    
    let subPerksInfo = "";
    if (isSubscription) {
      const expiryDate = userDoc.premiumExpiresAt ? new Date(userDoc.premiumExpiresAt) : null;
      const expiryStr = expiryDate 
        ? expiryDate.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : "Unlimited";
      subPerksInfo = `\n⏳ *Premium Expiry:* ${expiryStr}\n🚀 *Benefits:* Daily query quota limit bypassed + Special member privileges!`;
    } else {
      const currentBal = userDoc.commonCredits ? userDoc.commonCredits.get(productId) || 0 : 0;
      subPerksInfo = `\n🔋 *New Balance for ${productId}:* ${currentBal} Credits`;
    }

    const celebrationText = 
      `🎉 *Payment Verified successfully!* 🎉\n\n` +
      `Thank you! Your purchase has been activated:\n\n` +
      `📦 *Item:* ${displayProductName}\n` +
      `💰 *Price:* ₹${amount}\n` +
      `🆔 *Txn ID:* \`${finalTxnId}\`\n` +
      `💳 *UTR:* \`${finalUtr}\`${subPerksInfo}\n\n` +
      `✨ *You are ready to rock!* Enjoy your enhanced features.`;

    await ctx.reply(celebrationText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Go to Start Menu", callback_data: "view_start" }]]
      }
    });

  } catch (err: any) {
    console.error("UTR verification exception:", err);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(`❌ *Verification Service Error*\n\n${err.message || 'An error occurred during verification.'}\n\nPlease retry sending your Transaction ID / UTR or click cancel below:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]
        ]
      }
    });
  }
}

let bot: Telegraf | null = null;

if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
}

export function getBot() {
  return bot;
}

export async function isMemberOfChannel(channelId: string, telegramId: string): Promise<boolean> {
  if (!bot) return false;
  try {
    const cleanId = channelId.trim();
    // Use Number or String appropriately for chat ID
    const chatId = cleanId.startsWith('@') ? cleanId : Number(cleanId);
    const member = await bot.telegram.getChatMember(chatId, Number(telegramId));
    return member.status !== 'left' && member.status !== 'kicked';
  } catch (err: any) {
    console.error(`[Main Bot Channel check fail] For channel: ${channelId} and user: ${telegramId}:`, err.message);
    return false;
  }
}

export async function setupWebhook(url: string) {
  if (!bot) return { success: false, error: "Bot token not configured" };

  let appUrl = url?.replace(/\/$/, "");
  if (appUrl && !appUrl.startsWith("http")) {
    appUrl = "https://" + appUrl;
  }

  if (appUrl && appUrl.startsWith("https://")) {
    try {
      await bot.telegram.setWebhook(`${appUrl}/api/telegram/webhook`);
      console.log(`Telegram Webhook set to ${appUrl}/api/telegram/webhook`);
      return { success: true, url: `${appUrl}/api/telegram/webhook` };
    } catch (error: any) {
      console.error(
        "Failed to set Telegram webhook:",
        error.response?.data || error.message,
      );
      return { success: false, error: error.response?.data || error.message };
    }
  }
  return { success: false, error: "Invalid URL format (HTTPS required)" };
}

export async function initializeBot() {
  if (!bot) return;

  const rawAppUrl =
    process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (rawAppUrl) {
    await setupWebhook(rawAppUrl);
  } else {
    console.warn("Skipping auto-webhook setup. APP_URL is missing.");
  }

  async function executeApiCommand(
    ctx: any,
    userCommand: string,
    param: string,
    cmdDef: any,
    replyOptions: any,
    shouldIncrementCredit: boolean = false,
    isGroupOpt?: boolean,
  ) {
    let isGroup =
      isGroupOpt !== undefined
        ? isGroupOpt
        : ctx.chat &&
          (ctx.chat.type === "group" || ctx.chat.type === "supergroup");
    let groupDoc = null;
    let limitInlineButton: any = null;

    if (shouldIncrementCredit && ctx.from?.id) {
      let uDoc = await BotUser.findOne({ telegramId: String(ctx.from.id) });
      if (uDoc) {
        const today = new Date().toISOString().split("T")[0];
        let usageIndex = uDoc.commandUsage?.findIndex(
          (u: any) => u.command === userCommand,
        );
        if (usageIndex !== undefined && usageIndex >= 0) {
          if (uDoc.commandUsage[usageIndex].lastResetDate !== today) {
            uDoc.commandUsage[usageIndex].used = 1;
            uDoc.commandUsage[usageIndex].lastResetDate = today;
          } else {
            uDoc.commandUsage[usageIndex].used += 1;
          }
        } else {
          if (!uDoc.commandUsage) uDoc.commandUsage = [];
          uDoc.commandUsage.push({
            command: userCommand,
            used: 1,
            lastResetDate: today,
          });
        }
        // Inform Mongoose that array has changed
        uDoc.markModified("commandUsage");
        await uDoc
          .save()
          .catch((e: any) => console.log("Err saving usage:", e.message));
      }
    }

    if (isGroup && ctx.chat?.id) {
      groupDoc = await BotGroup.findOne({ telegramId: String(ctx.chat.id) });
      if (groupDoc) {
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const today = new Date(Date.now() + istOffsetMs)
          .toISOString()
          .split("T")[0];

        // Check Main Group (Encore)
        const isMainGroup =
          String(ctx.chat.username).toLowerCase() === "encorexg";
        if (isMainGroup) {
          await groupDoc.save();
        } else {
          // Try mapping owner
          if (!groupDoc.ownerId) {
            try {
              const chatAdmins = await ctx.telegram.getChatAdministrators(
                ctx.chat.id,
              );
              const creator = chatAdmins.find(
                (a: any) => a.status === "creator",
              );
              if (creator) groupDoc.ownerId = String(creator.user.id);
            } catch (e) {} // silent fail if bot has no rights
          }

          let limitCheckedByOwner = false;
          let ownerUsed = 0;
          let ownerLimit = 50;
          let isOwnerUnlimited = false;
          let ownerDocToSave: any = null;

          if (groupDoc.ownerId) {
            // get global settings
            const defaultGrpCredSetting = await Setting.findOne({
              key: "defaultGroupCredits",
            });
            let defaultCredits =
              defaultGrpCredSetting && defaultGrpCredSetting.value != null
                ? Number(defaultGrpCredSetting.value)
                : 50;
            ownerLimit = defaultCredits;

            let ownerDoc = await BotUser.findOne({
              telegramId: groupDoc.ownerId,
            });
            if (!ownerDoc) {
              ownerDoc = await BotUser.create({ telegramId: groupDoc.ownerId });
            }

            if (ownerDoc) {
              limitCheckedByOwner = true;
              ownerDocToSave = ownerDoc;
              isOwnerUnlimited = ownerDoc.isGroupUnlimited || false;

              if (
                ownerDoc.groupCreditsLimit !== undefined &&
                ownerDoc.groupCreditsLimit !== null
              ) {
                ownerLimit = ownerDoc.groupCreditsLimit;
              }

              if (ownerDoc.groupCreditsLastReset !== today) {
                ownerDoc.groupCreditsUsed = 0;
                ownerDoc.groupCreditsLastReset = today;
              }
              ownerUsed = ownerDoc.groupCreditsUsed || 0;
            }
          }

          let limitReached = false;
          let currentUsed = 0;
          let currentLimit = ownerLimit;

          if (!groupDoc.isUnlimited && !isOwnerUnlimited) {
            if (limitCheckedByOwner) {
              currentUsed = ownerUsed;
              currentLimit = ownerLimit;
              if (ownerUsed >= ownerLimit) limitReached = true;
            } else {
              // Fallback legacy behavior
              if (groupDoc.lastResetDate !== today) {
                groupDoc.dailyUsed = 0;
                groupDoc.lastResetDate = today;
              }
              currentUsed = groupDoc.dailyUsed;
              currentLimit = groupDoc.dailyLimit;
              if (groupDoc.dailyUsed >= groupDoc.dailyLimit)
                limitReached = true;
            }
          }

          if (limitReached) {
            await ctx
              .reply(
                `⚠️ *Daily Group Limit Reached*\n\nThis group (or its owner) has used all ${currentLimit} daily group searches. Please wait for tomorrow or contact an admin to increase the limit!`,
                {
                  parse_mode: "Markdown",
                  ...replyOptions,
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: "Contact Admin",
                          url: "https://t.me/modifucker",
                          style: "success",
                        } as any,
                      ],
                    ],
                  },
                },
              )
              .catch(() => {});
            await groupDoc.save();
            return; // Block
          }

          if (limitCheckedByOwner && ownerDocToSave) {
            ownerDocToSave.groupCreditsUsed = ownerUsed + 1;
            await ownerDocToSave
              .save()
              .catch((e: any) =>
                console.log("Err saving owner doc:", e.message),
              );
            limitInlineButton = {
              text: `${ownerUsed + 1}/${ownerLimit} owner group credits used!`,
              callback_data: "limit_info",
              style: "danger",
            };
          } else {
            groupDoc.dailyUsed += 1;
            limitInlineButton = {
              text: `${groupDoc.dailyUsed}/${groupDoc.dailyLimit} group searches used!`,
              callback_data: "limit_info",
              style: "danger",
            };
          }
          await groupDoc.save();
        }
      }
    }

    let apiResponseText = "";
    if (cmdDef.isApi && cmdDef.apiUrl) {
      let finalUrl = cmdDef.apiUrl;

      if (finalUrl.includes("{param}") && !param) {
        await ctx
          .reply(
            `⚠️ *Missing Parameter*\n\nPlease provide the required parameter.\nUsage: \`${userCommand} <value>\``,
            replyOptions,
          )
          .catch(() => {});
        return;
      }

      if (param)
        finalUrl = finalUrl.replace("{param}", encodeURIComponent(param));

      try {
        const res = await axios.get(finalUrl, { timeout: 15000 });
        if (typeof res.data === "object") {
          apiResponseText = JSON.stringify(res.data, null, 2);
        } else {
          apiResponseText = String(res.data);
        }
      } catch (e: any) {
        apiResponseText = `Error fetching data: ${e.response?.status ? `Status ${e.response.status}` : e.message}`;
      }
    }

    let finalText = cmdDef.decoratedMessage || "{{api.response}}";
    finalText = finalText.replace(/\\n/g, "\n");
    finalText = finalText.replace(/\{\{api\.response\}\}/g, apiResponseText);

    let inlineButtonsList = [];
    if (cmdDef.inlineButtons && cmdDef.inlineButtons.length > 0) {
      for (let b of cmdDef.inlineButtons) {
        if (b.label && b.url)
          inlineButtonsList.push([{ text: b.label, url: b.url, style: "primary" } as any]);
      }
    }

    if (limitInlineButton) {
      inlineButtonsList.push([limitInlineButton]);
    }

    if (!isGroup) {
      inlineButtonsList.push([
        { text: "🔙 Back to Start", callback_data: "view_start", style: "danger" } as any,
      ]);
    }

    let sentMsg;
    try {
      if (finalText.length > 4000) {
        const buffer = Buffer.from(finalText, "utf-8");
        sentMsg = await ctx.replyWithDocument(
          { source: buffer, filename: `${param ? param : "result"}.txt` },
          {
            caption:
              "⚠️ Response is too large and has been converted to a file.",
            ...replyOptions,
            ...(inlineButtonsList.length > 0 &&
              Markup.inlineKeyboard(inlineButtonsList)),
          },
        );
      } else {
        sentMsg = await ctx.reply(finalText, {
          ...replyOptions,
          ...(inlineButtonsList.length > 0 &&
            Markup.inlineKeyboard(inlineButtonsList)),
        });
      }
    } catch (e: any) {
      console.warn(
        `[executeApiCommand] Primary reply failed (maybe invalid reply Options). Trying fallback without reply_parameters...`,
        e.message,
      );
      // Fallback keeping parse_mode but dropping the reply_parameters which probably failed
      const fallbackOptions = { parse_mode: "Markdown" as const };
      try {
        if (finalText.length > 4000) {
          const buffer = Buffer.from(finalText, "utf-8");
          sentMsg = await ctx.replyWithDocument(
            { source: buffer, filename: `${param ? param : "result"}.txt` },
            {
              caption:
                "⚠️ Response is too large and has been converted to a file.",
              ...fallbackOptions,
              ...(inlineButtonsList.length > 0 &&
                Markup.inlineKeyboard(inlineButtonsList)),
            },
          );
        } else {
          sentMsg = await ctx.reply(finalText, {
            ...fallbackOptions,
            ...(inlineButtonsList.length > 0 &&
              Markup.inlineKeyboard(inlineButtonsList)),
          });
        }
      } catch (err2: any) {
        console.warn(
          `[executeApiCommand] Secondary fallback failed, formatting might be broken:`,
          err2.message,
        );
        // Absolute last resort without any parse mode formatting at all
        if (finalText.length > 4000) {
          const buffer = Buffer.from(finalText, "utf-8");
          sentMsg = await ctx.replyWithDocument(
            { source: buffer, filename: `${param ? param : "result"}.txt` },
            {
              caption:
                "⚠️ Response is too large and has been converted to a file.",
              ...(inlineButtonsList.length > 0 &&
                Markup.inlineKeyboard(inlineButtonsList)),
            },
          );
        } else {
          sentMsg = await ctx.reply(finalText, {
            ...(inlineButtonsList.length > 0 &&
              Markup.inlineKeyboard(inlineButtonsList)),
          });
        }
      }
    }

    Statlog.create({
      commandName: userCommand,
      telegramId: String(ctx.from?.id),
      isGroup:
        isGroupOpt !== undefined
          ? isGroupOpt
          : ctx.chat?.type === "group" || ctx.chat?.type === "supergroup",
      paramValue: param || undefined,
      apiResponse: apiResponseText || undefined,
    }).catch(() => {});

    if (cmdDef.autoDeleteMs && cmdDef.autoDeleteMs > 0 && sentMsg) {
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat?.id, sentMsg.message_id);
        } catch (err) {
          console.error("Auto delete failed", err);
        }
      }, cmdDef.autoDeleteMs * 1000);
    }
  }

  // Intercept ctx.reply and ctx.replyWithDocument to handle missing message to reply to
  bot.use(async (ctx, next) => {
    const originalReply = ctx.reply;
    if (originalReply) {
      ctx.reply = async function (this: any, text: any, extra: any) {
        try {
          return await originalReply.call(this, text, extra);
        } catch (err: any) {
          if (err.message && err.message.includes("message to be replied not found")) {
            console.warn("[Telegraf Reply Interceptor] message to be replied not found, retrying without reply parameters...");
            const cleanExtra = { ...extra };
            delete cleanExtra.reply_parameters;
            delete cleanExtra.reply_to_message_id;
            return await originalReply.call(this, text, cleanExtra);
          }
          throw err;
        }
      };
    }
    const originalReplyWithDocument = ctx.replyWithDocument;
    if (originalReplyWithDocument) {
      ctx.replyWithDocument = async function (this: any, doc: any, extra: any) {
        try {
          return await originalReplyWithDocument.call(this, doc, extra);
        } catch (err: any) {
          if (err.message && err.message.includes("message to be replied not found")) {
            console.warn("[Telegraf ReplyWithDocument Interceptor] message to be replied not found, retrying without reply parameters...");
            const cleanExtra = { ...extra };
            delete cleanExtra.reply_parameters;
            delete cleanExtra.reply_to_message_id;
            return await originalReplyWithDocument.call(this, doc, cleanExtra);
          }
          throw err;
        }
      };
    }
    return next();
  });

  // Middleware to track users & groups and check bans
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return next();

    try {
      const isGroup =
        ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      const telegramId = String(ctx.chat.id);

      if (isGroup) {
        let group = await BotGroup.findOne({ telegramId });
        if (!group) {
          group = await BotGroup.create({ telegramId, title: ctx.chat.title });
        }
        if (group.isBanned) return; // Silent drop if banned
        group.interactions += 1;
        try {
          const mCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
          group.memberCount = mCount || 0;
        } catch (e) {}
        await group.save();

        // Also grab user if they speak in group to check for ban
        if (ctx.from) {
          let u = await BotUser.findOne({ telegramId: String(ctx.from.id) });
          if (u && u.isBanned) return;
        }
      } else {
        let user = await BotUser.findOne({ telegramId: String(ctx.from?.id) });
        if (!user && ctx.from) {
          user = await BotUser.create({
            telegramId: String(ctx.from.id),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            hasStartedBot: true, // they started it in private
          });
        }
        if (user && user.isBanned) return;
        if (user) {
          user.interactions += 1;
          if (!user.hasStartedBot) user.hasStartedBot = true; // Ensure they are marked started
          await user.save();
        }
      }
    } catch (e) {
      console.error("Error tracking user/group", e);
    }

    return next();
  });

  // Global Bot Maintenance Check Middleware
  bot.use(async (ctx, next) => {
    // Only intercept messages or callback queries
    if (!ctx.message && !ctx.callbackQuery) {
      return next();
    }

    try {
      const setting = await Setting.findOne({ key: 'botMaintenanceMode' });
      if (setting && setting.value === true) {
        // Admins bypass maintenance mode to allow configuration/updates
        const userId = ctx.from?.id;
        if (userId) {
          const userDoc = await BotUser.findOne({ telegramId: String(userId) });
          if (userDoc && userDoc.isAdmin) {
            return next();
          }
        }

        const maintenanceText = "⚠️ *Bot is on maintenance! This service is suspended temporary!*";
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery("⚠️ Bot is on maintenance! This service is suspended temporary!", { show_alert: true }).catch(() => {});
          return;
        } else {
          await ctx.reply(maintenanceText, { parse_mode: "Markdown" }).catch(() => {});
          return;
        }
      }
    } catch (err) {
      console.error("Error in bot maintenance middleware", err);
    }
    return next();
  });

  bot.action(/^block_admin_login:(.+)$/, async (ctx) => {
    const otpCode = ctx.match ? ctx.match[1] : '';
    try {
      const { handleBlockAdminLoginFromTelegram } = await import("./api.js");
      const res = await handleBlockAdminLoginFromTelegram(otpCode);

      await ctx.answerCbQuery(
        "🚨 LOGIN ATTEMPT BLOCKED!\nThe OTP has been invalidated and the requesting IP has been locked for 24 hours.",
        { show_alert: true }
      ).catch(() => {});

      const blockedIpText = res.blockedIp ? `\n🌐 *Blocked IP:* \`${res.blockedIp}\`` : '';
      await ctx.editMessageText(
        `⛔ *LOGIN ATTEMPT BLOCKED BY ADMIN*\n\nThis admin login request has been **REJECTED AND BLOCKED** by Admin.${blockedIpText}\n\n• OTP code invalidated\n• Requesting IP address locked for 24 hours`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    } catch (err: any) {
      console.error("Error in block_admin_login callback handler:", err);
      await ctx.answerCbQuery("Error processing block request.", { show_alert: true }).catch(() => {});
    }
  });

  bot.action("limit_info", async (ctx) => {
    return ctx
      .answerCbQuery(
        "This is the daily group search limit. Contact an admin to upgrade!",
        { show_alert: true },
      )
      .catch(() => {});
  });

  bot.action(/^check_sub:(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    console.log(`[check_sub] Action triggered with ID: ${actionId}`);

    try {
      const pending = await PendingAction.findOne({ actionId });
      if (!pending) {
        console.log(`[check_sub] Pending action not found for ID: ${actionId}`);
        return ctx.answerCbQuery(
          "Session expired. Please run the command again!",
          { show_alert: true },
        );
      }

      // Authorization guard: Make sure the guy clicking is the guy who ran it!
      if (String(ctx.from?.id) !== pending.telegramId) {
        console.log(
          `[check_sub] Auth guard failed: ${ctx.from?.id} vs ${pending.telegramId}`,
        );
        return ctx.answerCbQuery(
          "⚠️ This button is not for you! Please run your own command.",
          { show_alert: true },
        );
      }

      let forceChannelsSetting = await Setting.findOne({
        key: "forceChannels",
      });
      let requiredChannels = forceChannelsSetting?.value || [];
      console.log(`[check_sub] Required channels:`, requiredChannels);

      let notJoined: any[] = [];
      if (requiredChannels.length > 0 && ctx.from) {
        for (const channel of requiredChannels) {
          const channelId = typeof channel === "string" ? channel : channel.id;
          try {
            const member = await ctx.telegram.getChatMember(
              channelId,
              ctx.from.id,
            );
            if (member.status === "left" || member.status === "kicked") {
              notJoined.push(channel);
            }
          } catch (e) {
            notJoined.push(channel);
          }
        }
      }

      if (notJoined.length > 0) {
        console.log(
          `[check_sub] User still not joined. Channels missed:`,
          notJoined,
        );
        return ctx.answerCbQuery("You have NOT joined all required channels!", {
          show_alert: true,
        });
      }

      // User has joined! Clear the forced message
      console.log(`[check_sub] All channels joined. Executing...`);
      await ctx.answerCbQuery("Verification successful! Processing...");

      try {
        await ctx.deleteMessage();
      } catch (e) {
        console.log(
          `[check_sub] Could not delete original message, continuing anyway.`,
          e,
        );
      }

      const cmdDef = await Command.findOne({ command: pending.command });
      if (!cmdDef) {
        console.log(
          `[check_sub] Command definition not found: ${pending.command}`,
        );
        return;
      }
      // Use reply_to_message_id for older telegraf, and reply_parameters for new APIs. We include both to be safe.
      const replyOptions = {
        parse_mode: "Markdown",
        reply_to_message_id: pending.messageId, // standard telegraf way
        reply_parameters: pending.messageId
          ? { message_id: pending.messageId }
          : undefined,
      };

      const userDoc = await BotUser.findOne({
        telegramId: String(ctx.from?.id),
      });
      const shouldIncrementCredit =
        cmdDef.isCreditBased && (!userDoc || !userDoc.isAdmin);

      await executeApiCommand(
        ctx,
        pending.command,
        pending.param || "",
        cmdDef,
        replyOptions,
        shouldIncrementCredit,
      );
      console.log(`[check_sub] API Command executed via callback.`);
    } catch (err) {
      console.error("[check_sub] Fatal Error:", err);
      await ctx
        .answerCbQuery("Error verifying subscriptions. Try again.")
        .catch(() => {});
    }
  });

  async function showHelp(ctx: any) {
    try {
      const isGroup =
        ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
      const replyOptions: any = { parse_mode: "Markdown" };
      if (!ctx.callbackQuery && ctx.message)
        replyOptions.reply_parameters = { message_id: ctx.message.message_id };

      if (!isGroup) {
        const commands = await Command.find({});
        const defaultGrpCredSetting = await Setting.findOne({
          key: "defaultGroupCredits",
        });
        const defaultCredits =
          defaultGrpCredSetting?.value != null
            ? Number(defaultGrpCredSetting.value)
            : 50;

        let txt = "🤖 *How to use ENCORE XOSINT*\n\n";
        txt +=
          "This bot provides various advanced search and utility commands. \n\n";

        txt += "📊 *Command Types*\n";
        txt +=
          "🟢 *Normal (Free):* Free to use without any credit restrictions.\n";
        txt +=
          "⚡️ *Credit-Based:* You have a limited number of daily uses for these specific commands.\n";
        txt += "💎 *Premium:* Exclusive commands for paid users only.\n\n";

        txt += "👥 *Group Credits System*\n";
        txt += `If you add this bot to your own groups, there is a global limit of ${defaultCredits} group searches per day. This limit is tied to YOU as the owner and is shared across ALL your groups combined.\n\n`;

        txt +=
          "✨ Use `/profile` to check your exact global/command credit usage.\n\n";

        txt +=
          "↗️ *Join our Main Group:* [ENCOREX GROUP](https://t.me/encorexg)\n\n";

        txt += "⚡️ *Available Commands*\n\n";
        for (const c of commands) {
          let icon = "🟢";
          if (c.isPremium) icon = "💎";
          else if (c.isCreditBased) icon = "⚡️";
          txt += `${icon} \`${c.command}\` - ${c.description || "No description"}\n`;
        }

        const markup = {
          inline_keyboard: [
            [{ text: "🔙 Back to Start", callback_data: "view_start", style: "danger" } as any],
          ],
        };

        if (ctx.callbackQuery && ctx.callbackQuery.message) {
          await ctx.editMessageText(txt, {
            ...replyOptions,
            link_preview_options: { is_disabled: true },
            reply_markup: markup,
          });
        } else {
          await ctx.reply(txt, {
            ...replyOptions,
            link_preview_options: { is_disabled: true },
            reply_markup: markup,
          });
        }
      } else {
        await ctx.reply(
          "Please message me in private with `/help` for a full list of commands and instructions!",
          replyOptions,
        );
      }
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.log("Help error:", e.message);
      if (ctx.callbackQuery)
        await ctx.answerCbQuery("Error loading help").catch(() => ({}));
    }
  }

  async function showProfile(ctx: any) {
    try {
      if (ctx.chat?.type !== "private") {
        const replyOpts = ctx.callbackQuery
          ? {}
          : { reply_parameters: { message_id: ctx.message.message_id } };
        return await ctx.reply(
          "Please use this command in private chat.",
          replyOpts,
        );
      }

      const userId = String(ctx.from.id);
      let userDoc = await BotUser.findOne({ telegramId: userId });
      if (!userDoc) {
        userDoc = await BotUser.create({
          telegramId: userId,
          firstName: ctx.from.first_name,
        });
      }

      const defaultGrpCredSetting = await Setting.findOne({
        key: "defaultGroupCredits",
      });
      let defaultGrpCredits =
        defaultGrpCredSetting?.value != null
          ? Number(defaultGrpCredSetting.value)
          : 50;

      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const today = new Date(Date.now() + istOffsetMs)
        .toISOString()
        .split("T")[0];

      let grpLimit =
        userDoc.groupCreditsLimit !== undefined &&
        userDoc.groupCreditsLimit !== null
          ? userDoc.groupCreditsLimit
          : defaultGrpCredits;
      let grpUsed =
        userDoc.groupCreditsLastReset === today
          ? userDoc.groupCreditsUsed || 0
          : 0;
      let grpStatus = userDoc.isGroupUnlimited
        ? "Unlimited"
        : `${grpUsed}/${grpLimit} used`;

      let activeTierName = "Premium";
      if (userDoc.premiumTier) {
        try {
          const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
          if (tiersSetting && Array.isArray(tiersSetting.value)) {
            const matched = tiersSetting.value.find((t: any) => t.id === userDoc.premiumTier);
            if (matched) activeTierName = matched.name;
          }
        } catch (e) {}
      }

      let profileText = `👤 *Your Profile*\n\n`;
      profileText += `🔑 *Telegram ID:* \`${userId}\`\n`;
      profileText += `👑 *Role:* ${userDoc.isAdmin ? "Admin" : userDoc.isPremium ? `Premium (${activeTierName})` : "Free User"}\n`;
      if (userDoc.isPremium) {
        const expiryDate = userDoc.premiumExpiresAt ? new Date(userDoc.premiumExpiresAt) : null;
        const expiryStr = expiryDate 
          ? expiryDate.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : "Unlimited";
        profileText += `⏳ *Premium Expiry:* \`${expiryStr}\`\n`;
      }
      profileText += `💰 *ENC Coins:* ${userDoc.encCoins || 0}\n\n`;

      profileText += `👥 *Personal Group Credits (Daily)*\n`;
      profileText += `• ${grpStatus}\n\n`;

      const creditCmds = await Command.find({ isCreditBased: true });
      if (creditCmds.length > 0) {
        profileText += `⚡️ *Command Credits*\n`;
        for (const cmd of creditCmds) {
          let override = userDoc.commandCredits?.find(
            (c: any) => c.command === cmd.command,
          );
          let usage = userDoc.commandUsage?.find(
            (u: any) => u.command === cmd.command,
          );
          let usedToday =
            usage && usage.lastResetDate === today ? usage.used : 0;
          let limit = override ? override.dailyLimit : cmd.defaultDailyCredits;
          let isUnlimited = override ? override.isUnlimited : false;
          let cmdStat = isUnlimited ? "Unlimited" : `${usedToday}/${limit}`;

          const commonBalance = userDoc.commonCredits
            ? userDoc.commonCredits.get(cmd.command) || 0
            : 0;
          profileText += `• \`${cmd.command}\`: Daily: \`${cmdStat}\` | Additional: *${commonBalance}*\n`;
        }
      }

      // If this is from a callback edit message, otherwise reply
      const appUrl = getAppUrl();

      const earnButton = {
        text: "💸 Earn ENC",
        url: `https://t.me/${ctx.botInfo?.username || "bot"}?start=earn`,
        style: "success",
      };

      const replyMarkup = {
        inline_keyboard: [
          [earnButton as any],
          [
            {
              text: "➕ Add Bot to Group",
              url: `https://t.me/${ctx.botInfo?.username || "bot"}?startgroup=true`,
              style: "primary",
            } as any,
          ],
          [
            {
              text: "📊 My Groups Stats",
              callback_data: "view_my_groups",
              style: "success",
            } as any,
          ],
          [
            {
              text: "📜 Purchase History",
              callback_data: "view_purchase_history",
              style: "success",
            } as any,
          ],
          [{ text: "🔙 Back to Main", callback_data: "view_start", style: "danger" } as any],
        ],
      };

      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.editMessageText(profileText, {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });
      } else {
        await ctx.reply(profileText, {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
          reply_parameters: ctx.message
            ? { message_id: ctx.message.message_id }
            : undefined,
        });
      }

      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.log("Profile error:", e.message);
      if (ctx.callbackQuery)
        await ctx.answerCbQuery("Error loading profile").catch(() => ({}));
    }
  }

  bot.action("view_profile", showProfile);

  bot.action("view_purchase_history", async (ctx) => {
    try {
      const userId = String(ctx.from?.id);
      const userDoc = await BotUser.findOne({ telegramId: userId });
      if (!userDoc) {
        await ctx.answerCbQuery("User profile not found").catch(() => ({}));
        return;
      }

      let histText = "📜 *Your Purchase History* 📜\n\n";
      const history = userDoc.purchaseHistory || [];

      if (history.length === 0) {
        histText += "ℹ️ _You haven't made any purchases yet. Use_ /shop _to unlock premium tools!_";
      } else {
        const sortedHistory = [...history].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
        
        sortedHistory.forEach((item: any, idx: number) => {
          const dateStr = item.date ? new Date(item.date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "N/A";
          histText += `*${idx + 1}. ${item.productName || item.productId}*\n`;
          histText += `   📅 Date: \`${dateStr}\` | 💰 Price: *₹${item.price}*\n`;
          histText += `   🆔 UTR: \`${item.utr || item.transactionId || 'Completed'}\`\n\n`;
        });
        
        if (history.length > 8) {
          histText += `_Showing latest 8 of ${history.length} transactions._`;
        }
      }

      await ctx.editMessageText(histText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 Back to Profile", callback_data: "view_profile" }],
            [{ text: "🔙 Go to Start Menu", callback_data: "view_start" }]
          ]
        }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err: any) {
      console.error("Purchase history action err:", err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading purchase history").catch(() => ({}));
    }
  });

  bot.action("view_my_groups", async (ctx) => {
    try {
      const userId = String(ctx.from?.id);
      const groups = await BotGroup.find({ ownerId: userId }).sort({
        interactions: -1,
      });

      if (groups.length === 0) {
        await ctx
          .answerCbQuery("You have not added the bot to any groups yet.", {
            show_alert: true,
          })
          .catch(() => ({}));
        return;
      }

      let txt = `🏰 *Your Groups*\n\n`;

      groups.forEach((g: any, i: number) => {
        txt += `${i + 1}. *${g.title || "Unknown Group"}*\n`;
        txt += `   └ ID: \`${g.telegramId}\`\n`;

        const used = g.dailyUsed || 0;
        const limit = g.dailyLimit || 50;
        txt += `   └ Daily Used: ${used} / ${limit}\n`;

        // Generate an inline text-based progress bar
        const ratio = limit > 0 ? used / limit : 0;
        const filledBars = Math.min(Math.max(Math.round(ratio * 10), 0), 10);
        const emptyBars = 10 - filledBars;
        const barStr = "█".repeat(filledBars) + "░".repeat(emptyBars);
        const percentage = Math.round(ratio * 100);

        txt += `   └ Usage: \`${barStr}\` ${percentage}%\n`;
        txt += `   └ Total Interactions: ${g.interactions}\n\n`;
      });

      await ctx.editMessageText(txt, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: false },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Back to Profile",
                callback_data: "view_profile",
                style: "danger",
              } as any,
            ],
          ],
        },
      });
      await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.log("My Groups error:", e.message);
      await ctx.answerCbQuery("Error loading groups").catch(() => ({}));
    }
  });

  bot.action("view_help", showHelp);

  bot.action("view_start", async (ctx) => {
    try {
      const isGroup =
        ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
      if (!isGroup) {
        const appUrl = getAppUrl();
        const isAdminUser = isBotSuperAdmin(ctx.from?.id);
        const buttons: any[] = [
          [{ text: "👤 My Profile", callback_data: "view_profile", style: "success" } as any],
          [{ text: "🤖 MAKE YOUR OWN BOT", web_app: { url: `${appUrl}/mirrors` } } as any],
          [{ text: "🛍️ Bot Shop (New)", callback_data: "view_shop", style: "success" } as any],
          [{ text: "ℹ️ Help Center", callback_data: "view_help", style: "primary" } as any],
        ];

        // Insert Admin Panel button visible ONLY to the two super admins
        if (isAdminUser) {
          buttons.splice(2, 0, [{ text: "👑 Admin Panel", callback_data: "admin_main_menu" } as any]);
        }

        const markup = {
          inline_keyboard: buttons,
        };
        const txt =
          "✨ *Welcome to ENCORE XOSINT* ✨\n\n✅ *Status:* Bot is fully operational.\n\nYou can get multiple information using this bot. Try exploring some commands or use /help to see how it works!";
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
          await ctx.editMessageText(txt, {
            parse_mode: "Markdown",
            reply_markup: markup,
          });
        } else {
          await ctx.reply(txt, {
            parse_mode: "Markdown",
            reply_markup: markup,
          });
        }
      }
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.log("Start error:", e.message);
      if (ctx.callbackQuery)
        await ctx.answerCbQuery("Error loading start").catch(() => ({}));
    }
  });

  bot.action("view_shop", showBotShopMenu);

  bot.action("shop_sub_tier_menu", async (ctx) => {
    try {
      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
      
      let buttons: any[] = [];
      if (tiers.length > 0) {
        buttons = tiers.map((t: any) => [
          { text: `👑 ${t.name} — ₹${t.price}/mo`, callback_data: `shop_sub_details:${t.id}` }
        ]);
      } else {
        buttons.push([
          { text: "👑 Premium VIP Subscription — ₹80/mo", callback_data: "shop_sub_details:premium" }
        ]);
      }
      buttons.push([{ text: "🔙 Back to Shop", callback_data: "view_shop" }]);

      const messageText = `👑 *Subscription Plans* 👑\n\nChoose a plan to view details and upgrade:`;

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err) {
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    }
  });

  bot.action(/^shop_sub_details:(.+)$/, async (ctx) => {
    try {
      const tierId = ctx.match[1];
      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
      
      let matchedTier = tiers.find((t: any) => t.id === tierId);
      
      if (!matchedTier && tierId === 'premium') {
        const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
        const shopSettings = shopSettingsSetting?.value || {};
        matchedTier = {
          id: 'premium',
          name: 'Bot Paid Subscription',
          price: shopSettings.premiumMonthlyPrice || 80,
          discountPercent: shopSettings.premiumDiscountPercent || 15,
          commands: [],
        };
      }

      if (!matchedTier) {
        await ctx.answerCbQuery("Subscription tier not found.").catch(() => ({}));
        return;
      }

      let perksText = "";
      if (Array.isArray(matchedTier.commands) && matchedTier.commands.length > 0) {
        perksText = "\n🎁 *Additional bonus credits granted with this plan:*\n";
        matchedTier.commands.forEach((tc: any) => {
          if (tc.bonusCommonCredits > 0) {
            perksText += `• *+${tc.bonusCommonCredits}* common credits for \`${tc.command}\`\n`;
          }
        });
      }

      let messageText = `👑 *${matchedTier.name}* 👑\n\n` +
        `💰 *Subscription billing rate:* ₹${matchedTier.price} per month\n` +
        `🔥 *VIP Discount:* Flat *${matchedTier.discountPercent}% OFF* on all separate command credit packages!\n` +
        perksText +
        `\n*Membership Benefits:*\n` +
        `• Bypasses all chat rate quotas.\n` +
        `• Grants access to run high-speed API search commands on private chats.\n` +
        `• Unlocks special status branding on your profile.\n\n` +
        `Would you like to subscribe to this plan?`;

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💳 BUY NOW", callback_data: `shop_sub_buy:${matchedTier.id}` },
              { text: "🔙 BACK", callback_data: "shop_sub_tier_menu" }
            ]
          ]
        }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.error(e);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading details").catch(() => ({}));
    }
  });

  bot.action(/^shop_sub_buy:(.+)$/, async (ctx) => {
    try {
      const tierId = ctx.match[1];
      const userId = String(ctx.from?.id);

      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
      let matchedTier = tiers.find((t: any) => t.id === tierId);

      if (!matchedTier && tierId === 'premium') {
        const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
        const shopSettings = shopSettingsSetting?.value || {};
        matchedTier = {
          id: 'premium',
          name: 'Bot Paid Subscription',
          price: shopSettings.premiumMonthlyPrice || 80,
          discountPercent: shopSettings.premiumDiscountPercent || 15,
          commands: [],
        };
      }

      if (!matchedTier) {
        await ctx.answerCbQuery("Plan not found.").catch(() => ({}));
        return;
      }

      const originalAmount = matchedTier.price;

      // Set state to awaiting Coupon input
      botShopStates.set(userId, {
        state: 'awaiting_coupon',
        type: 'sub',
        productId: matchedTier.id,
        amount: originalAmount,
        originalAmount: originalAmount
      });

      const promptText = `🎫 *Subscription Checkout: ${matchedTier.name}*\n\n` +
        `💰 *Original Price:* ₹${originalAmount}\n\n` +
        `Do you have a *promo code / coupon code* for a discount?\n\n` +
        `👉 If yes, please **type and send the coupon code** right now in chat (e.g. *WELCOME50*).\n` +
        `👉 If no, please click *Skip Coupon* below to proceed directly with original pricing.`;

      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
      }

      await ctx.reply(promptText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⏭️ Skip Coupon", callback_data: "shop_skip_coupon" }],
            [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
          ]
        }
      });

      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.error(e);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error initiating checkout").catch(() => ({}));
    }
  });

  bot.action("shop_skip_coupon", async (ctx) => {
    try {
      const userId = String(ctx.from?.id);
      const stateData = botShopStates.get(userId);

      if (!stateData || stateData.state !== 'awaiting_coupon') {
        await ctx.answerCbQuery("Checkout expired or invalid session.").catch(() => ({}));
        return;
      }

      // Load original plan price & details
      const tierId = stateData.productId;
      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
      let matchedTier = tiers.find((t: any) => t.id === tierId);

      if (!matchedTier && tierId === 'premium') {
        const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
        const shopSettings = shopSettingsSetting?.value || {};
        matchedTier = {
          id: 'premium',
          name: 'Bot Paid Subscription',
          price: shopSettings.premiumMonthlyPrice || 80,
          discountPercent: shopSettings.premiumDiscountPercent || 15,
          commands: [],
        };
      }

      if (!matchedTier) {
        await ctx.reply("❌ Error: Subscription tier not found.");
        botShopStates.delete(userId);
        return;
      }

      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
      }

      // Generate checkout without coupon
      await generateSubCheckoutMessage(ctx, userId, matchedTier, stateData.originalAmount || matchedTier.price);
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err) {
      console.error(err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Checkout error").catch(() => ({}));
    }
  });

  bot.action("shop_credits_menu", async (ctx) => {
    try {
      const commands = await Command.find({ pricePerCredit: { $gt: 0 } });
      
      let buttons: any[] = [];
      if (commands.length > 0) {
        buttons = commands.map((cmd: any) => [
          { text: `⚡ ${cmd.command} (₹${cmd.pricePerCredit}/credit)`, callback_data: `shop_credit_details:${cmd.command}` }
        ]);
      } else {
        const defaultCmds = await Command.find().limit(10);
        buttons = defaultCmds.map((cmd: any) => [
          { text: `⚡ ${cmd.command}`, callback_data: `shop_credit_details:${cmd.command}` }
        ]);
      }
      buttons.push([{ text: "🔙 Back to Shop", callback_data: "view_shop" }]);

      const messageText = `⚡ *Buy Command Credits* ⚡\n\nSelect a command pack to purchase daily credits:`;

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err) {
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    }
  });

  bot.action(/^shop_credit_details:(.+)$/, async (ctx) => {
    try {
      const cmdName = ctx.match[1];
      const cmd = await Command.findOne({ command: cmdName });

      if (!cmd) {
        await ctx.answerCbQuery("Command pack not found.").catch(() => ({}));
        return;
      }

      const minLimit = cmd.minPurchaseCredits || 10;
      const pricePer = cmd.pricePerCredit || 0.5;

      let messageText = `⚡ *Credits Pack Details for ${cmd.command}* ⚡\n\n` +
        `📝 *Usage:* ${cmd.description || 'Allows running API lookup queries'}\n` +
        `💰 *Standard Rate:* ₹${pricePer} / Credit\n` +
        `📥 *Minimum Order Limit:* ${minLimit} Credits\n\n` +
        `Please send me the **number of credits** you want to buy. It must be at least *${minLimit}*:\n` +
        `_(Type any positive integer number and click send)_`;

      const userId = String(ctx.from?.id);
      botShopStates.set(userId, {
        state: 'awaiting_credit_qty',
        type: 'credits',
        productId: cmd.command,
        amount: 0
      });

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: "shop_cancel_payment" }]
          ]
        }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.error(e);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading package details").catch(() => ({}));
    }
  });

  bot.action("shop_cancel_payment", async (ctx) => {
    const userId = String(ctx.from?.id);
    botShopStates.delete(userId);
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
    }
    await ctx.reply("❌ Payment checkout canceled. Returning to shop menu...");
    await showBotShopMenu(ctx);
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // ==========================================
  // IN-BOT SUPER ADMIN PANEL ACTIONS & ROUTERS
  // ==========================================
  bot.action("admin_main_menu", async (ctx) => {
    try {
      await showAdminMainMenu(ctx);
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err: any) {
      console.error("Admin main menu error:", err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading admin menu").catch(() => ({}));
    }
  });

  bot.action("adm_search_user", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'search_user' });
    const txt = `🔍 *Search User in Database*\n\nPlease send the **Telegram ID** (e.g. \`8033206631\`) or **@username** of the user you want to inspect:\n\n_(You can type and send it in chat now)_`;
    const markup = {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Direct Add Credits: Enter user ID, command, and amount
  bot.action("adm_add_credits_direct", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'add_credits_direct' });
    const txt = `⚡ *Add Credits to User*\n\n` +
      `Please send the User ID (or @username), Command Name, and Amount in chat:\n\n` +
      `👉 **Format:** \`<userId> <command> <amount>\`\n` +
      `👉 **Example:** \`8033206631 /phone 50\`\n` +
      `👉 **Example:** \`@username num 100\`\n\n` +
      `_(Or type \`/cancel\` to return to admin panel)_`;

    const markup = {
      inline_keyboard: [
        [{ text: "🔍 Search & Select User First", callback_data: "adm_search_user" }],
        [{ text: "❌ Cancel", callback_data: "admin_main_menu" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Direct Remove Credits: Enter user ID, command, and amount
  bot.action("adm_sub_credits_direct", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'sub_credits_direct' });
    const txt = `➖ *Remove Credits from User*\n\n` +
      `Please send the User ID (or @username), Command Name, and Amount to deduct:\n\n` +
      `👉 **Format:** \`<userId> <command> <amount>\`\n` +
      `👉 **Example:** \`8033206631 /phone 20\`\n` +
      `👉 **Example:** \`@username num 30\`\n\n` +
      `_(Or type \`/cancel\` to return to admin panel)_`;

    const markup = {
      inline_keyboard: [
        [{ text: "🔍 Search & Select User First", callback_data: "adm_search_user" }],
        [{ text: "❌ Cancel", callback_data: "admin_main_menu" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.action("adm_credits_menu", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'add_credits_direct' });
    const txt = `⚡ *Add / Remove Command Credits*\n\nYou can send the command in chat directly or enter the user details:\n\n` +
      `👉 **Add Credits:**\n\`/addcredits <userId> <command> <amount>\`\n_Example:_ \`/addcredits 8033206631 /phone 50\`\n\n` +
      `👉 **Remove Credits:**\n\`/removecredits <userId> <command> <amount>\`\n_Example:_ \`/removecredits 8033206631 /phone 20\`\n\n` +
      `👉 **Set Daily Limit:**\n\`/setcredits <userId> <command> <limit>\`\n_Example:_ \`/setcredits 8033206631 /phone 100\`\n\n` +
      `Or send: \`<userId> <command> <amount>\` right now:`;

    const markup = {
      inline_keyboard: [
        [{ text: "⚡ Add Credits", callback_data: "adm_add_credits_direct" }, { text: "➖ Remove Credits", callback_data: "adm_sub_credits_direct" }],
        [{ text: "🔍 Search & Select User First", callback_data: "adm_search_user" }],
        [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.action("adm_coins_prompt", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'set_coins_prompt' });
    const txt = `🪙 *Edit ENC Coins Balance*\n\nPlease send the **User ID** (or @username) and **Coins** in chat:\n\n` +
      `• **Set Exact Balance:** \`<userId> <coins>\` (e.g. \`8033206631 500\`)\n` +
      `• **Add Coins:** \`<userId> +<amount>\` (e.g. \`8033206631 +100\`)\n` +
      `• **Deduct Coins:** \`<userId> -<amount>\` (e.g. \`8033206631 -50\`)\n\n` +
      `Or slash commands: \`/setcoins <userId> <amount>\` | \`/addcoins <userId> <amount>\``;
    const markup = {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Quick ENC Coin Menu on user card
  bot.action(/^adm_coin_menu:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    const txt = `🪙 *Edit ENC Coins Balance*\n\n` +
      `• User: \`${targetUserId}\` (${user.firstName || 'N/A'})\n` +
      `• Current Coins: *${user.encCoins || 0}* Coins\n\n` +
      `Choose a quick adjustment or set custom amount:`;

    const markup = {
      inline_keyboard: [
        [
          { text: "+50 Coins", callback_data: `adm_quick_coin:${targetUserId}:50` },
          { text: "+100 Coins", callback_data: `adm_quick_coin:${targetUserId}:100` },
          { text: "+500 Coins", callback_data: `adm_quick_coin:${targetUserId}:500` }
        ],
        [
          { text: "-50 Coins", callback_data: `adm_quick_coin:${targetUserId}:-50` },
          { text: "Reset to 0", callback_data: `adm_quick_coin:${targetUserId}:0_set` },
          { text: "✏️ Custom Amount", callback_data: `adm_coin:${targetUserId}` }
        ],
        [
          { text: "🔙 Back to User Card", callback_data: `adm_view_u:${targetUserId}` }
        ]
      ]
    };

    await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Quick coin action handler
  bot.action(/^adm_quick_coin:([^:]+):(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const act = ctx.match[2];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    if (act === '0_set') {
      user.encCoins = 0;
    } else {
      const delta = parseInt(act);
      user.encCoins = Math.max(0, (user.encCoins || 0) + delta);
    }
    await user.save();

    await ctx.answerCbQuery(`🪙 Coins updated! Balance: ${user.encCoins}`).catch(() => ({}));
    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
  });

  // VIP options menu on user card
  bot.action(/^adm_vip_menu:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    const expiryStr = user.isPremium
      ? (user.premiumExpiresAt ? new Date(user.premiumExpiresAt).toLocaleDateString("en-IN") : "Lifetime")
      : "Not VIP";

    const txt = `👑 *Manage VIP Membership*\n\n` +
      `• User: \`${targetUserId}\` (${user.firstName || 'N/A'})\n` +
      `• Status: *${user.isPremium ? "⭐ VIP Active" : "Standard User"}*\n` +
      `• Expiry: \`${expiryStr}\`\n\n` +
      `Select duration to grant or revoke:`;

    const markup = {
      inline_keyboard: [
        [
          { text: "⭐ 7 Days", callback_data: `adm_quick_vip:${targetUserId}:7` },
          { text: "⭐ 30 Days", callback_data: `adm_quick_vip:${targetUserId}:30` }
        ],
        [
          { text: "⭐ 90 Days", callback_data: `adm_quick_vip:${targetUserId}:90` },
          { text: "🌟 Lifetime", callback_data: `adm_quick_vip:${targetUserId}:9999` }
        ],
        [
          { text: "❌ Revoke VIP Access", callback_data: `adm_quick_vip:${targetUserId}:0` }
        ],
        [
          { text: "🔙 Back to User Card", callback_data: `adm_view_u:${targetUserId}` }
        ]
      ]
    };

    await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Quick VIP duration action
  bot.action(/^adm_quick_vip:([^:]+):(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const days = parseInt(ctx.match[2]);
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    if (days <= 0) {
      user.isPremium = false;
      user.premiumExpiresAt = undefined;
      user.premiumTier = null;
      await ctx.answerCbQuery("❌ VIP Revoked").catch(() => ({}));
    } else {
      user.isPremium = true;
      user.premiumExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      user.premiumTier = 'premium';
      await ctx.answerCbQuery(`👑 VIP Granted for ${days > 1000 ? 'Lifetime' : days + ' days'}!`).catch(() => ({}));
    }
    await user.save();

    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
  });

  // Reset daily usage for user
  bot.action(/^adm_reset_usage:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    user.commandUsage = [];
    user.groupCreditsUsed = 0;
    await user.save();

    await ctx.answerCbQuery("🔄 Today's command usage reset to 0!").catch(() => ({}));
    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
  });

  // In-Bot Broadcast announcement prompt
  bot.action("adm_broadcast_prompt", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'broadcast_prompt' });
    const txt = `📢 *Broadcast Announcement to All Users*\n\n` +
      `Please send the announcement message you want to broadcast in chat right now.\n\n` +
      `• Supports Markdown or plain text\n` +
      `• You will see a confirmation preview before sending\n` +
      `• Type \`/cancel\` to abort.`;

    const markup = {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Confirm broadcast send
  bot.action("adm_broadcast_confirm", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    const session = botAdminSessions.get(userId);
    if (!session || session.action !== 'broadcast_confirm' || !session.broadcastText) {
      await ctx.answerCbQuery("No pending broadcast found.").catch(() => ({}));
      return;
    }

    const broadcastMsg = session.broadcastText;
    botAdminSessions.delete(userId);

    await ctx.editMessageText(`🚀 *Starting Broadcast...*\nDelivering message to all bot users in background.`, { parse_mode: "Markdown" }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));

    // Execute background broadcast safely
    (async () => {
      try {
        const users = await BotUser.find({ isBanned: { $ne: true } }).select('telegramId').lean();
        let delivered = 0;
        let failed = 0;

        for (const u of users) {
          if (!u.telegramId) continue;
          try {
            await bot.telegram.sendMessage(u.telegramId, broadcastMsg, { parse_mode: "Markdown" });
            delivered++;
          } catch {
            failed++;
          }
          // Delay to respect Telegram limits
          await new Promise(r => setTimeout(r, 35));
        }

        await bot.telegram.sendMessage(userId, `📢 *Broadcast Completed!*\n\n• Total Targets: *${users.length}*\n• Successfully Delivered: *${delivered}*\n• Failed / Blocked: *${failed}*`, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "👑 Admin Panel", callback_data: "admin_main_menu" }]]
          }
        }).catch(() => {});
      } catch (err: any) {
        console.error("In-bot broadcast error:", err);
      }
    })();
  });

  bot.action("adm_vip_prompt", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'vip_custom' });
    const txt = `👑 *Grant / Revoke VIP Access*\n\nPlease send: \`<userId> [days]\`\nExample: \`8033206631 30\` (30 days)\nExample: \`8033206631 0\` (to revoke)\n\nOr use: \`/setvip <userId> 30\``;
    const markup = {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.action("adm_ban_prompt", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    botAdminSessions.set(userId, { action: 'ban_custom' });
    const txt = `🚫 *Ban / Unban User*\n\nPlease send the **Telegram ID** of the user to toggle ban/unban status:\n\nOr use: \`/ban <userId>\` | \`/unban <userId>\``;
    const markup = {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.action("adm_system_stats", async (ctx) => {
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    const [totalUsers, totalGroups, totalCommands, bannedCount, premiumCount, totalCalls] = await Promise.all([
      BotUser.countDocuments(),
      BotGroup.countDocuments(),
      Command.countDocuments(),
      BotUser.countDocuments({ isBanned: true }),
      BotUser.countDocuments({ isPremium: true }),
      Statlog.countDocuments()
    ]);

    const activeToday = await BotUser.countDocuments({
      "commandUsage.lastResetDate": new Date().toISOString().split("T")[0]
    });

    const txt = `📊 *DETAILED SYSTEM ANALYTICS* 📊\n\n` +
      `👥 *User Base:* ${totalUsers.toLocaleString()} registered\n` +
      `⚡ *Active Users Today:* ${activeToday.toLocaleString()}\n` +
      `🏰 *Bot Groups:* ${totalGroups.toLocaleString()} groups tracking\n` +
      `👑 *Paid VIP Members:* ${premiumCount.toLocaleString()}\n` +
      `🚫 *Banned Users:* ${bannedCount.toLocaleString()}\n` +
      `📈 *Lifetime Command Queries:* ${totalCalls.toLocaleString()}\n` +
      `🛠️ *Available Commands:* ${totalCommands.toLocaleString()}\n\n` +
      `✅ *Server & Bot State:* Healthy & Operational`;

    const markup = {
      inline_keyboard: [[{ text: "🔙 Back to Admin Menu", callback_data: "admin_main_menu" }]]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    }
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Action: Add credits to user -> choose command
  bot.action(/^adm_add_c:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    const creditCmds = await Command.find({ isCreditBased: true });
    if (creditCmds.length === 0) {
      await ctx.answerCbQuery("No credit-based commands found in database.").catch(() => ({}));
      return;
    }

    const buttons = creditCmds.map(cmd => [
      { text: `⚡ ${cmd.command}`, callback_data: `adm_sel_cmd_add:${targetUserId}:${cmd.command}` }
    ]);
    buttons.push([{ text: "🔙 Back to Profile", callback_data: `adm_view_u:${targetUserId}` }]);

    await ctx.editMessageText(`⚡ *Select Command to ADD Credits:*\nTarget User: \`${targetUserId}\``, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Action: Remove credits from user -> choose command
  bot.action(/^adm_sub_c:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    const creditCmds = await Command.find({ isCreditBased: true });
    if (creditCmds.length === 0) {
      await ctx.answerCbQuery("No credit-based commands found in database.").catch(() => ({}));
      return;
    }

    const buttons = creditCmds.map(cmd => [
      { text: `⚡ ${cmd.command}`, callback_data: `adm_sel_cmd_sub:${targetUserId}:${cmd.command}` }
    ]);
    buttons.push([{ text: "🔙 Back to Profile", callback_data: `adm_view_u:${targetUserId}` }]);

    await ctx.editMessageText(`➖ *Select Command to DEDUCT Credits:*\nTarget User: \`${targetUserId}\``, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Action: Set daily limit override for user -> choose command
  bot.action(/^adm_lim_c:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const userId = String(ctx.from?.id);
    if (!isBotSuperAdmin(userId)) return;

    const creditCmds = await Command.find({ isCreditBased: true });
    if (creditCmds.length === 0) {
      await ctx.answerCbQuery("No credit-based commands found in database.").catch(() => ({}));
      return;
    }

    const buttons = creditCmds.map(cmd => [
      { text: `⚡ ${cmd.command}`, callback_data: `adm_sel_cmd_lim:${targetUserId}:${cmd.command}` }
    ]);
    buttons.push([{ text: "🔙 Back to Profile", callback_data: `adm_view_u:${targetUserId}` }]);

    await ctx.editMessageText(`✏️ *Select Command to Override Daily Limit:*\nTarget User: \`${targetUserId}\``, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Selected command to add credits
  bot.action(/^adm_sel_cmd_add:([^:]+):(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const cmdName = ctx.match[2];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    botAdminSessions.set(adminId, {
      action: 'add_credits_amount',
      targetUserId,
      targetCommand: cmdName
    });

    const txt = `➕ *Add Credits to User:*\n` +
      `• User: \`${targetUserId}\`\n` +
      `• Command: \`${cmdName}\`\n\n` +
      `👉 Please send the **number of credits** to ADD (e.g. \`50\`):\n` +
      `_(Type any positive integer and send)_`;

    await ctx.editMessageText(txt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_view_u:${targetUserId}` }]] }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Selected command to subtract credits
  bot.action(/^adm_sel_cmd_sub:([^:]+):(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const cmdName = ctx.match[2];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    botAdminSessions.set(adminId, {
      action: 'sub_credits_amount',
      targetUserId,
      targetCommand: cmdName
    });

    const txt = `➖ *Remove Credits from User:*\n` +
      `• User: \`${targetUserId}\`\n` +
      `• Command: \`${cmdName}\`\n\n` +
      `👉 Please send the **number of credits** to REMOVE (e.g. \`20\`):\n` +
      `_(Type any positive integer and send)_`;

    await ctx.editMessageText(txt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_view_u:${targetUserId}` }]] }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Selected command to set daily limit
  bot.action(/^adm_sel_cmd_lim:([^:]+):(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const cmdName = ctx.match[2];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    botAdminSessions.set(adminId, {
      action: 'set_credits_amount',
      targetUserId,
      targetCommand: cmdName
    });

    const txt = `✏️ *Set Daily Limit Override:*\n` +
      `• User: \`${targetUserId}\`\n` +
      `• Command: \`${cmdName}\`\n\n` +
      `👉 Please send the **Daily Limit** (e.g. \`100\`) or type \`unlimited\`:\n` +
      `_(Type limit number and send)_`;

    await ctx.editMessageText(txt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_view_u:${targetUserId}` }]] }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Edit coins for user
  bot.action(/^adm_coin:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    botAdminSessions.set(adminId, {
      action: 'set_coins_amount',
      targetUserId
    });

    const txt = `🪙 *Edit ENC Coins Balance:*\n` +
      `• User: \`${targetUserId}\`\n\n` +
      `👉 Please send the **new ENC coin balance** (e.g. \`500\`):\n` +
      `_(Type any integer and send)_`;

    await ctx.editMessageText(txt, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `adm_view_u:${targetUserId}` }]] }
    }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  // Toggle VIP directly from user card
  bot.action(/^adm_vip:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    if (user.isPremium) {
      user.isPremium = false;
      user.premiumExpiresAt = undefined;
      user.premiumTier = null;
    } else {
      user.isPremium = true;
      user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      user.premiumTier = 'premium';
    }
    await user.save();

    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    await ctx.answerCbQuery(user.isPremium ? "✅ VIP Granted (30 Days)" : "❌ VIP Revoked").catch(() => ({}));
  });

  // Toggle Ban directly from user card
  bot.action(/^adm_ban:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found.").catch(() => ({}));
      return;
    }

    user.isBanned = !user.isBanned;
    await user.save();

    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    await ctx.answerCbQuery(user.isBanned ? "🚫 User Banned" : "🟢 User Unbanned").catch(() => ({}));
  });

  // View user profile card again
  bot.action(/^adm_view_u:(.+)$/, async (ctx) => {
    const targetUserId = ctx.match[1];
    const adminId = String(ctx.from?.id);
    if (!isBotSuperAdmin(adminId)) return;

    botAdminSessions.delete(adminId);
    let user = await BotUser.findOne({ telegramId: targetUserId });
    if (!user) {
      await ctx.answerCbQuery("User not found in database.").catch(() => ({}));
      return;
    }

    const { text, markup } = await renderAdminUserProfile(user);
    await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: markup }).catch(() => {});
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.on("text", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const userId = String(ctx.from?.id);

      // Handle active Super Admin sessions first
      if (isBotSuperAdmin(userId) && botAdminSessions.has(userId)) {
        const session = botAdminSessions.get(userId)!;

        if (text === "/cancel" || text === "cancel") {
          botAdminSessions.delete(userId);
          await ctx.reply("❌ Admin action canceled.", {
            reply_markup: {
              inline_keyboard: [[{ text: "🛡️ Admin Panel", callback_data: "admin_main_menu" }]]
            }
          });
          return;
        }

        // Action 1: Search user
        if (session.action === 'search_user') {
          botAdminSessions.delete(userId);
          const cleanQuery = text.trim();
          let user = await resolveTargetUser(cleanQuery);

          if (!user) {
            await ctx.reply(`❌ *User Not Found:*\nNo record found for \`${cleanQuery}\`.`, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🔍 Search Again", callback_data: "adm_search_user" }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            });
            return;
          }

          const { text: profText, markup } = await renderAdminUserProfile(user);
          await ctx.reply(profText, { parse_mode: "Markdown", reply_markup: markup });
          return;
        }

        // Action: Add credits direct (<userId> <command> <amount>)
        if (session.action === 'add_credits_direct') {
          const parts = text.split(/\s+/);
          if (parts.length >= 3) {
            botAdminSessions.delete(userId);
            const targetInput = parts[0].trim();
            let cmd = parts[1].trim();
            if (!cmd.startsWith('/')) cmd = '/' + cmd;
            const amount = parseInt(parts[2].trim());

            if (isNaN(amount) || amount <= 0) {
              await ctx.reply("⚠️ Amount must be a positive integer.");
              return;
            }

            let user = await resolveTargetUser(targetInput);
            if (!user) {
              const cleanTid = targetInput.replace(/[^\d]/g, '');
              if (cleanTid) {
                user = await BotUser.create({ telegramId: cleanTid, firstName: "User " + cleanTid });
              } else {
                await ctx.reply(`❌ User not found for \`${targetInput}\`. Please check ID or @username.`, { parse_mode: "Markdown" });
                return;
              }
            }

            const newBal = addOrRemoveUserCredits(user, cmd, amount);
            await user.save();

            await ctx.reply(
              `✅ *Credits Added Successfully!*\n\n` +
              `• User: \`${user.telegramId}\` (${user.firstName || ''} ${user.username ? '@' + user.username : ''})\n` +
              `• Command: \`${cmd}\`\n` +
              `• Added: *+${amount}* Credits\n` +
              `• New Extra Balance: *${newBal}* Credits`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "👤 Inspect User Card", callback_data: `adm_view_u:${user.telegramId}` }],
                    [{ text: "⚡ Add More Credits", callback_data: "adm_add_credits_direct" }],
                    [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                  ]
                }
              }
            );
            return;
          } else if (parts.length === 2) {
            const targetInput = parts[0].trim();
            let cmd = parts[1].trim();
            if (!cmd.startsWith('/')) cmd = '/' + cmd;
            const user = await resolveTargetUser(targetInput);
            if (!user) {
              await ctx.reply(`❌ User not found for \`${targetInput}\`.`, { parse_mode: "Markdown" });
              return;
            }
            session.action = 'add_credits_amount';
            session.targetUserId = user.telegramId;
            session.targetCommand = cmd;
            await ctx.reply(`Target user: \`${user.telegramId}\` | Command: \`${cmd}\`\n\n👉 Now send the **number of credits** to ADD (e.g. \`50\`):`, { parse_mode: "Markdown" });
            return;
          } else {
            await ctx.reply("⚠️ Format: `<userId> <command> <amount>`\nExample: `8033206631 /phone 50` or `@username phone 50`\n\nOr type `/cancel` to abort.", { parse_mode: "Markdown" });
            return;
          }
        }

        // Action: Sub credits direct (<userId> <command> <amount>)
        if (session.action === 'sub_credits_direct') {
          const parts = text.split(/\s+/);
          if (parts.length >= 3) {
            botAdminSessions.delete(userId);
            const targetInput = parts[0].trim();
            let cmd = parts[1].trim();
            if (!cmd.startsWith('/')) cmd = '/' + cmd;
            const amount = parseInt(parts[2].trim());

            if (isNaN(amount) || amount <= 0) {
              await ctx.reply("⚠️ Amount must be a positive integer.");
              return;
            }

            let user = await resolveTargetUser(targetInput);
            if (!user) {
              await ctx.reply(`❌ User not found for \`${targetInput}\`.`, { parse_mode: "Markdown" });
              return;
            }

            const newBal = addOrRemoveUserCredits(user, cmd, -amount);
            await user.save();

            await ctx.reply(
              `✅ *Credits Deducted Successfully!*\n\n` +
              `• User: \`${user.telegramId}\` (${user.firstName || ''} ${user.username ? '@' + user.username : ''})\n` +
              `• Command: \`${cmd}\`\n` +
              `• Deducted: *-${amount}* Credits\n` +
              `• Remaining Balance: *${newBal}* Credits`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "👤 Inspect User Card", callback_data: `adm_view_u:${user.telegramId}` }],
                    [{ text: "➖ Remove More Credits", callback_data: "adm_sub_credits_direct" }],
                    [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                  ]
                }
              }
            );
            return;
          } else if (parts.length === 2) {
            const targetInput = parts[0].trim();
            let cmd = parts[1].trim();
            if (!cmd.startsWith('/')) cmd = '/' + cmd;
            const user = await resolveTargetUser(targetInput);
            if (!user) {
              await ctx.reply(`❌ User not found for \`${targetInput}\`.`, { parse_mode: "Markdown" });
              return;
            }
            session.action = 'sub_credits_amount';
            session.targetUserId = user.telegramId;
            session.targetCommand = cmd;
            await ctx.reply(`Target user: \`${user.telegramId}\` | Command: \`${cmd}\`\n\n👉 Now send the **number of credits** to REMOVE (e.g. \`20\`):`, { parse_mode: "Markdown" });
            return;
          } else {
            await ctx.reply("⚠️ Format: `<userId> <command> <amount>`\nExample: `8033206631 /phone 20` or `@username phone 20`\n\nOr type `/cancel` to abort.", { parse_mode: "Markdown" });
            return;
          }
        }

        // Action: Edit Coins prompt
        if (session.action === 'set_coins_prompt') {
          const parts = text.split(/\s+/);
          if (parts.length >= 2) {
            botAdminSessions.delete(userId);
            const targetInput = parts[0].trim();
            const valStr = parts[1].trim();
            let user = await resolveTargetUser(targetInput);
            if (!user) {
              const cleanTid = targetInput.replace(/[^\d]/g, '');
              if (cleanTid) {
                user = await BotUser.create({ telegramId: cleanTid, firstName: "User " + cleanTid });
              } else {
                await ctx.reply(`❌ User not found for \`${targetInput}\`.`, { parse_mode: "Markdown" });
                return;
              }
            }

            if (valStr.startsWith('+')) {
              const add = parseInt(valStr.slice(1));
              user.encCoins = Math.max(0, (user.encCoins || 0) + (isNaN(add) ? 0 : add));
            } else if (valStr.startsWith('-')) {
              const sub = parseInt(valStr.slice(1));
              user.encCoins = Math.max(0, (user.encCoins || 0) - (isNaN(sub) ? 0 : sub));
            } else {
              const setVal = parseInt(valStr);
              user.encCoins = Math.max(0, isNaN(setVal) ? 0 : setVal);
            }
            await user.save();

            await ctx.reply(
              `✅ *ENC Coins Balance Updated!*\n\n` +
              `• User: \`${user.telegramId}\` (${user.firstName || ''} ${user.username ? '@' + user.username : ''})\n` +
              `• New Balance: *${user.encCoins}* Coins`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "👤 Inspect User Card", callback_data: `adm_view_u:${user.telegramId}` }],
                    [{ text: "🪙 Edit More Coins", callback_data: "adm_coins_prompt" }],
                    [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                  ]
                }
              }
            );
            return;
          }
          await ctx.reply("⚠️ Format: `<userId> <amount>` or `<userId> +<amount>` or `<userId> -<amount>`\nExample: `8033206631 500`\nExample: `@username +100`", { parse_mode: "Markdown" });
          return;
        }

        // Action: Broadcast message input
        if (session.action === 'broadcast_prompt') {
          session.action = 'broadcast_confirm';
          session.broadcastText = text;
          const previewText = `📢 *BROADCAST MESSAGE PREVIEW:*\n\n---\n${text}\n---\n\n⚠️ *Are you sure you want to broadcast this message to ALL bot users?*`;
          await ctx.reply(previewText, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🚀 Confirm & Send to All Users", callback_data: "adm_broadcast_confirm" }],
                [{ text: "❌ Cancel", callback_data: "admin_main_menu" }]
              ]
            }
          });
          return;
        }

        // Action 2: Add credits amount
        if (session.action === 'add_credits_amount' && session.targetUserId && session.targetCommand) {
          botAdminSessions.delete(userId);
          const amount = parseInt(text.replace(/\D/g, ''));
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply("⚠️ Invalid credits amount. Operation aborted.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: session.targetUserId });
          if (!user) {
            user = await BotUser.create({ telegramId: session.targetUserId, firstName: "User " + session.targetUserId });
          }

          const newBal = addOrRemoveUserCredits(user, session.targetCommand, amount);
          await user.save();

          await ctx.reply(
            `✅ *Credits Added Successfully!*\n\n` +
            `• User ID: \`${session.targetUserId}\`\n` +
            `• Command: \`${session.targetCommand}\`\n` +
            `• Added: *+${amount}* Credits\n` +
            `• New Additional Balance: *${newBal}* Credits`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Profile", callback_data: `adm_view_u:${session.targetUserId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Action 3: Subtract credits amount
        if (session.action === 'sub_credits_amount' && session.targetUserId && session.targetCommand) {
          botAdminSessions.delete(userId);
          const amount = parseInt(text.replace(/\D/g, ''));
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply("⚠️ Invalid credits amount. Operation aborted.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: session.targetUserId });
          if (!user) {
            await ctx.reply("❌ User not found in database.");
            return;
          }

          const newBal = addOrRemoveUserCredits(user, session.targetCommand, -amount);
          await user.save();

          await ctx.reply(
            `✅ *Credits Deducted Successfully!*\n\n` +
            `• User ID: \`${session.targetUserId}\`\n` +
            `• Command: \`${session.targetCommand}\`\n` +
            `• Deducted: *-${amount}* Credits\n` +
            `• New Balance: *${newBal}* Credits`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Profile", callback_data: `adm_view_u:${session.targetUserId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Action 4: Set daily limit amount
        if (session.action === 'set_credits_amount' && session.targetUserId && session.targetCommand) {
          botAdminSessions.delete(userId);
          const isUnlim = text.toLowerCase().includes("unlim");
          const limit = isUnlim ? 0 : parseInt(text.replace(/\D/g, ''));

          if (!isUnlim && isNaN(limit)) {
            await ctx.reply("⚠️ Invalid limit amount. Operation aborted.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: session.targetUserId });
          if (!user) {
            user = await BotUser.create({ telegramId: session.targetUserId, firstName: "User " + session.targetUserId });
          }

          setUserDailyLimit(user, session.targetCommand, isUnlim ? 1000000 : limit, isUnlim);
          await user.save();

          await ctx.reply(
            `✅ *Daily Limit Override Updated!*\n\n` +
            `• User ID: \`${session.targetUserId}\`\n` +
            `• Command: \`${session.targetCommand}\`\n` +
            `• Daily Limit: *${isUnlim ? "Unlimited" : limit}*`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Profile", callback_data: `adm_view_u:${session.targetUserId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Action 5: Set coins amount
        if (session.action === 'set_coins_amount' && session.targetUserId) {
          botAdminSessions.delete(userId);
          const coins = parseInt(text.replace(/[^\d-]/g, ''));
          if (isNaN(coins)) {
            await ctx.reply("⚠️ Invalid coins value. Operation aborted.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: session.targetUserId });
          if (!user) {
            user = await BotUser.create({ telegramId: session.targetUserId, firstName: "User " + session.targetUserId });
          }

          user.encCoins = Math.max(0, coins);
          await user.save();

          await ctx.reply(
            `✅ *ENC Coins Updated!*\n\n` +
            `• User ID: \`${session.targetUserId}\`\n` +
            `• New Balance: *${user.encCoins}* Coins`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Profile", callback_data: `adm_view_u:${session.targetUserId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Action 6: Custom add credits line `<userId> <command> <amount>`
        if (session.action === 'add_credits_custom') {
          botAdminSessions.delete(userId);
          const parts = text.split(/\s+/);
          if (parts.length >= 3) {
            const targetId = parts[0].trim();
            const cmd = parts[1].trim();
            const amount = parseInt(parts[2].trim());

            if (targetId && cmd && !isNaN(amount)) {
              let user = await BotUser.findOne({ telegramId: targetId });
              if (!user) {
                user = await BotUser.create({ telegramId: targetId, firstName: "User " + targetId });
              }

              const newBal = addOrRemoveUserCredits(user, cmd, amount);
              await user.save();

              await ctx.reply(
                `✅ *Credits Modified Successfully!*\n\n` +
                `• User ID: \`${targetId}\`\n` +
                `• Command: \`${cmd}\`\n` +
                `• Change: *${amount >= 0 ? '+' : ''}${amount}*\n` +
                `• New Additional Balance: *${newBal}* Credits`,
                {
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "👤 View User Card", callback_data: `adm_view_u:${targetId}` }],
                      [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                    ]
                  }
                }
              );
              return;
            }
          }
          await ctx.reply("⚠️ Format incorrect. Expected: `<userId> <command> <amount>`\nExample: `8033206631 /phone 50`", { parse_mode: "Markdown" });
          return;
        }

        // Action 7: Custom coins `<userId> <amount>`
        if (session.action === 'set_coins_custom') {
          botAdminSessions.delete(userId);
          const parts = text.split(/\s+/);
          if (parts.length >= 2) {
            const targetId = parts[0].trim();
            const coins = parseInt(parts[1].trim());

            if (targetId && !isNaN(coins)) {
              let user = await BotUser.findOne({ telegramId: targetId });
              if (!user) {
                user = await BotUser.create({ telegramId: targetId, firstName: "User " + targetId });
              }

              user.encCoins = Math.max(0, coins);
              await user.save();

              await ctx.reply(`✅ *ENC Coins Set:* User \`${targetId}\` now has *${user.encCoins}* coins!`, {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "👤 View User Card", callback_data: `adm_view_u:${targetId}` }],
                    [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                  ]
                }
              });
              return;
            }
          }
          await ctx.reply("⚠️ Format incorrect. Expected: `<userId> <coins>`\nExample: `8033206631 500`", { parse_mode: "Markdown" });
          return;
        }

        // Action 8: Custom VIP `<userId> [days]`
        if (session.action === 'vip_custom') {
          botAdminSessions.delete(userId);
          const parts = text.split(/\s+/);
          if (parts.length >= 1) {
            const targetId = parts[0].trim();
            const days = parts[1] ? parseInt(parts[1].trim()) : 30;

            let user = await BotUser.findOne({ telegramId: targetId });
            if (!user) {
              user = await BotUser.create({ telegramId: targetId, firstName: "User " + targetId });
            }

            if (days <= 0) {
              user.isPremium = false;
              user.premiumExpiresAt = undefined;
              user.premiumTier = null;
              await user.save();
              await ctx.reply(`❌ *VIP Revoked:* User \`${targetId}\` is now standard user.`, { parse_mode: "Markdown" });
            } else {
              user.isPremium = true;
              user.premiumExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              user.premiumTier = 'premium';
              await user.save();
              await ctx.reply(`👑 *VIP Granted:* User \`${targetId}\` has VIP access for *${days}* days!`, { parse_mode: "Markdown" });
            }
            return;
          }
        }

        // Action 9: Custom ban `<userId>`
        if (session.action === 'ban_custom') {
          botAdminSessions.delete(userId);
          const targetId = text.trim();
          let user = await BotUser.findOne({ telegramId: targetId });
          if (!user) {
            user = await BotUser.create({ telegramId: targetId, firstName: "User " + targetId, isBanned: true });
          } else {
            user.isBanned = !user.isBanned;
            await user.save();
          }

          await ctx.reply(user.isBanned ? `🚫 *User ${targetId} Banned.*` : `🟢 *User ${targetId} Unbanned.*`, { parse_mode: "Markdown" });
          return;
        }
      }

      // Check active checkout/payment state
      const userState = botShopStates.get(userId);
      if (userState) {
        if (userState.state === 'awaiting_credit_qty') {
          await handleCreditsQtyInput(ctx, userId, text);
          return;
        } else if (userState.state === 'awaiting_coupon') {
          await handleCouponInput(ctx, userId, text);
          return;
        } else if (userState.state === 'awaiting_utr') {
          if (text.startsWith("/")) {
            if (text === "/shop" || text === "/start" || text === "/cancel") {
              botShopStates.delete(userId);
              if (text === "/cancel") {
                await ctx.reply("❌ Payment checkout canceled. You can open the shop again using /shop.");
                return;
              }
            } else {
              await ctx.reply("⚠️ You have a pending payment checkout. Please send your payment UTR / Transaction ID or cancel it using the Cancel button or typing /cancel.");
              return;
            }
          } else {
            await handleUtrVerificationInput(ctx, userId, text);
            return;
          }
        }
      }

      if (!text.startsWith("/")) return;

      const maintenanceSetting = await Setting.findOne({ key: 'botMaintenanceMode' });
      if (maintenanceSetting && maintenanceSetting.value === true) {
        await ctx.reply("🤖 The bot is currently under maintenance. This service is suspended temporarily!");
        return;
      }

      const parts = text.split(" ");
      let userCommand = parts[0];
      if (userCommand.includes("@")) {
        userCommand = userCommand.split("@")[0];
      }

      const param = parts.slice(1).join(" ");
      const replyOptions: any = {
        parse_mode: "Markdown",
        reply_parameters: { message_id: ctx.message.message_id },
      };

      if (userCommand === "/start") {
        const isGroup =
          ctx.chat.type === "group" || ctx.chat.type === "supergroup";
        if (!isGroup) {
          if (param && param.startsWith("earn")) {
            const appUrl = getAppUrl();
            const earnUrl = `${appUrl}/rewards?userid=${ctx.from?.id || ""}`;

            await ctx.reply(
              "🎁 *Earn Free Credits* 🎁\n\nClick the button below to open the Rewards WebApp and start earning coins by watching ads!",
              {
                ...replyOptions,
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "💸 Open Rewards WebApp",
                        web_app: { url: earnUrl },
                        style: "success",
                      } as any,
                    ],
                  ],
                },
              },
            );
            return;
          }

          if (param && param.startsWith("shop")) {
            const appUrl = getAppUrl();
            const shopUrl = `${appUrl}/shop?userid=${ctx.from?.id || ""}`;

            await ctx.reply(
              "🛍️ *ENCORE XOSINT Shop* 🛍️\n\nClick the button below to open the shop and unlock premium access or custom command credits packs!",
              {
                ...replyOptions,
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "🛒 Open Shop WebApp",
                        web_app: { url: shopUrl },
                        style: "success",
                      } as any,
                    ],
                  ],
                },
              },
            );
            return;
          }

          if (param && param.startsWith("mirrors")) {
            const appUrl = getAppUrl();
            const mirrorsUrl = `${appUrl}/mirrors?userid=${ctx.from?.id || ""}`;

            await ctx.reply(
              "🤖 *Make Your Own Mirrored Bot* 🤖\n\nClick the button below to open the Mirror manager and create/manage your own clones of this bot!",
              {
                ...replyOptions,
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "🤖 Open Mirror WebApp",
                        web_app: { url: mirrorsUrl },
                        style: "success",
                      } as any,
                    ],
                  ],
                },
              },
            );
            return;
          }

          const appUrl = getAppUrl();
          const mirrorsUrl = `${appUrl}/mirrors?userid=${ctx.from?.id || ""}`;
          const massRunUrl = `${appUrl}/mass-run?userid=${ctx.from?.id || ""}`;
          const isAdminUser = isBotSuperAdmin(ctx.from?.id);

          const menuButtons: any[] = [
            [
              {
                text: "🤖 MAKE YOUR OWN BOT",
                web_app: { url: mirrorsUrl },
              } as any,
            ],
            [
              {
                text: "🔎 MASS SEARCH",
                web_app: { url: massRunUrl },
              } as any,
            ],
            [
              {
                text: "👤 My Profile",
                callback_data: "view_profile",
                style: "success",
              } as any,
            ],
            [
              {
                text: "🛍️ Bot Shop (New)",
                callback_data: "view_shop",
                style: "success",
              } as any,
            ],
            [
              {
                text: "ℹ️ Help Center",
                callback_data: "view_help",
                style: "primary",
              } as any,
            ],
          ];

          // Insert Super Admin Panel button visible ONLY to the two super admins
          if (isAdminUser) {
            menuButtons.splice(3, 0, [
              {
                text: "👑 Admin Panel",
                callback_data: "admin_main_menu",
              } as any,
            ]);
          }

          await ctx.reply(
            "✨ *Welcome to ENCORE XOSINT* ✨\n\n✅ *Status:* Bot is fully operational.\n\nYou can get multiple information using this bot. Try exploring some commands or use /help to see how it works!",
            {
              ...replyOptions,
              reply_markup: {
                inline_keyboard: menuButtons,
              },
            },
          );
        } else {
          const commands = await Command.find({});
          let txt = "⚡️ *ENCORE XOSINT - Available Commands* ⚡\n\n";
          for (const c of commands) {
            txt += `• \`${c.command}\` - ${c.description || "No description"}\n`;
          }
          await ctx.reply(txt, replyOptions);
        }
        return;
      }

      if (userCommand === "/shop") {
        return showBotShopMenu(ctx);
      }

      if (userCommand === "/profile") {
        return showProfile(ctx);
      }

      if (userCommand === "/help") {
        return showHelp(ctx);
      }

      // ===============================================
      // SUPER ADMIN COMMAND ROUTERS (Ayush & Arush)
      // ===============================================
      if (isBotSuperAdmin(ctx.from?.id)) {
        const normCmd = userCommand.toLowerCase();
        const normFullText = text.toLowerCase();
        if (
          normCmd === "/admin" ||
          normCmd === "/panel" ||
          normCmd === "/adminpanel" ||
          normFullText === "admin" ||
          normFullText === "panel" ||
          normFullText === "admin panel" ||
          normFullText === "👑 admin panel" ||
          normFullText === "🛡️ admin panel"
        ) {
          return showAdminMainMenu(ctx);
        }

        // Search user command: /user <id or username>
        if (userCommand === "/user" || userCommand === "/searchuser") {
          const target = param.trim();
          if (!target) {
            await ctx.reply("⚠️ *Usage:* `/user <telegramId or @username>`\nExample: `/user 8033206631`", { parse_mode: "Markdown" });
            return;
          }

          let user = await resolveTargetUser(target);

          if (!user) {
            await ctx.reply(`❌ User not found for query: \`${target}\``, { parse_mode: "Markdown" });
            return;
          }

          const { text: profText, markup } = await renderAdminUserProfile(user);
          await ctx.reply(profText, { parse_mode: "Markdown", reply_markup: markup });
          return;
        }

        // Add credits command: /addcredits <targetId> <command> <amount>
        if (userCommand === "/addcredits") {
          const parts = param.trim().split(/\s+/);
          if (parts.length < 3) {
            await ctx.reply("⚠️ *Usage:* `/addcredits <userId> <command> <amount>`\nExample: `/addcredits 8033206631 /phone 50`", { parse_mode: "Markdown" });
            return;
          }
          const [tId, cmd, amtStr] = parts;
          const amount = parseInt(amtStr);
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply("⚠️ Amount must be a positive integer.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            user = await BotUser.create({ telegramId: tId, firstName: "User " + tId });
          }

          const newBal = addOrRemoveUserCredits(user, cmd, amount);
          await user.save();

          await ctx.reply(
            `✅ *Credits Added Successfully!*\n\n` +
            `• User ID: \`${tId}\`\n` +
            `• Command: \`${cmd}\`\n` +
            `• Added: *+${amount}* Credits\n` +
            `• Total Additional Balance: *${newBal}* Credits`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Card", callback_data: `adm_view_u:${tId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Remove credits command: /removecredits <targetId> <command> <amount>
        if (userCommand === "/removecredits") {
          const parts = param.trim().split(/\s+/);
          if (parts.length < 3) {
            await ctx.reply("⚠️ *Usage:* `/removecredits <userId> <command> <amount>`\nExample: `/removecredits 8033206631 /phone 10`", { parse_mode: "Markdown" });
            return;
          }
          const [tId, cmd, amtStr] = parts;
          const amount = parseInt(amtStr);
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply("⚠️ Amount must be a positive integer.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            await ctx.reply("❌ User not found in database.");
            return;
          }

          const newBal = addOrRemoveUserCredits(user, cmd, -amount);
          await user.save();

          await ctx.reply(
            `✅ *Credits Removed Successfully!*\n\n` +
            `• User ID: \`${tId}\`\n` +
            `• Command: \`${cmd}\`\n` +
            `• Deducted: *-${amount}* Credits\n` +
            `• Remaining Balance: *${newBal}* Credits`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "👤 Inspect User Card", callback_data: `adm_view_u:${tId}` }],
                  [{ text: "🔙 Admin Menu", callback_data: "admin_main_menu" }]
                ]
              }
            }
          );
          return;
        }

        // Set daily limit command: /setcredits <targetId> <command> <limit>
        if (userCommand === "/setcredits") {
          const parts = param.trim().split(/\s+/);
          if (parts.length < 3) {
            await ctx.reply("⚠️ *Usage:* `/setcredits <userId> <command> <limit>`\nExample: `/setcredits 8033206631 /phone 100` (or `unlimited`)", { parse_mode: "Markdown" });
            return;
          }
          const [tId, cmd, limStr] = parts;
          const isUnlim = limStr.toLowerCase().includes("unlim");
          const limit = isUnlim ? 0 : parseInt(limStr);

          if (!isUnlim && isNaN(limit)) {
            await ctx.reply("⚠️ Limit must be a valid number or 'unlimited'.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            user = await BotUser.create({ telegramId: tId, firstName: "User " + tId });
          }

          setUserDailyLimit(user, cmd, isUnlim ? 1000000 : limit, isUnlim);
          await user.save();

          await ctx.reply(`✅ *Daily Limit Set:* User \`${tId}\` can now use \`${cmd}\` up to *${isUnlim ? "Unlimited" : limit}* times per day.`, { parse_mode: "Markdown" });
          return;
        }

        // Set coins command: /setcoins <targetId> <amount>
        if (userCommand === "/setcoins") {
          const parts = param.trim().split(/\s+/);
          if (parts.length < 2) {
            await ctx.reply("⚠️ *Usage:* `/setcoins <userId> <amount>`\nExample: `/setcoins 8033206631 500`", { parse_mode: "Markdown" });
            return;
          }
          const [tId, coinsStr] = parts;
          const coins = parseInt(coinsStr);
          if (isNaN(coins)) {
            await ctx.reply("⚠️ Coins must be a valid number.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            user = await BotUser.create({ telegramId: tId, firstName: "User " + tId });
          }

          user.encCoins = Math.max(0, coins);
          await user.save();

          await ctx.reply(`✅ *ENC Coins Updated:* User \`${tId}\` balance is now *${user.encCoins}* coins.`, { parse_mode: "Markdown" });
          return;
        }

        // Add coins command: /addcoins <targetId> <amount>
        if (userCommand === "/addcoins") {
          const parts = param.trim().split(/\s+/);
          if (parts.length < 2) {
            await ctx.reply("⚠️ *Usage:* `/addcoins <userId> <amount>`\nExample: `/addcoins 8033206631 100`", { parse_mode: "Markdown" });
            return;
          }
          const [tId, coinsStr] = parts;
          const coins = parseInt(coinsStr);
          if (isNaN(coins) || coins <= 0) {
            await ctx.reply("⚠️ Coins amount must be a positive number.");
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            user = await BotUser.create({ telegramId: tId, firstName: "User " + tId });
          }

          user.encCoins = (user.encCoins || 0) + coins;
          await user.save();

          await ctx.reply(`✅ *Coins Added:* User \`${tId}\` received *+${coins}* ENC coins. New total: *${user.encCoins}* coins.`, { parse_mode: "Markdown" });
          return;
        }

        // Set VIP command: /setvip <targetId> [days]
        if (userCommand === "/setvip" || userCommand === "/grantvip") {
          const parts = param.trim().split(/\s+/);
          if (!parts[0]) {
            await ctx.reply("⚠️ *Usage:* `/setvip <userId> [days]`\nExample: `/setvip 8033206631 30`", { parse_mode: "Markdown" });
            return;
          }
          const tId = parts[0];
          const days = parts[1] ? parseInt(parts[1]) : 30;

          let user = await BotUser.findOne({ telegramId: tId });
          if (!user) {
            user = await BotUser.create({ telegramId: tId, firstName: "User " + tId });
          }

          user.isPremium = true;
          user.premiumExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          user.premiumTier = 'premium';
          await user.save();

          await ctx.reply(`👑 *VIP Membership Granted:* User \`${tId}\` has been upgraded to VIP for *${days}* days!`, { parse_mode: "Markdown" });
          return;
        }

        // Remove VIP command: /removevip <targetId>
        if (userCommand === "/removevip") {
          const tId = param.trim();
          if (!tId) {
            await ctx.reply("⚠️ *Usage:* `/removevip <userId>`", { parse_mode: "Markdown" });
            return;
          }

          let user = await BotUser.findOne({ telegramId: tId });
          if (user) {
            user.isPremium = false;
            user.premiumExpiresAt = undefined;
            user.premiumTier = null;
            await user.save();
          }

          await ctx.reply(`❌ *VIP Access Revoked:* User \`${tId}\` reverted to free tier.`, { parse_mode: "Markdown" });
          return;
        }
      }

      // Legacy/standard Admin Commands
      if (userCommand.startsWith("/")) {
        const userDoc = await BotUser.findOne({
          telegramId: String(ctx.from?.id),
        });
        if (userDoc?.isAdmin) {
          if (userCommand === "/setdaily") {
            const limit = parseInt(param);
            if (!isNaN(limit)) {
              await BotGroup.findOneAndUpdate(
                { telegramId: String(ctx.chat.id) },
                { dailyLimit: limit, dailyUsed: 0 },
              );
              await ctx.reply(
                `✅ *Limit Updated* to ${limit} daily searches for this group.`,
              );
            }
            return;
          }
          if (userCommand === "/ban") {
            await BotUser.findOneAndUpdate(
              { telegramId: param },
              { isBanned: true },
            );
            await ctx.reply(`🚫 *User ${param} has been banned.*`);
            return;
          }
          if (userCommand === "/gban") {
            let gId = param.replace("@", "");
            await BotGroup.findOneAndUpdate(
              { telegramId: gId },
              { isBanned: true },
            );
            await ctx.reply(`🚫 *Group ${gId} has been banned.*`);
            return;
          }
          if (userCommand === "/grantpaid") {
            await BotUser.findOneAndUpdate(
              { telegramId: param },
              { isPremium: true },
            );
            await ctx.reply(`💎 *User ${param} granted full premium access.*`);
            return;
          }
          if (userCommand === "/panel") {
            if (ctx.chat.type !== "private") return;
            const userCount = await BotUser.countDocuments();
            const groupCount = await BotGroup.countDocuments();
            const totalInt = await BotUser.aggregate([
              { $group: { _id: null, total: { $sum: "$interactions" } } },
            ]);
            await ctx.reply(
              `📊 *Bot Admin Panel*\n\n👥 *Total Users:* ${userCount}\n🏢 *Total Groups:* ${groupCount}\n📈 *Global Interactions:* ${totalInt[0]?.total || 0}`,
              replyOptions,
            );
            return;
          }
          if (userCommand === "/addchannel") {
            const channelId = param.replace("@", "");
            if (!channelId) {
              await ctx.reply(
                "⚠️ Please provide a channel ID/username: `/addchannel @channelname`",
              );
              return;
            }
            let setting = await Setting.findOne({ key: "forceChannels" });
            let channels = setting?.value || [];
            if (!channels.includes(channelId)) {
              channels.push(channelId);
              await Setting.findOneAndUpdate(
                { key: "forceChannels" },
                { value: channels },
                { upsert: true },
              );
              await ctx.reply(
                `✅ *${channelId}* added to force subscription channels.`,
              );
            } else {
              await ctx.reply(`⚠️ *${channelId}* is already in the list.`);
            }
            return;
          }
          if (userCommand === "/removechannel") {
            const channelId = param.replace("@", "");
            let setting = await Setting.findOne({ key: "forceChannels" });
            let channels = setting?.value || [];
            if (channels.includes(channelId)) {
              channels = channels.filter((c: string) => c !== channelId);
              await Setting.findOneAndUpdate(
                { key: "forceChannels" },
                { value: channels },
              );
              await ctx.reply(
                `✅ *${channelId}* removed from force subscription channels.`,
              );
            } else {
              await ctx.reply(`⚠️ *${channelId}* not found in the list.`);
            }
            return;
          }
        }
      }

      try {
        console.log(`[Bot Text Handler] Database Lookup: Fetching Command definition for command: "${userCommand}"`);
        let cmdDef;
        try {
          cmdDef = await Command.findOne({ command: userCommand });
        } catch (dbErr: any) {
          console.error(`[Bot DB Error] Database lookup failed for Command: "${userCommand}":`, dbErr);
          throw dbErr;
        }

        if (!cmdDef) {
          console.log(`[Bot Text Handler] Logic block: command "${userCommand}" has NO entry/definition in the DB. Ignoring.`);
          return;
        }

        if (cmdDef.isMaintenance === true) {
          await ctx.reply(`⚠️ The command \`${cmdDef.command}\` is currently under maintenance. No credits will be deducted!`, replyOptions);
          return;
        }

        console.log(`[Bot Text Handler] Found registered Command: "${cmdDef.command}" (isApi: ${cmdDef.isApi}, isCreditBased: ${cmdDef.isCreditBased})`);

        const isGroup =
          ctx.chat.type === "group" || ctx.chat.type === "supergroup";

        console.log(`[Bot Text Handler] Database Lookup: Fetching BotUser record for telegramId=${ctx.from?.id}`);
        let userDoc;
        try {
          userDoc = await BotUser.findOne({
            telegramId: String(ctx.from?.id),
          });
        } catch (dbErr: any) {
          console.error(`[Bot DB Error] Database lookup failed for BotUser (telegramId=${ctx.from?.id}):`, dbErr);
          throw dbErr;
        }

        if (userDoc) {
          console.log(`[Bot Text Handler] Found User profile: @${userDoc.username || ''} (${userDoc.telegramId}) | Admin: ${userDoc.isAdmin} | Premium: ${userDoc.isPremium} | Coins: ${userDoc.encCoins}`);
          
          // Self-healing subscription expiry check
          if (userDoc.isPremium && userDoc.premiumExpiresAt) {
            const hasExpired = new Date(userDoc.premiumExpiresAt).getTime() < Date.now();
            if (hasExpired) {
              userDoc.isPremium = false;
              await userDoc.save();
              console.log(`[Bot Text Handler] Premium subscription expired for user ID ${userDoc.telegramId}`);
            }
          }
        } else {
          console.log(`[Bot Text Handler] User profile does not exist in DB for telegramId=${ctx.from?.id}`);
        }

        // Fix markdown syntax for user mention under Markdown V1
        const callerName = ctx.from?.first_name || ctx.from?.username || "User";
        // Just strip brackets that would break the Markdown link syntax instead of hard escaping
        const safeCallerName = callerName
          .replace(/\[/g, "(")
          .replace(/\]/g, ")")
          .replace(/[*_`]/g, "");
        const userMention = `[${safeCallerName}](tg://user?id=${ctx.from?.id})`;

        // Requirement 1: If in group, verify they started the bot previously
        if (isGroup && (!userDoc || !userDoc.hasStartedBot)) {
          console.log(`[Bot Text Handler] Logic block rejection (Requirement 1): User ID ${ctx.from?.id} has not started the bot previously in private chat. Prompting start in Group ID ${ctx.chat.id}`);
          await ctx.reply(
            `⚠️ *Action Required* for ${userMention}\n\nYou must start me in private chat first before using my commands in groups!`,
            {
              ...replyOptions,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🚀 Start Bot Now",
                      url: `https://t.me/${ctx.botInfo.username}?start=group_redirect`,
                      style: "danger",
                    } as any,
                  ],
                ],
              },
            },
          );
          return;
        }

        // Requirement 3: API commands in private chat are restricted to Premium and Admin.
        if (!isGroup && cmdDef.isApi) {
          const isAllowed = userDoc && (userDoc.isAdmin || userDoc.isPremium);
          if (!isAllowed) {
            console.log(`[Bot Text Handler] Logic block rejection (Requirement 3): Non-premium user ID ${ctx.from?.id} requested API command "${userCommand}" in private chat.`);
            
            const appUrl = getAppUrl();
            const shopUrl = `${appUrl}/shop?userid=${ctx.from?.id || ""}`;

            await ctx.reply(
              `⚠️ *Premium Benefit Required*\n\nSorry ${userMention}, API commands inside private chat are restricted to *Premium subscribers* or *Admins*.\n\nSubscribe for ₹80/month to unlock private chat access and other exclusive benefits!`,
              {
                ...replyOptions,
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "👑 Upgrade to Premium",
                        web_app: { url: shopUrl },
                        style: "success",
                      } as any,
                    ],
                    [
                      {
                        text: "↗️ Join Group (Free)",
                        url: "https://t.me/encorexg",
                        style: "primary",
                      } as any,
                    ],
                  ],
                },
              },
            );
            return;
          }
        }

        // Requirement 4: Credit Based Limit
        let shouldIncrementCredit = false;
        if (cmdDef.isCreditBased && (!userDoc || !userDoc.isAdmin)) {
          console.log(`[Bot Text Handler] Inspecting command credits for Command: "${userCommand}", User ID: ${ctx.from?.id}`);
          const today = new Date().toISOString().split("T")[0];

          let override = userDoc?.commandCredits?.find(
            (c: any) => c.command === userCommand,
          );
          let usage = userDoc?.commandUsage?.find(
            (u: any) => u.command === userCommand,
          );

          let usedToday =
            usage && usage.lastResetDate === today ? usage.used : 0;
          let limit = override
            ? override.dailyLimit
            : cmdDef.defaultDailyCredits;

          let isUserPremium = userDoc?.isPremium;
          if (isUserPremium && userDoc.premiumExpiresAt && new Date(userDoc.premiumExpiresAt).getTime() < Date.now()) {
            isUserPremium = false;
          }

          let isUnlimited = override ? override.isUnlimited : false;

          console.log(`[Bot Text Handler] Credit constraints inside code details: isUnlimited=${isUnlimited} | limit=${limit} | usedToday=${usedToday}`);

          if (!isUnlimited && usedToday >= limit) {
            console.log(`[Bot Text Handler] Daily limit reached or exceeded: usedToday=${usedToday} >= limit=${limit}. Testing fallbacks or alternative credits.`);
            
            // Try Common Credits
            const commonCredits = userDoc?.commonCredits
              ? userDoc.commonCredits.get(userCommand) || 0
              : 0;
            
            console.log(`[Bot Text Handler] User's common credits balance for "${userCommand}": ${commonCredits}`);

            if (commonCredits > 0) {
              console.log(`[Bot Text Handler] Common credit available. Deducting 1 from common credits balance.`);
              userDoc.commonCredits.set(userCommand, commonCredits - 1);
              try {
                await userDoc.save();
              } catch (saveErr) {
                console.error(`[Bot DB Error] Failed saving updated common credits for user ${ctx.from?.id}:`, saveErr);
                throw saveErr;
              }

              // Notify User
              try {
                const botInstance = getBot();
                if (botInstance) {
                  await botInstance.telegram.sendMessage(
                    String(ctx.from.id),
                    `⚠️ *Common Credit Used*\n\nYou have used 1 out of total available common credits for "${userCommand}", now you have left "${commonCredits - 1}" Credits.`,
                  );
                }
              } catch (e) {
                console.error(
                  "Failed to send private DM about common credit usage",
                  e,
                );
              }
              // Allow execution by not returning
            } else {
              console.log(`[Bot Text Handler] Logic block rejection (Requirement 4): User ID ${ctx.from?.id} has no remaining credits for "${userCommand}". Daily Used: ${usedToday}/${limit}, Common credits: ${commonCredits}. Sending limit notice block.`);
              let buyUrl = cmdDef.buyCreditsUrl || "https://t.me/modifucker";
              if (cmdDef.isCreditBased && cmdDef.isForSale) {
                const botUsername = ctx.botInfo?.username || "bot";
                buyUrl = `https://t.me/${botUsername}?start=shop`;
              }

              // Dynamic webapp URL configuration
              const appUrl = getAppUrl();
              const earnUrl = `${appUrl}/rewards?userid=${ctx.from?.id || ""}`;

              const limitText = `⚠️ *Daily Limit Reached*\n\nSorry ${userMention}, you have used all your daily credits (${limit}/${limit}) and common credits for this command. Please wait for tomorrow or increase your credits.`;
              const inlineKeyboard = [
                [{ text: "💎 Buy Paid Credits", url: buyUrl, style: "success" } as any],
                [
                  {
                    text: "EARN FREE CREDITS",
                    url: `https://t.me/${ctx.botInfo?.username || "bot"}?start=earn`,
                    style: "danger",
                  } as any,
                ],
              ];

              try {
                await ctx.reply(limitText, {
                  ...replyOptions,
                  reply_markup: {
                    inline_keyboard: inlineKeyboard,
                  },
                });
              } catch (errKey) {
                console.warn(
                  "Daily Limit message failed with full reply options, trying fallback...",
                  errKey,
                );
                try {
                  await ctx.reply(limitText, {
                    parse_mode: "Markdown",
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  });
                } catch (errKey2) {
                  console.warn(
                    "Daily Limit message failed with Markdown, trying plain text fallback...",
                    errKey2,
                  );
                  const plainLimitText = `⚠️ Daily Limit Reached\n\nSorry, you have used all your daily credits (${limit}/${limit}) and common credits for this command. Please wait for tomorrow or increase your credits.`;
                  await ctx.reply(plainLimitText, {
                    reply_markup: {
                      inline_keyboard: inlineKeyboard,
                    },
                  }).catch((errLast) =>
                    console.error(
                      "Ultimate daily limit display failure:",
                      errLast,
                    ),
                  );
                }
              }
              return;
            }
          } else {
            shouldIncrementCredit = true;
          }
        }

        // Force Subscribe Check
        let forceChannelsSetting = await Setting.findOne({
          key: "forceChannels",
        });
        let requiredChannels = forceChannelsSetting?.value || [];

        let notJoined: any[] = [];
        if (requiredChannels.length > 0 && ctx.from) {
          for (const channel of requiredChannels) {
            // channel is now {id, link}
            const channelId =
              typeof channel === "string" ? channel : channel.id;
            try {
              const member = await ctx.telegram.getChatMember(
                channelId,
                ctx.from.id,
              );
              if (member.status === "left" || member.status === "kicked") {
                notJoined.push(channel);
              }
            } catch (e) {
              notJoined.push(channel); // assume not joined on error
            }
          }
        }

        if (notJoined.length > 0) {
          const buttons = notJoined.map((ch, idx) => {
            // Use link if present, fallback to t.me link
            const url =
              typeof ch === "object" && ch.link
                ? ch.link
                : `https://t.me/${(typeof ch === "string" ? ch : ch.id).replace("@", "")}`;
            return { text: `Join Channel ${idx + 1}`, url, style: "danger" };
          });

          // Save execution context to be executed on click
          const actionId = Math.random().toString(36).substring(2, 10);
          await PendingAction.create({
            actionId,
            command: userCommand,
            param,
            telegramId: String(ctx.from?.id),
            messageId: ctx.message.message_id,
          });

          await ctx.reply(
            `⚠️ *Subscription Required* for ${userMention}\n\nYou must join our channels to use this bot!`,
            {
              ...replyOptions,
              reply_markup: {
                inline_keyboard: [
                  ...buttons.map((b) => [b] as any),
                  [
                    {
                      text: "Show Result",
                      callback_data: `check_sub:${actionId}`,
                      style: "success",
                    } as any,
                  ],
                ],
              },
            },
          );
          return;
        }

        await executeApiCommand(
          ctx,
          userCommand,
          param,
          cmdDef,
          replyOptions,
          shouldIncrementCredit,
        );
      } catch (e: any) {
        console.error("Bot command execution error:", e);
        try {
          await ctx.reply(`❌ *ERROR HAPPENED*`, {
            parse_mode: "Markdown",
            reply_parameters: { message_id: ctx.message.message_id },
          });
        } catch (innerErr) {
          try {
            await ctx.reply(`❌ ERROR HAPPENED`, {
              reply_parameters: { message_id: ctx.message.message_id },
            });
          } catch (innerErr2) {
            await ctx.reply(`❌ ERROR HAPPENED`).catch(() => {});
          }
        }
      }
    } catch (globalErr: any) {
      console.error("Bot global text error:", globalErr);
    }
  });

  bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
  });
}
