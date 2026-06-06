import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import { MirrorBot, Command, BotUser, BotGroup, Setting, Statlog, PendingAction, connectDB } from "./db.js";
import { isMemberOfChannel } from "./bot.js";

const activeMirroredBots = new Map<string, Telegraf>();

// Get running instance or null
export function getMirroredBotInstance(token: string): Telegraf | null {
  return activeMirroredBots.get(token) || null;
}

// Check plan constraints on custom channels
export function getMaxForceChannels(plan: string): number {
  switch (plan) {
    case 'free': return 1;
    case 'silver': return 3;
    case 'gold': return 9999; // Unlimited
    case 'max': return 9999; // Unlimited
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

// Setup a mirrored bot dynamic event handlers
export async function startMirrorBot(mirrorBotDoc: any) {
  if (activeMirroredBots.has(mirrorBotDoc.token)) {
    return activeMirroredBots.get(mirrorBotDoc.token);
  }

  const token = mirrorBotDoc.token;
  const bot = new Telegraf(token);

  // 1. Setup global interaction & tracking middleware
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return next();
    
    // Refresh mirror bot doc dynamically to fetch latest ban list, plans, etc.
    const reloadedBotDoc = await MirrorBot.findOne({ token });
    if (!reloadedBotDoc || !reloadedBotDoc.isActive) {
      console.log(`[Mirror Bot Tracker] Bot is disabled, ignoring message.`);
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
          const channelId = typeof channel === "string" ? channel : channel.id;
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
        [{ text: "🔙 Back to Main", callback_data: "view_start" }]
      ]
    };

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(profileText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
      await ctx.reply(profileText, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    }
  };

  const showMirrorStart = async (ctx: any) => {
    const doc = await MirrorBot.findOne({ token });
    if (!doc) return;

    const keyboard = {
      inline_keyboard: [
        [{ text: "👤 My Profile", callback_data: "view_profile" }],
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

  bot.action("view_help", showMirrorHelp);
  bot.action("view_profile", showMirrorProfile);
  bot.action("view_start", showMirrorStart);

  // 2. Incoming text messages router
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
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
        const isAllowed = userDoc && (userDoc.isAdmin || userDoc.isPremium || String(ctx.from?.id) === doc.ownerTelegramId);
        if (!isAllowed) {
          await ctx.reply(`⚠️ *Premium Required*\n\nSorry, running API commands in private chat is reserved for *Premium subscribers* of the main bot!\n\nUpgrade via /shop or run the command in groups.`, replyOptions);
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
          const channelId = typeof channel === "string" ? channel : channel.id;
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

  bot.launch().catch((err: any) => {
    console.error(`Failed launching mirrored bot token: ${token}`, err.message);
  });
  
  activeMirroredBots.set(token, bot);
  console.log(`Mirrored bot started successfully: ${mirrorBotDoc.botUsername} (${mirrorBotDoc.plan.toUpperCase()})`);
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
  try {
    const bots = await MirrorBot.find({ isActive: true });
    console.log(`[Mirror Bot Startup Loader] Starting ${bots.length} active mirror bots...`);
    for (const b of bots) {
      await startMirrorBot(b).catch(() => {});
    }
  } catch (err: any) {
    console.error("[Mirror Bot Startup Loader Error]", err.message);
  }
}

// Execute logic matching bot.ts core Command Runner
async function executeCommandCore(ctx: any, userCommand: string, param: string, cmdDef: any, replyOptions: any, mirrorBotDoc: any) {
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
        await ctx.reply(`⚠️ *Daily Limit Reached*\n\nSorry, you have used all your daily credits (${usedToday}/${limit}) and common credits of this command. Please wait for tomorrow.`, replyOptions);
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
  if (cmdDef.autoDeleteMs && cmdDef.autoDeleteMs > 0 && sentMsg) {
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, sentMsg.message_id);
      } catch (e) {}
    }, cmdDef.autoDeleteMs * 1000);
  }
}
