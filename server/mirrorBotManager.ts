import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import mongoose from "mongoose";
import { MirrorBot, Command, BotUser, BotGroup, Setting, Statlog, PendingAction, connectDB, MirrorWallet, MirrorWithdrawalRequest, UsedTransaction, Coupon, getCachedAppUrl } from "./db.js";
import { isMemberOfChannel } from "./bot.js";

const activeMirroredBots = new Map<string, Telegraf>();

// Global session state tracker for in-bot shop transactions across cloned bots
const botShopStates = new Map<string, {
  state: 'awaiting_credit_qty' | 'awaiting_utr' | 'awaiting_coupon';
  type: 'sub' | 'credits';
  productId: string; // tier ID or command name
  amount: number;
  creditsCount?: number;
  couponCode?: string;
  originalAmount?: number;
}>();

// Verify Fampay Payment using Gateway API mirroring bot.ts logic
async function verifyFampayPayment(paymentId: string, amount: number) {
  const cleanPaymentId = String(paymentId).trim();
  let foundTxn: any = null;

  try {
    const utrRes = await axios.get(`https://famnify.vercel.app/fampay?utr=${cleanPaymentId}`);
    if (utrRes.data && utrRes.data.found && utrRes.data.results && utrRes.data.results.length > 0) {
      foundTxn = utrRes.data.results.find((item: any) => {
        const isSuccess = String(item.Payment).toLowerCase() === 'success';
        const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0;
        return isSuccess && isAmountMatch;
      });
    }

    if (!foundTxn) {
      const idRes = await axios.get(`https://famnify.vercel.app/fampay?id=${cleanPaymentId}`);
      if (idRes.data && idRes.data.found && idRes.data.results && idRes.data.results.length > 0) {
        foundTxn = idRes.data.results.find((item: any) => {
          const isSuccess = String(item.Payment).toLowerCase() === 'success';
          const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0;
          return isSuccess && isAmountMatch;
        });
      }
    }
  } catch (err) {
    console.error("Fampay verification error in mirrorBotManager:", err);
  }
  return foundTxn;
}

// Get running instance or null
export function getMirroredBotInstance(token: string): Telegraf | null {
  return activeMirroredBots.get(token) || null;
}

export async function getMirroredBotInstanceByUsername(botRefUsername: string): Promise<Telegraf | null> {
  if (!botRefUsername) return null;
  const normalizedUsername = botRefUsername.trim().replace("@", "");
  const botDoc = await MirrorBot.findOne({ 
    $or: [
      { botUsername: normalizedUsername },
      { botUsername: "@" + normalizedUsername }
    ]
  });
  if (!botDoc) return null;
  return activeMirroredBots.get(botDoc.token) || null;
}

export function isCurrentlySandboxOrDev(): boolean {
  if (process.env.VERCEL === "1" || process.env.VERCEL_URL) return false;
  if (process.env.NODE_ENV === "production" && !process.env.FORCE_POLLING) return false;
  return true;
}

export async function checkAndResetExpiredPlan(botDoc: any): Promise<any> {
  if (!botDoc) return null;
  if (botDoc.plan && botDoc.plan !== 'free' && botDoc.expiresAt) {
    if (new Date(botDoc.expiresAt).getTime() < Date.now()) {
      console.log(`[Expiry Engine] Plan ${botDoc.plan.toUpperCase()} for bot @${botDoc.botUsername || botDoc.token.substring(0,8)} expired on ${botDoc.expiresAt}. Reverting to FREE.`);
      botDoc.plan = 'free';
      await botDoc.save();
    }
  }
  return botDoc;
}

// Check plan constraints on custom channels
export function getMaxForceChannels(plan: string): number {
  switch (plan) {
    case 'free': return 1;
    case 'silver': return 2;
    case 'gold': return 5;
    case 'max': return 10;
    default: return 1;
  }
}

// Check if a client-side credit edit is within limits for Gold plan
export function isCreditOverrideAllowed(plan: string, globalCredits: number, newLimit: number, extraLimitFromAdmin?: number): boolean {
  if (plan === 'max') return true;
  if (plan === 'free') return false; // Free can't edit
  
  // Gold can change up to 2x or extra admin allowed limit
  if (plan === 'gold') {
    const allowedMax = Math.max(globalCredits * 2, extraLimitFromAdmin || 0);
    return newLimit <= allowedMax;
  }
  
  // Silver can override with custom numbers
  return true;
}

export function currentMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getBotIntegrationPointsLimit(plan: string): number {
  const normalized = (plan || 'free').toLowerCase();
  if (normalized === 'silver') return 50000;
  if (normalized === 'gold') return 200000;
  if (normalized === 'max') return 1500000;
  return 10000; // free limit
}

export async function checkAndResetIntegrationPoints(botDoc: any): Promise<boolean> {
  const currentMonth = currentMonthString();
  const ownerId = botDoc.ownerTelegramId;
  if (!ownerId) {
    return botDoc.isPointsExceeded || false;
  }

  // Find or create central usage record for this owner to share across all her/his active or recreation bots
  const MirrorOwnerPoints = mongoose.models.MirrorOwnerPoints || mongoose.model('MirrorOwnerPoints', new mongoose.Schema({
    ownerTelegramId: { type: String, required: true, unique: true },
    integrationPointsUsed: { type: Number, default: 0 },
    integrationPointsMonth: { type: String, default: "" }
  }, { timestamps: true }), 'encore_mirror_owner_points');

  let ownerPoints = await MirrorOwnerPoints.findOne({ ownerTelegramId: ownerId });
  if (!ownerPoints) {
    ownerPoints = await MirrorOwnerPoints.create({
      ownerTelegramId: ownerId,
      integrationPointsUsed: 0,
      integrationPointsMonth: currentMonth
    });
  }

  let ownerModified = false;
  if (ownerPoints.integrationPointsMonth !== currentMonth) {
    ownerPoints.integrationPointsMonth = currentMonth;
    ownerPoints.integrationPointsUsed = 0;
    ownerModified = true;
  }

  if (ownerModified) {
    await ownerPoints.save();
  }

  const limit = getBotIntegrationPointsLimit(botDoc.plan);
  let botModified = false;

  if (botDoc.integrationPointsMonth !== currentMonth) {
    botDoc.integrationPointsMonth = currentMonth;
    botModified = true;
  }

  if (botDoc.integrationPointsUsed !== ownerPoints.integrationPointsUsed) {
    botDoc.integrationPointsUsed = ownerPoints.integrationPointsUsed;
    botModified = true;
  }

  const isExceeded = ownerPoints.integrationPointsUsed >= limit;
  if (botDoc.isPointsExceeded !== isExceeded) {
    botDoc.isPointsExceeded = isExceeded;
    botModified = true;
  }

  if (botModified) {
    await botDoc.save();
  }

  return isExceeded;
}

// Setup a mirrored bot dynamic event handlers
export async function startMirrorBot(mirrorBotDoc: any, skipSetupWebhook = false) {
  const token = mirrorBotDoc.token;
  let wasRunning = false;
  if (activeMirroredBots.has(token)) {
    console.log(`[Mirror Bot Manager] Re-starting bot and stopping old poller for token: ${token.substring(0, 10)}...`);
    wasRunning = true;
    stopMirrorBot(token);
  }

  if (wasRunning) {
    // Wait for the previous Telegraf poller to fully stop before launching a new polling connection
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  const bot = new Telegraf(token);

  // 1. Setup global interaction & tracking middleware
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return next();
    
    // Refresh mirror bot doc dynamically to fetch latest ban list, plans, etc.
    const reloadedBotDoc = await MirrorBot.findOne({ token });
    if (reloadedBotDoc) {
      await checkAndResetExpiredPlan(reloadedBotDoc);
    }
    if (!reloadedBotDoc || !reloadedBotDoc.isActive) {
      console.log(`[Mirror Bot Tracker] Bot is disabled, ignoring message.`);
      return;
    }

    // Check / reset monthly Integration Points
    const pointsExceeded = await checkAndResetIntegrationPoints(reloadedBotDoc);
    if (pointsExceeded) {
      console.log(`[Mirror Bot Tracker] Bot is suspended due to Integration Points exhaustion.`);
      return;
    }

    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const chatId = String(ctx.chat.id);
    const userId = ctx.from ? String(ctx.from.id) : null;

    // Check specific bans on this mirror bot
    if (userId && reloadedBotDoc.bannedUsers?.includes(userId)) {
      console.log(`[Mirror Bot Ban] Banned User ${userId} ignored.`);
      return;
    }
    if (reloadedBotDoc.bannedGroups?.includes(chatId)) {
      console.log(`[Mirror Bot Ban] Banned Group ${chatId} ignored.`);
      if (isGroup) {
        try {
          await ctx.leaveChat(); // Leave banned groups automatically
        } catch (e) {}
      }
      return;
    }

    // Save user/group mapping to enable the Global Broadcast features
    const botUsername = ctx.botInfo?.username || reloadedBotDoc.botUsername;
    
    try {
      if (isGroup) {
        let group = await BotGroup.findOne({ telegramId: chatId });
        if (!group) {
          group = await BotGroup.create({ telegramId: chatId, title: ctx.chat.title });
        }
        if (group.isBanned) return; // Central ban check
        
        group.interactions += 1;
        if (botUsername && !group.interactedBots.includes(botUsername)) {
          group.interactedBots.push(botUsername);
          group.markModified('interactedBots');
        }
        await group.save();

        if (userId) {
          let u = await BotUser.findOne({ telegramId: userId });
          if (u && u.isBanned) return;
        }
      } else if (userId && ctx.from) {
        let user = await BotUser.findOne({ telegramId: userId });
        if (!user) {
          user = await BotUser.create({
            telegramId: userId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            hasStartedBot: true,
          });
        }
        if (user.isBanned) return; // User banned centrally
        
        user.interactions += 1;
        if (!user.hasStartedBot) user.hasStartedBot = true;
        if (botUsername && !user.interactedBots.includes(botUsername)) {
          user.interactedBots.push(botUsername);
          user.markModified('interactedBots');
        }
        await user.save();
      }
    } catch (e) {
      console.error("[Mirror Bot Tracking Middleware Error]", e);
    }

    return next();
  });

  // Action: Callback subscription checking & processing
  bot.action(/^check_sub:(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];
    
    try {
      const pending = await PendingAction.findOne({ actionId });
      if (!pending) {
        return ctx.answerCbQuery("Session expired. Please run the command again!", { show_alert: true });
      }

      if (String(ctx.from?.id) !== pending.telegramId) {
        return ctx.answerCbQuery("⚠️ This button is not for you! Run your own command.", { show_alert: true });
      }

      // Reload config
      const doc = await MirrorBot.findOne({ token });
      if (!doc) return ctx.answerCbQuery("Bot Configuration is missing.");

      // Verify subscriptions
      const isPremiumAdmin = false; // Mirror bots use plan-based restrictions
      const missedChannels: any[] = [];

      // 1. Fixed main channel
      if (doc.plan !== 'max') {
        const joinedMain = await isMemberOfChannel('@encorexosint', pending.telegramId);
        if (!joinedMain) {
          missedChannels.push({ id: '@encorexosint', link: 'https://t.me/encorexosint' });
        }
      }

      // 2. Custom channels
      if (doc.forceChannels && doc.forceChannels.length > 0) {
        for (const channel of doc.forceChannels) {
          const channelId = typeof channel === "string" ? channel : (channel.username || channel.id);
          try {
            const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
            if (member.status === "left" || member.status === "kicked") {
              missedChannels.push(channel);
            }
          } catch (e) {
            missedChannels.push(channel);
          }
        }
      }

      if (missedChannels.length > 0) {
        return ctx.answerCbQuery("You have NOT joined all required channels!", { show_alert: true });
      }

      await ctx.answerCbQuery("Verification successful! Processing...");
      try {
        await ctx.deleteMessage();
      } catch (e) {}

      // Check command definition
      let cmdDef = doc.customCommands?.find((c: any) => c.command === pending.command);
      if (!cmdDef) {
        cmdDef = await Command.findOne({ command: pending.command });
      }

      if (!cmdDef) return;

      const replyOptions = {
        parse_mode: "Markdown" as const,
        reply_to_message_id: pending.messageId,
        reply_parameters: pending.messageId ? { message_id: pending.messageId } : undefined,
      };

      // Execute command
      await executeCommandCore(ctx, pending.command, pending.param || "", cmdDef, replyOptions, doc);
    } catch (err) {
      console.error("[Mirror Bot Sub Callback error]", err);
      await ctx.answerCbQuery("Error verifying. Please try again.").catch(() => {});
    }
  });

  // Action: Start, Help, Profile mappings
  const showMirrorHelp = async (ctx: any) => {
    const doc = await MirrorBot.findOne({ token });
    if (!doc) return;

    let txt = `🤖 *How to use ${doc.customBotName || doc.botName || 'this bot'}*\n\n` +
      `This is a mirror bot supporting advanced API command utilities:\n\n` +
      `⚡ *Available Commands*\n\n`;

    // Normal main commands
    const defaultCommands = await Command.find({});
    for (const c of defaultCommands) {
      if (doc.plan !== 'free' && doc.excludedCommands?.includes(c.command)) {
        continue; // Excluded by SILVER/GOLD/MAX admins
      }
      let icon = "🟢";
      if (c.isPremium) icon = "💎";
      else if (c.isCreditBased) icon = "⚡️";
      txt += `${icon} \`${c.command}\` - ${c.description || "No description"}\n`;
    }

    // Custom commands
    const customCommandsList = doc.customCommands || [];
    if (customCommandsList.length > 0) {
      txt += `\n✨ *Custom Commands (Added by Admin)*\n\n`;
      for (const cc of customCommandsList) {
        let icon = cc.isCreditBased ? "⚡️" : "🟢";
        txt += `${icon} \`${cc.command}\` - ${cc.description || "Custom api command"}\n`;
      }
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 Back to Start", callback_data: "view_start" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
      await ctx.reply(txt, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    }
  };

  const showMirrorProfile = async (ctx: any) => {
    const doc = await MirrorBot.findOne({ token });
    if (!doc) return;

    const userId = String(ctx.from?.id);
    let userDoc = await BotUser.findOne({ telegramId: userId });
    if (!userDoc) {
      userDoc = await BotUser.create({ telegramId: userId, firstName: ctx.from?.first_name });
    }

    let profileText = `👤 *Your Profile*\n\n` +
      `🔑 *Telegram ID:* \`${userId}\`\n` +
      `👑 *Role:* ${userDoc.isAdmin ? "Admin" : userDoc.isPremium ? "Premium member" : "Free User"}\n` +
      `💰 *ENC Coins:* ${userDoc.encCoins || 0}\n\n` +
      `👥 *Daily Group Credits (This Bot)*\n` +
      `• Limit: ${doc.defaultGroupCredits || 50} searches/day\n\n`;

    // Loop commands
    const defaultCommands = await Command.find({ isCreditBased: true });
    if (defaultCommands.length > 0) {
      profileText += `⚡️ *Command Credits*\n`;
      for (const cmd of defaultCommands) {
        if (doc.plan !== 'free' && doc.excludedCommands?.includes(cmd.command)) continue;
        
        // Check for any mirror override limit
        const override = doc.commandCreditsOverrides?.find((o: any) => o.command === cmd.command);
        const limit = override ? override.dailyLimit : cmd.defaultDailyCredits;

        const usage = userDoc.commandUsage?.find((u: any) => u.command === cmd.command);
        const today = new Date().toISOString().split("T")[0];
        const usedToday = usage && usage.lastResetDate === today ? usage.used : 0;

        const commonBalance = userDoc.commonCredits ? userDoc.commonCredits.get(cmd.command) || 0 : 0;
        profileText += `• \`${cmd.command}\`: Daily: \`${usedToday}/${limit}\` | Additional: *${commonBalance}*\n`;
      }
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🏰 My Group Stats", callback_data: "view_my_groups" },
          { text: "📜 Purchase History", callback_data: "view_purchase_history" }
        ],
        [{ text: "🔙 Back to Main", callback_data: "view_start" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(profileText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
      await ctx.reply(profileText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    }
  };

  const showMirrorShop = async (ctx: any) => {
    const doc = await MirrorBot.findOne({ token });
    if (!doc) return;

    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    const appUrl = vercelUrl
      ? `https://${vercelUrl}`
      : process.env.VITE_APP_URL || process.env.APP_URL || "https://ais-dev-7zposvri3knpwk5wp3qxma-68179712237.asia-southeast1.run.app";
    const shopUrl = `${appUrl}/shop?userid=${ctx.from?.id || ""}&botRef=${doc.botUsername || ""}`;

    let mainBotUsername = "EncoreXosintBot";
    try {
      const { getBot } = await import("./bot.js");
      const mainBot = getBot();
      if (mainBot) {
        if (mainBot.botInfo?.username) {
          mainBotUsername = mainBot.botInfo.username;
        } else {
          const me = await mainBot.telegram.getMe();
          mainBotUsername = me.username;
        }
      }
    } catch (e) {}

    const isSandbox = isCurrentlySandboxOrDev();
    const isAppUrlSandbox = !appUrl || 
                            appUrl.includes("localhost") || 
                            appUrl.includes("127.0.0.1") || 
                            appUrl.includes("ais-dev") || 
                            appUrl.includes("ais-pre") || 
                            appUrl.includes("googleusercontent.com");

    const useMainBotRedirect = isSandbox || isAppUrlSandbox;

    const messageText = `🛍️ *Bot Shop* 🛍️\n\n` +
      `Upgrade your account status or purchase command credits to unlock higher daily command limits!\n\n` +
      `Your purchases apply globally across all our bot mirrors. Select an option below:`;

    const keyboard = {
      inline_keyboard: [
        [
          useMainBotRedirect
            ? { text: "🛍️ OPEN MAIN BOT STORE", url: `https://t.me/${mainBotUsername}?start=shop` }
            : { text: "🛍️ OPEN STORE IN WEBAPP", web_app: { url: shopUrl } }
        ],
        [{ text: "🎫 PURCHASE BOT MEMBERSHIP", callback_data: "shop_sub_tier_menu" }],
        [{ text: "⚡ BUY COMMAND CREDITS", callback_data: "shop_credits_menu" }],
        [
          useMainBotRedirect
            ? { text: "🤖 MAKE YOUR OWN BOT", url: `https://t.me/${mainBotUsername}?start=mirrors` }
            : { text: "🤖 MAKE YOUR OWN BOT", web_app: { url: `${appUrl}/mirrors?userid=${ctx.from?.id || ""}` } }
        ],
        [{ text: "🔙 Back to Start", callback_data: "view_start" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(messageText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
      await ctx.reply(messageText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    }
  };

  const showMirrorStart = async (ctx: any) => {
    const doc = await MirrorBot.findOne({ token });
    if (!doc) return;

    const keyboard = {
      inline_keyboard: [
        [{ text: "👤 My Profile", callback_data: "view_profile" }, { text: "🛍️ Bot Shop", callback_data: "view_shop" }],
        [{ text: "ℹ️ Help Center", callback_data: "view_help" }],
      ]
    };

    const welcome = `✨ *Welcome to ${doc.customBotName || doc.botName || 'Mirrored Bot'}* ✨\n\n` +
      `✅ *Status:* Bot is fully operational.\n\n` +
      `This bot gives you immediate access to full OSINT commands and premium details! Use /help to see all of them.`;

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(welcome, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
      await ctx.reply(welcome, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    }
  };

  // --- CLONED BOT IN-BOT BILLING & SHOP SYSTEM ---
  const generateSubCheckoutMessage = async (ctx: any, userId: string, matchedTier: any, amount: number, couponCode?: string) => {
    botShopStates.set(userId, {
      state: 'awaiting_utr',
      type: 'sub',
      productId: matchedTier.id,
      amount: amount,
      couponCode: couponCode
    });

    const cleanName = `${matchedTier.name} Subscription`.replace(/[^a-zA-Z0-9]/g, ' ');
    const upiString = `upi://pay?pa=alkhkumar@fam&pn=ENCORE_XOSINT_Shop&am=${amount}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
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
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
    } catch (err: any) {
      await ctx.reply(captionText + `\n\n🖼️ [Payment QR Code](${qrCodeUrl})`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
    }
  };

  const handleCouponInput = async (ctx: any, userId: string, text: string) => {
    const stateData = botShopStates.get(userId);
    if (!stateData || stateData.state !== 'awaiting_coupon') return;

    const codeEntered = text.trim().toUpperCase();
    if (text.startsWith("/")) {
      if (text === "/cancel" || text === "/shop" || text === "/start") {
        botShopStates.delete(userId);
        await ctx.reply("❌ Coupon entry canceled. Session terminated.");
      } else {
        await ctx.reply("⚠️ Invalid promo code. Send a code or click skip coupon to continue.");
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

    const original = stateData.originalAmount ?? matchedTier.price;
    const valDiscount = (original * coupon.discountPercent) / 100;
    const discountedRate = Math.round((original - valDiscount) * 100) / 100;

    await generateSubCheckoutMessage(ctx, userId, matchedTier, discountedRate, coupon.code);
  };

  const handleCreditsQtyInput = async (ctx: any, userId: string, text: string) => {
    const stateData = botShopStates.get(userId);
    if (!stateData || stateData.state !== 'awaiting_credit_qty' || stateData.type !== 'credits') return;

    const qty = parseInt(text);
    if (isNaN(qty) || qty <= 0) {
      await ctx.reply("⚠️ *Invalid Quantity*\n\nPlease enter a valid positive integer number of credits (e.g. 50).");
      return;
    }

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

    const pricePer = cmd.pricePerCredit || 0.5;
    const basePrice = qty * pricePer;

    const user = await BotUser.findOne({ telegramId: userId });
    let finalPrice = basePrice;
    let discountPercent = 0;
    let hasDiscount = false;

    if (user && user.isPremium) {
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

    botShopStates.set(userId, {
      state: 'awaiting_utr',
      type: 'credits',
      productId: cmd.command,
      amount: finalPrice,
      creditsCount: qty
    });

    const cleanName = `${qty} credits for ${cmd.command}`.replace(/[^a-zA-Z0-9]/g, ' ');
    const upiString = `upi://pay?pa=alkhkumar@fam&pn=ENCORE_XOSINT_Shop&am=${finalPrice}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
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
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
    } catch (err: any) {
      await ctx.reply(captionText + `\n\n🖼️ [Payment QR Code](${qrCodeUrl})`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });
    }
  };

  const handleUtrVerificationInput = async (ctx: any, userId: string, text: string) => {
    const stateData = botShopStates.get(userId);
    if (!stateData || stateData.state !== 'awaiting_utr') return;

    const paymentId = text.trim();
    const amount = stateData.amount;
    const productId = stateData.productId;

    const waitMsg = await ctx.reply("🔍 *Verifying payment transaction...* Please wait up to 10 seconds...", { parse_mode: "Markdown" });

    try {
      const spentTxn = await UsedTransaction.findOne({ transactionId: paymentId });
      if (spentTxn) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply("⚠️ *Already Used*\n\nThis transaction/UTR ID has already been verified and used in our shop before.", {
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
          }
        });
        return;
      }

      let foundTxn = await verifyFampayPayment(paymentId, amount);

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
        } catch (logErr) {}

        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply(`⚠️ *Transaction Not Found*\n\nPayment transaction was not found on Fampay or the amount does not match *₹${amount}*.\n\nPlease check again and send correct ID or click cancel:`, {
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
          }
        });
        return;
      }

      const finalUtr = foundTxn.utr || paymentId;
      const finalTxnId = foundTxn.txn_id || paymentId;

      const doubleSpentCheckUtr = await UsedTransaction.findOne({ transactionId: finalUtr });
      const doubleSpentCheckTxn = await UsedTransaction.findOne({ transactionId: finalTxnId });
      if (doubleSpentCheckUtr || doubleSpentCheckTxn) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply("⚠️ *Already Spent*\n\nThis payment transaction was already applied for another purchase. Checkout canceled.");
        return;
      }

      if (finalUtr) {
        await UsedTransaction.create({ transactionId: finalUtr, telegramId: userId, amount: Number(amount), type: productId });
      }
      if (finalTxnId && finalTxnId !== finalUtr) {
        await UsedTransaction.create({ transactionId: finalTxnId, telegramId: userId, amount: Number(amount), type: productId });
      }

      const userDoc = await BotUser.findOne({ telegramId: userId });
      if (!userDoc) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        await ctx.reply("❌ Error: Profile not found. Please run /start and try again.");
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

        let tierName = 'Premium Membership';
        const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
        if (tiersSetting && Array.isArray(tiersSetting.value)) {
          const matched = tiersSetting.value.find((t: any) => t.id === productId);
          if (matched) {
            tierName = `${matched.name} Subscription`;
            if (Array.isArray(matched.commands)) {
              if (!userDoc.commonCredits) userDoc.commonCredits = new Map();
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
        const creditsCount = stateData.creditsCount || 10;
        if (!userDoc.commonCredits) userDoc.commonCredits = new Map();
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
            finalProductName = `${finalProductName} (Coupon: ${coupon.code})`;
          }
        } catch (couponErr) {}
      }

      userDoc.purchaseHistory.push({
        productId,
        productName: finalProductName,
        price: Number(amount),
        transactionId: finalTxnId,
        utr: finalUtr,
        date: new Date(),
        status: 'Success'
      });
      await userDoc.save();

      // Credit commission to the host (mirror bot owner)
      const thisMirrorDoc = await MirrorBot.findOne({ token });
      if (thisMirrorDoc && thisMirrorDoc.botUsername) {
        try {
          await creditMirrorBotCommission(thisMirrorDoc.botUsername, Number(amount), finalProductName || productId);
        } catch (commErr) {
          console.error("Failed to credit commission inside mirror bot:", commErr);
        }
      }

      botShopStates.delete(userId);
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(`🎉 *Purchase Successful!*\n\nYour payment of *₹${amount}* was verified.\n✅ *Product:* ${finalProductName}\n\nThank you for supporting us! Enjoy your purchase.`);
    } catch (err: any) {
      console.error(err);
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply("❌ Error finalizing transaction. Please message support.");
    }
  };

  // Register interactive in-bot shop Telegraf Action callbacks
  bot.action("shop_sub_tier_menu", async (ctx) => {
    try {
      const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
      const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];

      let messageText = "🎫 *Purchase Bot Membership* 🎫\n\n" +
        "Bypass all default daily search limits, unlock API commands in private chat, and gain a flat discount on credit purchase checkouts!\n\n" +
        "Select a billing tier below to see plans and benefits:";

      const subButtons = [];
      for (const tier of tiers) {
        subButtons.push([{
          text: `👑 ${tier.name} - ₹${tier.price}/month`,
          callback_data: `shop_sub_details:${tier.id}`
        }]);
      }

      if (subButtons.length === 0) {
        subButtons.push([{
          text: "👑 Bot Premium (Monthly) - ₹80/month",
          callback_data: "shop_sub_details:premium"
        }]);
      }

      subButtons.push([{ text: "🔙 Back to Shop", callback_data: "view_shop" }]);

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: subButtons }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err: any) {
      console.error(err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading tiers").catch(() => ({}));
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

      await generateSubCheckoutMessage(ctx, userId, matchedTier, stateData.originalAmount || matchedTier.price);
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err) {
      console.error(err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Checkout error").catch(() => ({}));
    }
  });

  bot.action("shop_credits_menu", async (ctx) => {
    try {
      const sellableCommands = await Command.find({ isForSale: true });

      let messageText = "⚡ *Buy Command Credits* ⚡\n\n" +
        "Purchase custom credit counts to power individual API integration search commands. Standard unit rates apply.\n\n" +
        "Select a command bundle below to see details and pricing:";

      const credButtons = [];
      for (const cmd of sellableCommands) {
        credButtons.push([{
          text: `🔑 ${cmd.command} (₹${cmd.pricePerCredit || 0.5}/credit)`,
          callback_data: `shop_credit_details:${cmd.command}`
        }]);
      }

      if (credButtons.length === 0) {
        messageText = "⚡ *Buy Command Credits* ⚡\n\n" +
          "No separate command credit packages are currently configured/published in the shop. Check again later!";
      }

      credButtons.push([{ text: "🔙 Back to Shop", callback_data: "view_shop" }]);

      await ctx.editMessageText(messageText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: credButtons }
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.error(e);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading credit packs").catch(() => ({}));
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

      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
      }

      await ctx.reply(messageText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "❌ Cancel Checkout", callback_data: "shop_cancel_payment" }]]
        }
      });

      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (err) {
      console.error(err);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Checkout error").catch(() => ({}));
    }
  });

  bot.action("shop_cancel_payment", async (ctx) => {
    const userId = String(ctx.from?.id);
    botShopStates.delete(userId);
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id).catch(() => {});
    }
    await ctx.reply("❌ Payment checkout canceled. Returning to shop menu...");
    await showMirrorShop(ctx);
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
  });

  bot.action("view_help", showMirrorHelp);
  bot.action("view_profile", showMirrorProfile);
  bot.action("view_shop", showMirrorShop);
  bot.action("view_start", showMirrorStart);

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
      console.error("[Mirror Purchase history action err]", err);
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
        await ctx.answerCbQuery("You have not added the bot to any groups yet.", {
          show_alert: true,
        }).catch(() => ({}));
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
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Profile", callback_data: "view_profile" }],
          ],
        },
      }).catch(() => {});
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => ({}));
    } catch (e: any) {
      console.error("[Mirror Group stats action err]", e);
      if (ctx.callbackQuery) await ctx.answerCbQuery("Error loading groups").catch(() => ({}));
    }
  });

  // 2. Incoming text messages router
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = String(ctx.from?.id);

    // Filter active checkout/payment state sessions
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

    try {
      const parts = text.split(" ");
      let userCommand = parts[0];
      if (userCommand.includes("@")) {
        userCommand = userCommand.split("@")[0];
      }
      const param = parts.slice(1).join(" ");
      const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
      
      const doc = await MirrorBot.findOne({ token });
      if (!doc) return;

      const replyOptions = {
        parse_mode: "Markdown" as const,
        reply_parameters: { message_id: ctx.message.message_id },
      };

      // Standard Command maps
      if (userCommand === "/start") {
        if (!isGroup) {
          return showMirrorStart(ctx);
        } else {
          // Just print start
          return ctx.reply(`🟢 Bot is operational! Type commands or use /help.`, replyOptions);
        }
      }

      if (userCommand === "/help") {
        return showMirrorHelp(ctx);
      }

      if (userCommand === "/profile") {
        return showMirrorProfile(ctx);
      }

      if (userCommand === "/shop") {
        return showMirrorShop(ctx);
      }

      // Owner Admin Panel commands directly inside chat
      if (String(ctx.from?.id) === doc.ownerTelegramId) {
        if (userCommand === "/panel") {
          const userCount = await BotUser.countDocuments({ interactedBots: ctx.botInfo?.username });
          const groupCount = await BotGroup.countDocuments({ interactedBots: ctx.botInfo?.username });
          await ctx.reply(
            `📊 *Mirrored Bot Admin Panel*\n\n` +
            `🤖 *Bot Name:* ${doc.customBotName || doc.botName || 'Mirrored'}\n` +
            `👑 *Your Plan:* ${doc.plan.toUpperCase()}\n` +
            `👥 *Bot Users:* ${userCount}\n` +
            `🏢 *Target Groups:* ${groupCount}\n` +
            `⚙️ Use our Mirror WebApp Panel to manage custom commands, broadcasts, bans or settings.`,
            replyOptions
          );
          return;
        }

        if (userCommand === "/ban" && param) {
          if (!doc.bannedUsers?.includes(param)) {
            doc.bannedUsers.push(param);
            await doc.save();
            await ctx.reply(`🚫 *User ${param} has been banned from using this bot.*`);
          } else {
            await ctx.reply(`User ${param} is already banned.`);
          }
          return;
        }

        if (userCommand === "/unban" && param) {
          doc.bannedUsers = doc.bannedUsers.filter((u: string) => u !== param);
          await doc.save();
          await ctx.reply(`✅ *User ${param} has been unbanned.*`);
          return;
        }

        if (userCommand === "/gban" && param) {
          let gId = param.trim();
          if (!doc.bannedGroups?.includes(gId)) {
            doc.bannedGroups.push(gId);
            await doc.save();
            await ctx.reply(`🚫 *Group ${gId} has been banned from this bot.*`);
          } else {
            await ctx.reply(`Group ${gId} is already banned.`);
          }
          return;
        }

        if (userCommand === "/gunban" && param) {
          let gId = param.trim();
          doc.bannedGroups = doc.bannedGroups.filter((g: string) => g !== gId);
          await doc.save();
          await ctx.reply(`✅ *Group ${gId} has been unbanned.*`);
          return;
        }
      }

      // Check command definition
      let cmdDef = doc.customCommands?.find((c: any) => c.command === userCommand);
      if (!cmdDef) {
        // Fallback to central commands
        cmdDef = await Command.findOne({ command: userCommand });
        // Check exclusion rules (SILVER+)
        if (cmdDef && doc.plan !== 'free' && doc.excludedCommands?.includes(userCommand)) {
          console.log(`[Mirror Command Intercept] Command ${userCommand} has been EXCLUDED by admin. Skipping.`);
          return;
        }
      }

      if (!cmdDef) return; // Command not found anywhere

      if (cmdDef.isMaintenance === true) {
        await ctx.reply(`⚠️ The command \`${cmdDef.command}\` is currently under maintenance. No credits will be deducted!`, replyOptions);
        return;
      }

      // Private chat check: user must start bot privately before running commands in groups (Requirement 1 fallback)
      let userDoc = await BotUser.findOne({ telegramId: String(ctx.from?.id) });
      if (isGroup && (!userDoc || !userDoc.hasStartedBot)) {
        await ctx.reply(
          `⚠️ *Action Required*\n\nYou must start me in private chat first before using commands in groups!`,
          {
            ...replyOptions,
            reply_markup: {
              inline_keyboard: [[{
                text: "🚀 Start Bot privately",
                url: `https://t.me/${ctx.botInfo.username}?start=group_redirect`,
              }]]
            }
          }
        );
        return;
      }

      // Private chat restriction on API commands for non-premiums
      if (!isGroup && cmdDef.isApi) {
        const isAllowed = (userDoc && (userDoc.isAdmin || userDoc.isPremium)) || (String(ctx.from?.id) === doc.ownerTelegramId && doc.plan !== 'free');
        if (!isAllowed) {
          if (String(ctx.from?.id) === doc.ownerTelegramId && doc.plan === 'free') {
            await ctx.reply(
              `⚠️ *Premium Required (Free Plan Owner)*\n\n` +
              `Sorry, running API commands in private chat is reserved for *Premium subscribers*!\n\n` +
              `👑 *Owner Tip:* Upgrade your cloned bot to at least *Silver Plan* to run all API commands in your private chat without limits!\n\n` +
              `Run the command in groups, purchase /shop premium, or upgrade your bot via the Mirror WebApp Manager.`,
              replyOptions
            );
          } else {
            await ctx.reply(`⚠️ *Premium Required*\n\nSorry, running API commands in private chat is reserved for *Premium subscribers* of the main bot!\n\nUpgrade via /shop or run the command in groups.`, replyOptions);
          }
          return;
        }
      }

      // Force Subscribed checklist
      const missedChannels: any[] = [];
      
      // 1. Check fixed main channel (except MAX plan)
      if (doc.plan !== 'max') {
        const joinedMain = await isMemberOfChannel('@encorexosint', String(ctx.from?.id));
        if (!joinedMain) {
          missedChannels.push({ id: '@encorexosint', link: 'https://t.me/encorexosint' });
        }
      }

      // 2. Custom channels
      if (doc.forceChannels && doc.forceChannels.length > 0) {
        for (const channel of doc.forceChannels) {
          const channelId = typeof channel === "string" ? channel : (channel.username || channel.id);
          const channelLink = typeof channel === "object" ? channel.link : `https://t.me/${channelId.replace('@','')}`;
          try {
            const member = await ctx.telegram.getChatMember(channelId, ctx.from!.id);
            if (member.status === "left" || member.status === "kicked") {
              missedChannels.push({ id: channelId, link: channelLink });
            }
          } catch (e) {
            missedChannels.push({ id: channelId, link: channelLink });
          }
        }
      }

      // Block with pending check buttons
      if (missedChannels.length > 0) {
        const actionId = Math.random().toString(36).substring(2, 10);
        await PendingAction.create({
          actionId,
          command: userCommand,
          param,
          telegramId: String(ctx.from?.id),
          messageId: ctx.message.message_id,
        });

        const buttons: any[] = missedChannels.map((ch, index) => {
          return [{ text: `Join Channel ${index + 1}`, url: ch.link }];
        });

        buttons.push([{ text: "Show Result", callback_data: `check_sub:${actionId}` }]);

        await ctx.reply(
          `⚠️ *Subscription Required*\n\nYou must join these required channels to unlock commands inside this bot:`,
          {
            ...replyOptions,
            reply_markup: {
              inline_keyboard: buttons
            }
          }
        );
        return;
      }

      // Execute command core
      await executeCommandCore(ctx, userCommand, param, cmdDef, replyOptions, doc);
    } catch (e: any) {
      console.error("[Mirror Command processing error]", e);
    }
  });

  // Global error handler to prevent crashing or stalling of long poller
  bot.catch((err: any, ctx: any) => {
    console.error(`[Telegraf Error Handler] Error for bot token ${token.substring(0, 10)}...:`, err);
  });

  // Async IIFE to set up webhook in production, or use long-polling in development/sandbox
  (async () => {
    try {
      const appUrl = getAppUrl();
      const isSandboxOrDev = isCurrentlySandboxOrDev();

      if (!isSandboxOrDev && appUrl && appUrl.startsWith("https")) {
        const webhookUrl = `${appUrl}/api/telegram/webhook/mirror/${token}`;
        
        if (skipSetupWebhook) {
          console.log(`[Mirror Bot Manager] Webhook setup skipped for @${mirrorBotDoc.botUsername || token.substring(0, 8)} (re-initialized from cache/webhook)`);
        } else {
          console.log(`[Mirror Bot Manager] Public production environment detected. Registering Webhook for @${mirrorBotDoc.botUsername || token.substring(0, 8)} to: ${webhookUrl}`);
          // Telegram webhooks require https
          await bot.telegram.setWebhook(webhookUrl, {
            allowed_updates: ["message", "callback_query"],
            drop_pending_updates: false
          });
        }
      } else {
        console.log(`[Mirror Bot Manager] Sandbox/Development environment detected. Launching @${mirrorBotDoc.botUsername || token.substring(0, 8)} with long-polling...`);
        await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
        bot.launch({
          allowedUpdates: ["message", "callback_query"],
          dropPendingUpdates: true,
        }).catch((err: any) => {
          console.error(`Failed launching mirrored bot token polling: ${token}`, err.message);
        });
      }
    } catch (e: any) {
      console.error(`[Mirror Bot Webhook Register Fail] Falling back to polling:`, e.message);
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
        bot.launch({
          allowedUpdates: ["message", "callback_query"],
          dropPendingUpdates: true,
        }).catch((err: any) => {
          console.error(`Failed launching mirrored bot token: ${token}`, err.message);
        });
      } catch (err) {}
    }
  })();
  
  activeMirroredBots.set(token, bot);
  console.log(`Mirrored bot registered in pollers map: ${mirrorBotDoc.botUsername || 'cloned_bot'} (${mirrorBotDoc.plan.toUpperCase()})`);
  return bot;
}

// Stop running bot poller
export function stopMirrorBot(token: string) {
  if (activeMirroredBots.has(token)) {
    try {
      activeMirroredBots.get(token)?.stop();
    } catch (e) {}
    activeMirroredBots.delete(token);
    console.log(`Mirrored bot stopped and unregistered: ${token}`);
  }
}

// Startup loader
export async function initializeAllMirrorBots() {
  await connectDB();
  
  if (isCurrentlySandboxOrDev()) {
    console.log("[Mirror Bot Startup Loader] Sandbox/Dev environment detected. Skipping background restoration of all active mirror bots to avoid webhook hijacking.");
    return;
  }

  try {
    const bots = await MirrorBot.find({ isActive: true });
    console.log(`[Mirror Bot Startup Loader] Restoring ${bots.length} active mirror bots with skipSetupWebhook=true...`);
    for (const b of bots) {
      await checkAndResetExpiredPlan(b).catch(() => {});
      const isExceeded = await checkAndResetIntegrationPoints(b);
      if (!isExceeded) {
        await startMirrorBot(b, true).catch(() => {});
      } else {
        console.log(`[Mirror Bot Startup Loader] Skipping startup for ${b.botUsername || b.token.substring(0,8)} due to Integration Points quota limit exceeded for this month.`);
      }
    }
  } catch (err: any) {
    console.error("[Mirror Bot Startup Loader Error]", err.message);
  }
}

// Execute logic matching bot.ts core Command Runner
async function executeCommandCore(ctx: any, userCommand: string, param: string, cmdDef: any, replyOptions: any, mirrorBotDoc: any) {
  // Increment Integration Points usage for this cloned bot / owner
  try {
    const freshBotDoc = await MirrorBot.findOne({ token: mirrorBotDoc.token });
    if (freshBotDoc) {
      await checkAndResetIntegrationPoints(freshBotDoc);
      const pointsLimit = getBotIntegrationPointsLimit(freshBotDoc.plan);
      const ownerId = freshBotDoc.ownerTelegramId;
      if (ownerId) {
        const MirrorOwnerPoints = mongoose.models.MirrorOwnerPoints || mongoose.model('MirrorOwnerPoints', new mongoose.Schema({
          ownerTelegramId: { type: String, required: true, unique: true },
          integrationPointsUsed: { type: Number, default: 0 },
          integrationPointsMonth: { type: String, default: "" }
        }, { timestamps: true }), 'encore_mirror_owner_points');

        let ownerPoints = await MirrorOwnerPoints.findOne({ ownerTelegramId: ownerId });
        if (!ownerPoints) {
          ownerPoints = await MirrorOwnerPoints.create({
            ownerTelegramId: ownerId,
            integrationPointsUsed: 0,
            integrationPointsMonth: currentMonthString()
          });
        }

        if (ownerPoints.integrationPointsUsed >= pointsLimit) {
          freshBotDoc.isPointsExceeded = true;
          await freshBotDoc.save();
          stopMirrorBot(freshBotDoc.token);
          await ctx.reply(`⚠️ *Integration Points Exhausted* ⚠️\n\nThis cloned bot has used all of its monthly allowance of ${pointsLimit.toLocaleString()} Integration points. The bot has been suspended/stopped for the remainder of this month.\n\nPlease contact the bot owner to upgrade their subscription plan to unlock more Integration points!`, replyOptions);
          return;
        }

        // Increment centrally
        ownerPoints.integrationPointsUsed = (ownerPoints.integrationPointsUsed || 0) + 1;
        await ownerPoints.save();

        // Sync back to local bot document cached structure
        freshBotDoc.integrationPointsUsed = ownerPoints.integrationPointsUsed;
        if (freshBotDoc.integrationPointsUsed >= pointsLimit) {
          freshBotDoc.isPointsExceeded = true;
          stopMirrorBot(freshBotDoc.token);
        } else {
          freshBotDoc.isPointsExceeded = false;
        }
        await freshBotDoc.save();
      }
    }
  } catch (err: any) {
    console.error(`[Integration points increment error]`, err.message);
  }

  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  const userId = String(ctx.from?.id);
  const chatId = String(ctx.chat.id);

  let userDoc = await BotUser.findOne({ telegramId: userId });
  if (!userDoc) {
    userDoc = await BotUser.create({ telegramId: userId, firstName: ctx.from?.first_name });
  }

  // Credit limits (credits system is globally central)
  let shouldIncrementCredit = false;
  if (cmdDef.isCreditBased && !userDoc.isAdmin) {
    const today = new Date().toISOString().split("T")[0];
    
    // Check custom daily limit in overrides
    const override = mirrorBotDoc.commandCreditsOverrides?.find((o: any) => o.command === userCommand);
    const limit = override ? override.dailyLimit : cmdDef.defaultDailyCredits;

    let usageIndex = userDoc.commandUsage?.findIndex((u: any) => u.command === userCommand);
    let usedToday = 0;
    
    if (usageIndex !== undefined && usageIndex >= 0) {
      const usage = userDoc.commandUsage[usageIndex];
      if (usage.lastResetDate === today) {
        usedToday = usage.used;
      }
    }

    if (usedToday >= limit) {
      // Check central commonCredits map
      const commonBal = userDoc.commonCredits ? userDoc.commonCredits.get(userCommand) || 0 : 0;
      if (commonBal > 0) {
        userDoc.commonCredits.set(userCommand, commonBal - 1);
        userDoc.markModified('commonCredits');
        await userDoc.save();
        
        try {
          await ctx.telegram.sendMessage(
            userId,
            `⚠️ *Common Credit Used*\n\nYou used 1 out of available common credits for "${userCommand}". Left: *${commonBal - 1}* credits.`
          );
        } catch (e) {}
      } else {
        // Block
        const buyBtn = {
          text: "BUY CREDITS 💳",
          url: "https://t.me/modifucker"
        };
        const limitText = `⚠️ *Daily Limit Reached*\n\n` +
          `Sorry user, you have used all your daily credits (${usedToday}/${limit}) and common credits for this command. Please wait for tomorrow or increase your credits.`;

        try {
          await ctx.reply(limitText, {
            ...replyOptions,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[buyBtn]]
            }
          });
        } catch (_err) {
          try {
            await ctx.reply(limitText, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[buyBtn]]
              }
            });
          } catch (_err2) {
            const plainText = `⚠️ Daily Limit Reached\n\n` +
              `Sorry user, you have used all your daily credits (${usedToday}/${limit}) and common credits for this command. Please wait for tomorrow or increase your credits.`;
            await ctx.reply(plainText, {
              reply_markup: {
                inline_keyboard: [[buyBtn]]
              }
            }).catch(() => {});
          }
        }
        return;
      }
    } else {
      shouldIncrementCredit = true;
    }
  }

  // Increment credit centrally
  if (shouldIncrementCredit) {
    const today = new Date().toISOString().split("T")[0];
    let usageIndex = userDoc.commandUsage?.findIndex((u: any) => u.command === userCommand);
    if (usageIndex !== undefined && usageIndex >= 0) {
      if (userDoc.commandUsage[usageIndex].lastResetDate !== today) {
        userDoc.commandUsage[usageIndex].used = 1;
        userDoc.commandUsage[usageIndex].lastResetDate = today;
      } else {
        userDoc.commandUsage[usageIndex].used += 1;
      }
    } else {
      if (!userDoc.commandUsage) userDoc.commandUsage = [];
      userDoc.commandUsage.push({ command: userCommand, used: 1, lastResetDate: today });
    }
    userDoc.markModified('commandUsage');
    await userDoc.save();
  }

  // Group daily credit checks
  let limitInlineButton: any = null;
  if (isGroup) {
    let groupDoc = await BotGroup.findOne({ telegramId: chatId });
    if (groupDoc) {
      const today = new Date().toISOString().split("T")[0];
      
      // Determine default limit configuration on this bot
      const currentLimit = mirrorBotDoc.defaultGroupCredits || 50;

      if (groupDoc.lastResetDate !== today) {
        groupDoc.dailyUsed = 0;
        groupDoc.lastResetDate = today;
      }

      if (groupDoc.dailyUsed >= currentLimit) {
        await ctx.reply(`⚠️ *Daily Group Limit Reached*\n\nThis group has used all ${currentLimit} group searches permitted by this bot. Please contact the bot owner to upgrade!`, replyOptions);
        return;
      }

      groupDoc.dailyUsed += 1;
      await groupDoc.save();
      
      limitInlineButton = {
        text: `${groupDoc.dailyUsed}/${currentLimit} bot group credits used today!`,
        callback_data: "group_lim",
        style: "danger",
      };
    }
  }

  // Query API
  let apiResponseText = "";
  if (cmdDef.isApi && cmdDef.apiUrl) {
    let finalUrl = cmdDef.apiUrl;
    if (finalUrl.includes("{param}") && !param) {
      await ctx.reply(`⚠️ *Missing Parameter*\n\nPlease provide required query value. Usage: \`${userCommand} <value>\``, replyOptions);
      return;
    }

    if (param) finalUrl = finalUrl.replace("{param}", encodeURIComponent(param));

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

  // Setup Keyboards
  const inlineButtonsList: any[] = [];
  if (cmdDef.inlineButtons && cmdDef.inlineButtons.length > 0) {
    for (let b of cmdDef.inlineButtons) {
      if (b.label && b.url) {
        inlineButtonsList.push([{ text: b.label, url: b.url }]);
      }
    }
  }

  if (limitInlineButton) {
    inlineButtonsList.push([limitInlineButton]);
  }

  if (!isGroup) {
    inlineButtonsList.push([{ text: "🔙 Back to Start", callback_data: "view_start" }]);
  }

  let sentMsg;
  if (finalText.length > 4000) {
    const buffer = Buffer.from(finalText, "utf-8");
    sentMsg = await ctx.replyWithDocument(
      { source: buffer, filename: `${param || "result"}.txt` },
      {
        caption: "⚠️ Response is too large and has been converted to a file.",
        ...replyOptions,
        ...(inlineButtonsList.length > 0 && Markup.inlineKeyboard(inlineButtonsList)),
      }
    );
  } else {
    sentMsg = await ctx.reply(finalText, {
      ...replyOptions,
      ...(inlineButtonsList.length > 0 && Markup.inlineKeyboard(inlineButtonsList)),
    });
  }

  // Create stat log (centrally aggregated!)
  Statlog.create({
    commandName: userCommand,
    telegramId: userId,
    isGroup,
    paramValue: param || undefined,
    apiResponse: apiResponseText || undefined,
  }).catch(() => {});

  // Handle auto-delete
  let effectiveAutoDeleteMs = cmdDef.autoDeleteMs || 0;
  const override = mirrorBotDoc.commandCreditsOverrides?.find((o: any) => o.command === userCommand);
  if (override && override.autoDeleteMs !== undefined) {
    effectiveAutoDeleteMs = override.autoDeleteMs;
  }

  if (effectiveAutoDeleteMs > 0 && sentMsg) {
    const delayMs = effectiveAutoDeleteMs < 1000 ? effectiveAutoDeleteMs * 1000 : effectiveAutoDeleteMs;
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id);
      } catch (e) {}
    }, delayMs);
  }
}

export function getAppUrl(): string {
  const cached = getCachedAppUrl();
  if (cached) return cached;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return process.env.VITE_APP_URL || process.env.APP_URL || "https://ais-dev-7zposvri3knpwk5wp3qxma-68179712237.asia-southeast1.run.app";
}

export async function handleMirrorBotWebhook(token: string, update: any, res: any) {
  try {
    let bot = activeMirroredBots.get(token);
    if (!bot) {
      const botDoc = await MirrorBot.findOne({ token, isActive: true });
      if (!botDoc) {
        console.log(`[Mirror Bot Webhook] Incoming update for non-existent or inactive bot.`);
        return res.sendStatus(200);
      }
      const isExceeded = await checkAndResetIntegrationPoints(botDoc);
      if (isExceeded) {
        console.log(`[Mirror Bot Webhook] Bot has exceeded integration points, skipping update.`);
        return res.sendStatus(200);
      }
      bot = await startMirrorBot(botDoc);
    }

    if (bot) {
      await bot.handleUpdate(update, res);
    } else {
      res.sendStatus(200);
    }
  } catch (err: any) {
    console.error(`[Mirror Bot Webhook Handler Error] Token: ${token.substring(0, 10)}... Error:`, err.message);
    if (!res.headersSent) {
      res.sendStatus(200); // return 200 to prevent retry storms
    }
  }
}

export async function creditMirrorBotCommission(botRefUsername: string, purchaseAmount: number, description: string) {
  try {
    if (!botRefUsername) return;
    
    // Normalize username
    const normalizedUsername = botRefUsername.trim().replace("@", "");
    const botDoc = await MirrorBot.findOne({ 
      $or: [
        { botUsername: normalizedUsername },
        { botUsername: "@" + normalizedUsername }
      ]
    });
    
    if (!botDoc) {
      console.log(`[Commission Engine] No mirror bot found for ref: ${botRefUsername}`);
      return;
    }
    
    const plan = botDoc.plan || 'free';
    let pct = 0.20; // free limit
    if (plan === 'silver') pct = 0.35;
    else if (plan === 'gold') pct = 0.50;
    else if (plan === 'max') pct = 0.70;
    
    const commissionEarned = Math.round(purchaseAmount * pct * 100) / 100;
    if (commissionEarned <= 0) return;
    
    console.log(`[Commission Engine] Crediting ${commissionEarned} (₹${purchaseAmount} * ${pct * 100}%) to owner ${botDoc.ownerTelegramId} of bot @${botDoc.botUsername} [Plan: ${plan.toUpperCase()}]`);
    
    let wallet = await MirrorWallet.findOne({ ownerTelegramId: botDoc.ownerTelegramId });
    if (!wallet) {
      wallet = await MirrorWallet.create({ ownerTelegramId: botDoc.ownerTelegramId });
    }
    
    wallet.balance = (wallet.balance || 0) + commissionEarned;
    wallet.totalEarned = (wallet.totalEarned || 0) + commissionEarned;
    wallet.history.push({
      type: 'earning',
      amount: commissionEarned,
      description: `Commission earning (${Math.round(pct * 100)}%) from purchase through your cloned bot @${botDoc.botUsername}: ${description}`,
      status: 'N/A',
      date: new Date()
    });
    
    await wallet.save();
  } catch (err: any) {
    console.error("[Commission Engine Error]", err.message);
  }
}
