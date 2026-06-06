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
} from "./db.js";

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

// Fampay Verification call logic mirroring api.ts
async function verifyFampayPayment(paymentId: string, amount: number) {
  const cleanPaymentId = String(paymentId).trim();
  let foundTxn: any = null;

  try {
    // Query 1: Try as UTR
    const utrRes = await axios.get(`https://famnify.vercel.app/fampay?utr=${cleanPaymentId}`);
    if (utrRes.data && utrRes.data.found && utrRes.data.results && utrRes.data.results.length > 0) {
      foundTxn = utrRes.data.results.find((item: any) => {
        const isSuccess = String(item.Payment).toLowerCase() === 'success';
        const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0;
        return isSuccess && isAmountMatch;
      });
    }

    // Query 2: Try as ID/Transaction if not found
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
  } catch (err: any) {
    console.error("[Bot Fampay verification error]", err.message);
    throw new Error('Payment verification service is temporarily offline. Please try again later.');
  }

  return foundTxn;
}

// Render root bot shop menu
async function showBotShopMenu(ctx: any) {
  const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
  if (isGroup) {
    const botUsername = ctx.botInfo?.username || "bot";
    await ctx.reply(
      `🛒 *ENCORE XOSINT Shop*\n\nHey there, you can buy premium subscription or additional credits directly in our shop! Check it out in private chat:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛍️ Open Shop",
                url: `https://t.me/${botUsername}?start=shop`,
                style: "success",
              } as any,
            ],
          ],
        },
      }
    ).catch(() => {});
    return;
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const appUrl = vercelUrl
    ? `https://${vercelUrl}`
    : process.env.VITE_APP_URL ||
      process.env.APP_URL ||
      "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
  const shopUrl = `${appUrl}/shop?userid=${ctx.from?.id || ""}`;

  const messageText = `🛍️ *ENCORE XOSINT Bot Shop* 🛍️\n\n` +
    `Welcome to the bot shop! Here you can buy premium membership subscriptions or buy separate credits for specific command integrations.\n\n` +
    `Choose an option below to proceed:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔗 OPEN STORE IN WEBAPP", web_app: { url: shopUrl } } as any],
      [{ text: "🎫 PURCHASE BOT MEMBERSHIP", callback_data: "shop_sub_tier_menu" } as any],
      [{ text: "⚡ BUY COMMAND CREDITS", callback_data: "shop_credits_menu" } as any],
      [{ text: "🔙 Back to Start", callback_data: "view_start" } as any],
    ]
  };

  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    await ctx.editMessageText(messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }).catch(() => {});
  } else {
    await ctx.reply(messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }).catch(() => {});
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
  const upiString = `upi://pay?pa=alkhkumar@fam&pn=ENCORE_XOSINT_Shop&am=${amount}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

  let couponText = "";
  if (couponCode) {
    couponText = `🎉 *Coupon Code Applied:* \`${couponCode}\`\n`;
  }

  const captionText = `🎫 *Subscription Checkout: ${matchedTier.name}*\n\n` +
    couponText +
    `💰 *Payable Amount:* ₹${amount} / month\n` +
    `🔌 *UPI ID:* \`alkhkumar@fam\`\n\n` +
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
  const upiString = `upi://pay?pa=alkhkumar@fam&pn=ENCORE_XOSINT_Shop&am=${finalPrice}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

  let discountInfo = "";
  if (hasDiscount && discountPercent > 0) {
    discountInfo = `🔥 *VIP Discount:* Flat ${discountPercent}% OFF applied!\n(Original Price: ₹${basePrice.toFixed(2)})\n\n`;
  }

  const captionText = `⚡ *Checkout: Credits for ${cmd.command}*\n\n` +
    `📥 *Quantity:* ${qty} Credits\n` +
    `💰 *Payable Amount:* ₹${finalPrice}\n` +
    `🔌 *UPI ID:* \`alkhkumar@fam\`\n\n` +
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

    // 2. Fetch from Fampay gateway
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
      } catch (logErr) {
        console.error("Failed to log failed txn in bot.ts:", logErr);
      }

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(`⚠️ *Transaction Not Found*\n\nPayment transaction was not found on Fampay or the amount does not match *₹${amount}*.\n\nMake sure:\n- Core payment is completed successfully.\n- You entered the correct UTR / Transaction ID.\n- You paid the exact amount: *₹${amount}*\n\nPlease respond with the correct UTR/ID, or click cancel:`, {
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
          String(ctx.chat.username).toLowerCase() === "encorexgroup";
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
          "↗️ *Join our Main Group:* [ENCOREX GROUP](https://t.me/encorexgroup)\n\n";

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
      const vercelUrl =
        process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
      const appUrl = vercelUrl
        ? `https://${vercelUrl}`
        : process.env.VITE_APP_URL ||
          process.env.APP_URL ||
          "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";

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
        const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
        const appUrl = vercelUrl
          ? `https://${vercelUrl}`
          : process.env.VITE_APP_URL ||
            process.env.APP_URL ||
            "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
        const markup = {
          inline_keyboard: [
            [{ text: "👤 My Profile", callback_data: "view_profile", style: "success" } as any],
            [{ text: "🤖 MAKE YOUR OWN BOT", web_app: { url: `${appUrl}/mirror-bots` } } as any],
            [{ text: "🛍️ Bot Shop (New)", callback_data: "view_shop", style: "success" } as any],
            [{ text: "ℹ️ Help Center", callback_data: "view_help", style: "primary" } as any],
          ],
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

  bot.on("text", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const userId = String(ctx.from?.id);

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
            const vercelUrl =
              process.env.VERCEL_PROJECT_PRODUCTION_URL ||
              process.env.VERCEL_URL;
            const appUrl = vercelUrl
              ? `https://${vercelUrl}`
              : process.env.VITE_APP_URL ||
                process.env.APP_URL ||
                "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
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
            const vercelUrl =
              process.env.VERCEL_PROJECT_PRODUCTION_URL ||
              process.env.VERCEL_URL;
            const appUrl = vercelUrl
              ? `https://${vercelUrl}`
              : process.env.VITE_APP_URL ||
                process.env.APP_URL ||
                "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
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

          const vercelUrl =
            process.env.VERCEL_PROJECT_PRODUCTION_URL ||
            process.env.VERCEL_URL;
          const appUrl = vercelUrl
            ? `https://${vercelUrl}`
            : process.env.VITE_APP_URL ||
              process.env.APP_URL ||
              "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
          const mirrorsUrl = `${appUrl}/mirrors?userid=${ctx.from?.id || ""}`;

          await ctx.reply(
            "✨ *Welcome to ENCORE XOSINT* ✨\n\n✅ *Status:* Bot is fully operational.\n\nYou can get multiple information using this bot. Try exploring some commands or use /help to see how it works!",
            {
              ...replyOptions,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🤖 MAKE YOUR OWN BOT",
                      web_app: { url: mirrorsUrl },
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
                ],
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

      // Admin Commands
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
            
            const vercelUrl =
              process.env.VERCEL_PROJECT_PRODUCTION_URL ||
              process.env.VERCEL_URL;
            const appUrl = vercelUrl
              ? `https://${vercelUrl}`
              : process.env.VITE_APP_URL ||
                process.env.APP_URL ||
                "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
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
                        url: "https://t.me/encorexgroup",
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
              const vercelUrl =
                process.env.VERCEL_PROJECT_PRODUCTION_URL ||
                process.env.VERCEL_URL;
              const appUrl = vercelUrl
                ? `https://${vercelUrl}`
                : process.env.VITE_APP_URL ||
                  process.env.APP_URL ||
                  "https://ais-dev-nh3m4uaffie5jdqua3dnlj-590981446212.asia-southeast1.run.app";
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
        console.error(e);
        try {
          await ctx.reply(`❌ *Bot Error*\n\`${e.message}\``, {
            parse_mode: "Markdown",
            reply_parameters: { message_id: ctx.message.message_id },
          });
        } catch (innerErr) {
          try {
            await ctx.reply(`❌ Bot Error:\n${e.message}`, {
              reply_parameters: { message_id: ctx.message.message_id },
            });
          } catch (innerErr2) {
            await ctx.reply(`❌ Bot Error:\n${e.message}`).catch(() => {});
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
