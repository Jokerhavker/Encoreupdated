import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import { connectDB, Command, BotUser, BotGroup, Setting, Statlog, UsedTransaction, BroadcastHistory, Coupon, MirrorBot, MirrorWallet, MirrorWithdrawalRequest, Donation, setCachedAppUrl, getCachedAppUrl } from './db.js';
import { getBot, setupWebhook } from './bot.js';
import { 
  startMirrorBot, 
  stopMirrorBot, 
  getMaxForceChannels, 
  getMirroredBotInstance,
  isCreditOverrideAllowed,
  checkAndResetIntegrationPoints,
  creditMirrorBotCommission,
  isCurrentlySandboxOrDev,
  getMirroredBotInstanceByUsername,
  checkAndResetExpiredPlan
} from './mirrorBotManager.js';

export const apiRouter = express.Router();

// Mirror Bot API endpoints

// Separate validation endpoint for tokens
apiRouter.post('/api/mirror-bots/check-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const checkRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`).catch(() => null);
    if (!checkRes || !checkRes.data?.ok) {
      return res.status(400).json({ error: 'Invalid Bot Token. Please double check with BotFather.' });
    }

    res.json({ success: true, botInfo: checkRes.data.result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update Mirror Bot
apiRouter.post('/api/mirror-bots', async (req, res) => {
  try {
    const { token, ownerTelegramId, plan } = req.body;
    if (!token || !ownerTelegramId) {
      return res.status(400).json({ error: 'Missing token or ownerTelegramId' });
    }

    // Dynamic verification on Telegram
    const checkRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`).catch(() => null);
    if (!checkRes || !checkRes.data?.ok) {
      return res.status(400).json({ error: 'Invalid Bot Token. Could not connect to Telegram.' });
    }

    const info = checkRes.data.result;

    // See if the token is already registered
    let existingBot = await MirrorBot.findOne({ token });
    if (existingBot) {
      existingBot.ownerTelegramId = ownerTelegramId;
      existingBot.botName = info.first_name;
      existingBot.botUsername = info.username;
      
      // If admin panel passes dynamic plan, we save it (defaults to free if new)
      if (plan) existingBot.plan = plan;

      await existingBot.save();
      await startMirrorBot(existingBot).catch(() => {});
      return res.json({ success: true, bot: existingBot, message: 'Bot updated and started.' });
    }

    // Enforce one single cloned bot per user limit strictly
    const existingBotForOwner = await MirrorBot.findOne({ ownerTelegramId });
    if (existingBotForOwner && existingBotForOwner.token !== token) {
      return res.status(400).json({ 
        error: `You already have a cloned bot setup (@${existingBotForOwner.botUsername || 'your_bot'}). You must stop & delete your existing bot first to clone a new one.` 
      });
    }

    // New mirror bot document
    const newBot = await MirrorBot.create({
      token,
      ownerTelegramId,
      botName: info.first_name,
      botUsername: info.username,
      plan: plan || 'free',
      isActive: true,
      forceChannels: []
    });

    // Synchronize central owner points immediately on creation
    await checkAndResetIntegrationPoints(newBot).catch(() => {});

    // Fire the Telegraf instance poller right away!
    await startMirrorBot(newBot).catch(() => {});

    res.json({ success: true, bot: newBot, message: 'Mirrored Bot registered and activated!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete or stop a user-owned Mirror Bot
apiRouter.post('/api/mirror-bots/delete', async (req, res) => {
  try {
    const { token, ownerTelegramId } = req.body;
    if (!token || !ownerTelegramId) {
      return res.status(400).json({ error: 'Missing token or ownerTelegramId' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot configuration not found.' });

    if (botDoc.ownerTelegramId !== ownerTelegramId) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this bot.' });
    }

    stopMirrorBot(token);
    await MirrorBot.deleteOne({ token });

    res.json({ success: true, message: 'Mirrored bot was deleted and poller stopped completely.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch active mirror bots for a specific owner Telegram ID
apiRouter.get('/api/mirror-bots', async (req, res) => {
  try {
    const { ownerTelegramId } = req.query;
    if (!ownerTelegramId) {
      return res.status(400).json({ error: 'Missing ownerTelegramId' });
    }
    const bots = await MirrorBot.find({ ownerTelegramId });
    for (const b of bots) {
      await checkAndResetExpiredPlan(b).catch(() => {});
      await checkAndResetIntegrationPoints(b).catch(() => {});
    }
    res.json(bots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch info, custom settings, and dynamic stats of a mirror bot 
apiRouter.get('/api/mirror-bots/detail', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot configuration not found' });

    // Check & Reset Expired plan
    await checkAndResetExpiredPlan(botDoc);

    // Check & Reset Integration points
    await checkAndResetIntegrationPoints(botDoc);

    // If bot is active but poller has stopped, and points are not exceeded, start it
    const isSandbox = isCurrentlySandboxOrDev();
    if (!isSandbox && botDoc.isActive && !botDoc.isPointsExceeded && !getMirroredBotInstance(botDoc.token)) {
      await startMirrorBot(botDoc, true).catch(() => {});
    }

    const botUsername = botDoc.botUsername;
    let usersCount = 0;
    let groupsCount = 0;

    if (botUsername) {
      usersCount = await BotUser.countDocuments({ interactedBots: botUsername });
      groupsCount = await BotGroup.countDocuments({ interactedBots: botUsername });
    }

    const tiersSetting = await Setting.findOne({ key: 'mirrorTiersConfig' });
    const tierConfig = tiersSetting?.value || [];

    res.json({
      success: true,
      bot: botDoc,
      stats: {
        totalUsers: usersCount,
        totalGroups: groupsCount
      },
      tierConfig
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch interacted users and groups list for mirror bots
apiRouter.get('/api/mirror-bots/users-groups', async (req, res) => {
  try {
    const { token, search } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Mirror bot not found' });

    const botUsername = botDoc.botUsername;
    if (!botUsername) {
      return res.json({ success: true, users: [], groups: [] });
    }

    const searchQuery = search ? String(search).trim() : '';
    
    let userFilter: any = { interactedBots: botUsername };
    let groupFilter: any = { interactedBots: botUsername };

    if (searchQuery) {
      const regex = new RegExp(searchQuery, 'i');
      userFilter = {
        interactedBots: botUsername,
        $or: [
          { telegramId: regex },
          { username: regex },
          { firstName: regex }
        ]
      };
      groupFilter = {
        interactedBots: botUsername,
        $or: [
          { telegramId: regex },
          { title: regex }
        ]
      };
    }

    const users = await BotUser.find(userFilter).limit(200);
    const groups = await BotGroup.find(groupFilter).limit(200);

    res.json({ success: true, users, groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Edit specific bot user credits
apiRouter.post('/api/mirror-bots/update-user-credits', async (req, res) => {
  try {
    const { token, userTelegramId, command, commonCreditsAmount } = req.body;
    if (!token || !userTelegramId || !command) {
      return res.status(400).json({ error: 'Missing target parameters' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    const tiersSetting = await Setting.findOne({ key: 'mirrorTiersConfig' });
    const tiers = tiersSetting?.value || [];
    const botPlan = tiers.find((t: any) => t.id === botDoc.plan);
    const isCommandAllowed = botPlan?.editableCommands?.some((ec: any) => ec.command === command);
    const isMax = botDoc.plan === 'max';

    if (!isMax && !isCommandAllowed) {
      return res.status(403).json({ 
        error: `Your current subscription plan (${botDoc.plan.toUpperCase()}) does not allow customizing daily credits limit or common credits for ${command}. Upgrade subscription plan!` 
      });
    }

    const maxLimitForCommand = isMax ? 1000000 : (botPlan?.editableCommands?.find((ec: any) => ec.command === command)?.maxLimit || 100);
    if (Number(commonCreditsAmount) > maxLimitForCommand) {
      return res.status(400).json({ 
        error: `Under your current ${botDoc.plan.toUpperCase()} tier config, you can only set credits up to ${maxLimitForCommand} for ${command}.` 
      });
    }

    const user = await BotUser.findOne({ telegramId: userTelegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let commandCredits = user.commandCredits || [];
    const idx = commandCredits.findIndex((c: any) => c.command === command);
    if (idx >= 0) {
      commandCredits[idx].dailyLimit = Number(commonCreditsAmount);
    } else {
      commandCredits.push({ command, dailyLimit: Number(commonCreditsAmount), isUnlimited: false });
    }
    user.commandCredits = commandCredits;
    user.markModified('commandCredits');
    await user.save();

    res.json({ success: true, message: 'User credits updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Modify global commands limit overrides for this mirrored bot
apiRouter.post('/api/mirror-bots/update-overrides', async (req, res) => {
  try {
    const { token, command, dailyLimit, autoDeleteMs } = req.body;
    if (!token || !command) {
      return res.status(400).json({ error: 'Missing token or command parameter' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (botDoc.plan === 'free') {
      return res.status(403).json({ error: 'Command overrides are restricted to SILVER subscription plans or higher.' });
    }

    const tiersSetting = await Setting.findOne({ key: 'mirrorTiersConfig' });
    const tiers = tiersSetting?.value || [];
    const botPlan = tiers.find((t: any) => t.id === botDoc.plan);
    const isCommandAllowed = botPlan?.editableCommands?.some((ec: any) => ec.command === command);
    const isMax = botDoc.plan === 'max';

    if (!isMax && !isCommandAllowed) {
      return res.status(403).json({ 
        error: `Your current tier plan (${botDoc.plan.toUpperCase()}) does not authorize editing overrides of ${command}. Upgrade subscription first.` 
      });
    }

    if (!botDoc.commandCreditsOverrides) {
      botDoc.commandCreditsOverrides = [];
    }
    
    const existingIdx = botDoc.commandCreditsOverrides.findIndex((o: any) => o.command === command);
    if (existingIdx >= 0) {
      if (dailyLimit !== undefined && dailyLimit !== null) {
        const maxLimitAllowed = isMax ? 1000000 : (botPlan?.editableCommands?.find((ec: any) => ec.command === command)?.maxLimit || 100);
        if (Number(dailyLimit) > maxLimitAllowed) {
          return res.status(400).json({ 
            error: `Your current ${botDoc.plan.toUpperCase()} tier allows configuring a limit up to ${maxLimitAllowed} daily credits for ${command}.` 
          });
        }
        botDoc.commandCreditsOverrides[existingIdx].dailyLimit = Number(dailyLimit);
      }
      if (autoDeleteMs !== undefined && autoDeleteMs !== null) {
        botDoc.commandCreditsOverrides[existingIdx].autoDeleteMs = Number(autoDeleteMs);
      }
    } else {
      let initDaily = dailyLimit !== undefined && dailyLimit !== null ? Number(dailyLimit) : 100;
      if (dailyLimit === undefined || dailyLimit === null) {
        const cmdDefObj = await Command.findOne({ command });
        initDaily = cmdDefObj?.defaultDailyCredits || 50;
      } else {
        const maxLimitAllowed = isMax ? 1000000 : (botPlan?.editableCommands?.find((ec: any) => ec.command === command)?.maxLimit || 100);
        if (Number(dailyLimit) > maxLimitAllowed) {
          return res.status(400).json({ 
            error: `Your current ${botDoc.plan.toUpperCase()} tier allows configuring a limit up to ${maxLimitAllowed} daily credits for ${command}.` 
          });
        }
      }
      botDoc.commandCreditsOverrides.push({ 
        command, 
        dailyLimit: initDaily,
        autoDeleteMs: autoDeleteMs !== undefined && autoDeleteMs !== null ? Number(autoDeleteMs) : 0
      });
    }

    botDoc.markModified('commandCreditsOverrides');
    await botDoc.save();

    stopMirrorBot(token);
    await startMirrorBot(botDoc);

    res.json({ success: true, bot: botDoc, message: 'Command overrides updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verify mirror bot plan purchase
apiRouter.post('/api/mirror-bots/verify-payment', async (req, res) => {
  try {
    const { token, ownerTelegramId, plan, amount, paymentId } = req.body;
    if (!token || !ownerTelegramId || !plan || !amount || !paymentId) {
      return res.status(400).json({ error: 'Missing required validation parameters.' });
    }

    const cleanPaymentId = String(paymentId).trim();

    const spentTxn = await UsedTransaction.findOne({ transactionId: cleanPaymentId });
    if (spentTxn) {
      return res.status(400).json({ error: 'This transaction/UTR ID has already been verified and used.' });
    }

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
    } catch (apiErr: any) {
      console.error("[Fampay Verification Request Error]", apiErr.message);
      return res.status(502).json({ error: 'Fampay payment service network error. Please try again.' });
    }

    if (!foundTxn) {
      return res.status(404).json({ 
        error: 'Payment transaction not found or amount mismatch. Ensure you paid the exact amount and entered correct UTR.' 
      });
    }

    const finalUtr = foundTxn.utr || cleanPaymentId;
    const finalTxnId = foundTxn.txn_id || cleanPaymentId;

    const doubleSpentCheckUtr = await UsedTransaction.findOne({ transactionId: finalUtr });
    if (doubleSpentCheckUtr) {
      return res.status(400).json({ error: 'This transaction has already been verified for another purchase.' });
    }

    await UsedTransaction.create({ transactionId: finalUtr, telegramId: ownerTelegramId, amount: Number(amount), type: `mirror_subscription_${plan}` });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Configured cloned bot reference missing.' });

    botDoc.plan = plan;
    const isAlreadySubbed = botDoc.expiresAt && new Date(botDoc.expiresAt).getTime() > Date.now();
    const baseTime = isAlreadySubbed ? new Date(botDoc.expiresAt).getTime() : Date.now();
    botDoc.expiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000); 
    await botDoc.save();

    stopMirrorBot(token);
    if (botDoc.isActive) {
      await startMirrorBot(botDoc).catch((e: any) => console.error("Failed restarting bot poller:", e));
    }

    try {
      const topLevelBotInstance = (await import("./bot.js")).getBot();
      if (topLevelBotInstance) {
        await topLevelBotInstance.telegram.sendMessage(
          ownerTelegramId,
          `🎉 *Mirrored Bot Upgraded Successfully!* 🎉\n\n` +
          `Your cloned bot @${botDoc.botUsername || 'your_bot'} has been upgraded to *${plan.toUpperCase()} Tier*!\n\n` +
          `💰 *Amount Paid:* ₹${amount}\n` +
          `📅 *Expiry extended:* ${new Date(botDoc.expiresAt).toLocaleDateString("en-IN")}\n` +
          `💳 *UTR:* \`${finalUtr}\`\n\n` +
          `Thank you for trusting ENCORE XOSINT!`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (msgErr) {
      console.warn("Failed sending notification DM", msgErr);
    }

    res.json({ success: true, bot: botDoc, message: `Mirrored Bot promoted to ${plan.toUpperCase()} Tier successfully!` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update standard details of a mirror bot (e.g. changing Force channels, config, default credits)
apiRouter.post('/api/mirror-bots/update', async (req, res) => {
  try {
    const { token, customBotName, defaultGroupCredits, forceChannels } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    // Validate Force Channels maximum allowance based on Plan
    if (forceChannels && Array.isArray(forceChannels)) {
      const allowedCount = getMaxForceChannels(botDoc.plan);
      const filteredChannels = forceChannels.filter((ch: any) => {
        const username = typeof ch === 'string' ? ch : (ch.username || ch.id || '');
        const norm = username.trim().toLowerCase().replace(/^@/, '');
        return norm !== 'encorexosint';
      });

      if (filteredChannels.length > allowedCount) {
        return res.status(400).json({ 
          error: `Under your ${botDoc.plan.toUpperCase()} plan, you can only set up to ${allowedCount} custom forced subscription channels. Please upgrade for more!` 
        });
      }
      botDoc.forceChannels = forceChannels;
    }

    if (customBotName !== undefined) botDoc.customBotName = customBotName;
    if (defaultGroupCredits !== undefined) botDoc.defaultGroupCredits = Number(defaultGroupCredits);

    await botDoc.save();

    // Restart the bot poller to pick up new configurations
    stopMirrorBot(token);
    await startMirrorBot(botDoc).catch(() => {});

    res.json({ success: true, bot: botDoc, message: 'Settings saved successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle a Mirror Bot active state
apiRouter.post('/api/mirror-bots/toggle-active', async (req, res) => {
  try {
    const { token, isActive } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    botDoc.isActive = !!isActive;
    await botDoc.save();

    if (botDoc.isActive) {
      await startMirrorBot(botDoc).catch(() => {});
    } else {
      stopMirrorBot(token);
    }

    res.json({ success: true, isActive: botDoc.isActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fix Stuck endpoint: manually deletes any Telegram webhook and forces a clean start
apiRouter.post('/api/mirror-bots/fix-stuck', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot configuration not found' });

    console.log(`[Fix Stuck Request] Hard-resetting webhook/polling for bot: @${botDoc.botUsername || token.substring(0, 8)}`);

    // Stop current instance in active pollers map
    stopMirrorBot(token);

    // Create a temporary Telegraf instance to invoke deleteWebhook from Telegram servers directly
    const tempBot = new Telegraf(token);
    await tempBot.telegram.deleteWebhook({ drop_pending_updates: true }).catch((e) => {
      console.warn("[Fix Stuck Webhook Delete Warn]", e.message);
    });

    // Freshly launch the Mirror bot
    const reloaded = await MirrorBot.findOne({ token });
    if (reloaded) {
      await startMirrorBot(reloaded);
    }

    res.json({
      success: true,
      message: `Successfully flushed hook, dropped pending queues, and reconfigured live handlers for @${botDoc.botUsername || 'your bot'}!`
    });
  } catch (err: any) {
    console.error("[Fix Stuck API Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// Manage exclusions (Silver+ plan feature to deactivate default commands)
apiRouter.post('/api/mirror-bots/toggle-command', async (req, res) => {
  try {
    const { token, command, isExcluded } = req.body;
    if (!token || !command) return res.status(400).json({ error: 'Missing parameters' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (botDoc.plan === 'free') {
      return res.status(403).json({ error: 'Deactivating core commands is restricted to SILVER plans and above. Please upgrade!' });
    }

    let excluded = botDoc.excludedCommands || [];
    if (isExcluded) {
      if (!excluded.includes(command)) {
        excluded.push(command);
      }
    } else {
      excluded = excluded.filter((c: string) => c !== command);
    }

    botDoc.excludedCommands = excluded;
    await botDoc.save();

    res.json({ success: true, excludedCommands: botDoc.excludedCommands });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add custom API-based command (Silver+ feature)
apiRouter.post('/api/mirror-bots/custom-command', async (req, res) => {
  try {
    const { token, command, description, apiUrl, isCreditBased, defaultDailyCredits, decoratedMessage, autoDeleteSeconds } = req.body;
    if (!token || !command || !apiUrl) {
      return res.status(400).json({ error: 'Missing required command properties' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (botDoc.plan === 'free') {
      return res.status(403).json({ error: 'Custom API commands are restricted to SILVER plans or higher. Please upgrade to unlock.' });
    }

    // Format check command starts with '/'
    let cleanCmd = command.trim();
    if (!cleanCmd.startsWith('/')) {
      cleanCmd = '/' + cleanCmd;
    }

    // Check conflict
    const conflictsWithDefault = await Command.findOne({ command: cleanCmd });
    if (conflictsWithDefault) {
      return res.status(400).json({ error: 'This is a core system command and cannot be overwritten with a custom API.' });
    }

    // Find and update, or push
    let customList = botDoc.customCommands || [];
    const idx = customList.findIndex((c: any) => c.command === cleanCmd);
    const cmdPayload: any = {
      command: cleanCmd,
      description: description || '',
      apiUrl: apiUrl.trim(),
      isCreditBased: !!isCreditBased,
      defaultDailyCredits: defaultDailyCredits != null ? Number(defaultDailyCredits) : 0,
      decoratedMessage: decoratedMessage || '{{api.response}}',
      autoDeleteMs: autoDeleteSeconds != null ? Number(autoDeleteSeconds) * 1000 : 0
    };

    if (idx >= 0) {
      customList[idx] = cmdPayload;
    } else {
      customList.push(cmdPayload);
    }

    botDoc.customCommands = customList;
    await botDoc.save();

    // Reload bot setup to pick it up instantly
    stopMirrorBot(token);
    await startMirrorBot(botDoc).catch(() => {});

    res.json({ success: true, customCommands: botDoc.customCommands });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a custom command (Silver+ feature)
apiRouter.delete('/api/mirror-bots/custom-command', async (req, res) => {
  try {
    const { token, command } = req.body;
    if (!token || !command) return res.status(400).json({ error: 'Missing parameters' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    botDoc.customCommands = (botDoc.customCommands || []).filter((cc: any) => cc.command !== command);
    await botDoc.save();

    // Restart bot poller
    stopMirrorBot(token);
    await startMirrorBot(botDoc).catch(() => {});

    res.json({ success: true, customCommands: botDoc.customCommands });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change dynamic credits for standard commands (SILVER / GOLD plan override check)
apiRouter.post('/api/mirror-bots/command-credits-override', async (req, res) => {
  try {
    const { token, command, dailyLimit } = req.body;
    if (!token || !command || dailyLimit == null) {
      return res.status(400).json({ error: 'Missing token, command or dailyLimit' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (botDoc.plan === 'free') {
      return res.status(403).json({ error: 'Custom credits limits are restricted to SILVER and higher sub tiers.' });
    }

    const cmdDef = await Command.findOne({ command });
    if (!cmdDef) return res.status(404).json({ error: 'Command not found.' });

    // Validate limit caps (Gold has 2x global command credits restriction)
    const extraAllowed = 0; // standard default
    const isAllowed = isCreditOverrideAllowed(botDoc.plan, cmdDef.defaultDailyCredits, Number(dailyLimit), extraAllowed);
    if (!isAllowed) {
      return res.status(400).json({ 
        error: `Under the GOLD plan, you can only set credits up to 2x global credits (limit is ${cmdDef.defaultDailyCredits * 2})! Upgrade to Max for no limits.` 
      });
    }

    let overrides = botDoc.commandCreditsOverrides || [];
    const idx = overrides.findIndex((o: any) => o.command === command);
    if (idx >= 0) {
      overrides[idx].dailyLimit = Number(dailyLimit);
    } else {
      overrides.push({ command, dailyLimit: Number(dailyLimit) });
    }

    botDoc.commandCreditsOverrides = overrides;
    await botDoc.save();

    res.json({ success: true, overrides: botDoc.commandCreditsOverrides });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update/Edit specific user credits limits centrally (Silver+ feature)
apiRouter.post('/api/mirror-bots/user-credits-override', async (req, res) => {
  try {
    const { token, userId, command, dailyLimit, isUnlimited } = req.body;
    if (!token || !userId || !command || dailyLimit == null) {
      return res.status(400).json({ error: 'Missing params' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (botDoc.plan === 'free') {
      return res.status(403).json({ error: 'Editing user credits limits is a SILVER+ plan feature. Please upgrade!' });
    }

    const userDoc = await BotUser.findOne({ telegramId: userId });
    if (!userDoc) return res.status(404).json({ error: 'User does not exist.' });

    let commandCredits = userDoc.commandCredits || [];
    const idx = commandCredits.findIndex((c: any) => c.command === command);

    if (idx >= 0) {
      commandCredits[idx].dailyLimit = Number(dailyLimit);
      commandCredits[idx].isUnlimited = !!isUnlimited;
    } else {
      commandCredits.push({ command, dailyLimit: Number(dailyLimit), isUnlimited: !!isUnlimited });
    }

    userDoc.commandCredits = commandCredits;
    userDoc.markModified('commandCredits');
    await userDoc.save();

    res.json({ success: true, user: userDoc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch detailed lists of users who interacted with this specific mirror bot
apiRouter.get('/api/mirror-bots/users', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot has not been found' });

    const users = await BotUser.find({ interactedBots: botDoc.botUsername });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch detailed lists of groups which have been tracked on this mirror bot
apiRouter.get('/api/mirror-bots/groups', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot has not been found' });

    const groups = await BotGroup.find({ interactedBots: botDoc.botUsername });
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ban/Unban user or group specifically from this mirror bot
apiRouter.post('/api/mirror-bots/ban', async (req, res) => {
  try {
    const { token, id, type, isBanned } = req.body; // type: 'user' | 'group'
    if (!token || !id || !type) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    const cleanId = String(id).trim();

    if (type === 'user') {
      let list = botDoc.bannedUsers || [];
      if (isBanned) {
        if (!list.includes(cleanId)) list.push(cleanId);
      } else {
        list = list.filter((u: string) => u !== cleanId);
      }
      botDoc.bannedUsers = list;
    } else {
      let list = botDoc.bannedGroups || [];
      if (isBanned) {
        if (!list.includes(cleanId)) list.push(cleanId);
      } else {
        list = list.filter((g: string) => g !== cleanId);
      }
      botDoc.bannedGroups = list;
    }

    await botDoc.save();
    res.json({ success: true, bannedUsers: botDoc.bannedUsers, bannedGroups: botDoc.bannedGroups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Perform custom broadcast messages specifically on this mirror bot (plan quota-capped)
apiRouter.post('/api/mirror-bots/broadcast', async (req, res) => {
  try {
    const { token, message, target } = req.body; // target: 'users' | 'groups' | 'all'
    if (!token || !message || !target) {
      return res.status(400).json({ error: 'Missing token, message, or target' });
    }

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Bot configuration not found' });

    // Validate Broadcast Limitations
    const today = new Date().toISOString().split('T')[0];
    if (botDoc.lastBroadcastDate !== today) {
      botDoc.broadcastsToday = 0;
      botDoc.lastBroadcastDate = today;
    }

    let limit = 1; // free
    if (botDoc.plan === 'silver') limit = 5;
    else if (botDoc.plan === 'gold') limit = 20;
    else if (botDoc.plan === 'max') limit = 99999; // unlimited

    if (botDoc.broadcastsToday >= limit) {
      return res.status(400).json({ 
        error: `Daily broadcast quota reached. Under your ${botDoc.plan.toUpperCase()} plan, you can only send ${limit} broadcasts per day. Please upgrade for more limit!` 
      });
    }

    // Load running instance
    const botInstance = getMirroredBotInstance(token);
    if (!botInstance) {
      return res.status(500).json({ error: 'Bot runtime is currently offline. Please restart the bot.' });
    }

    // Compile targets matching only users/groups of this bot
    const botUsername = botDoc.botUsername;
    let usersList: string[] = [];
    let groupsList: string[] = [];

    if (target === 'users' || target === 'all') {
      const dbUsers = await BotUser.find({ interactedBots: botUsername, isBanned: false });
      usersList = dbUsers.map(u => String(u.telegramId));
    }
    if (target === 'groups' || target === 'all') {
      const dbGroups = await BotGroup.find({ interactedBots: botUsername, isBanned: false });
      groupsList = dbGroups.map(g => String(g.telegramId));
    }

    // Dispatch messages asynchronously in the background so API does not hang
    let successCount = 0;
    let failedCount = 0;

    // Send immediately to users
    for (const tid of usersList) {
      try {
        await botInstance.telegram.sendMessage(tid, message, { parse_mode: 'Markdown' });
        successCount++;
      } catch (err) {
        failedCount++;
      }
    }

    // Send immediately to groups
    for (const gid of groupsList) {
      try {
        await botInstance.telegram.sendMessage(gid, message, { parse_mode: 'Markdown' });
        successCount++;
      } catch (err) {
        failedCount++;
      }
    }

    // Up user broadcast count
    botDoc.broadcastsToday += 1;
    await botDoc.save();

    res.json({
      success: true,
      message: `Broadcast complete! Sent: ${successCount}. Failures: ${failedCount}`,
      broadcastsToday: botDoc.broadcastsToday,
      limit
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

interface IpCheckStatus {
  attempts: number;
  blockedUntil: number;
}
const ipAttempts = new Map<string, IpCheckStatus>();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return parts[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// IP check middleware for administrative APIs
apiRouter.use(['/api/stats/dashboard', '/api/commands', '/api/users', '/api/groups', '/api/settings', '/api/broadcast', '/api/coupons'], (req, res, next) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const status = ipAttempts.get(ip);
  if (status && status.blockedUntil > now) {
    return res.status(403).json({
      blocked: true,
      message: 'Access Denied. Your IP address is blocked.'
    });
  }
  next();
});

apiRouter.get('/api/admin/check-ip', (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const status = ipAttempts.get(ip);
  if (status && status.blockedUntil > now) {
    const hoursLeft = ((status.blockedUntil - now) / (1000 * 60 * 60)).toFixed(1);
    return res.json({
      blocked: true,
      message: `Your IP is blocked. Please try again in ${hoursLeft} hours.`
    });
  }
  res.json({ blocked: false });
});

apiRouter.post('/api/admin/login', (req, res) => {
  const { key } = req.body;
  const ip = getClientIp(req);
  const now = Date.now();

  let status = ipAttempts.get(ip);
  if (!status) {
    status = { attempts: 0, blockedUntil: 0 };
    ipAttempts.set(ip, status);
  }

  // Check if already blocked
  if (status.blockedUntil > now) {
    const hoursLeft = ((status.blockedUntil - now) / (1000 * 60 * 60)).toFixed(1);
    return res.status(403).json({
      blocked: true,
      message: `Your IP is blocked. Please try again in ${hoursLeft} hours.`
    });
  }

  // Check correct key (master key 'ARUSHNGGA9')
  if (key === 'ARUSHNGGA9') {
    // Reset attempts on successful login
    status.attempts = 0;
    status.blockedUntil = 0;
    return res.json({ success: true });
  } else {
    status.attempts += 1;
    
    if (status.attempts >= 5) {
      status.blockedUntil = now + (24 * 60 * 60 * 1000); // block 24h
      return res.status(403).json({
        blocked: true,
        message: 'Your IP is blocked from accessing the panel for 24 hours.'
      });
    }

    if (status.attempts >= 3) {
      const remaining = 5 - status.attempts;
      return res.status(401).json({
        success: false,
        attempts: status.attempts,
        warning: `Warning: Multiple incorrect attempts. ${remaining} more incorrect attempts will block your IP for 24 hours!`
      });
    }

    return res.status(401).json({
      success: false,
      attempts: status.attempts,
      message: 'Invalid secret key'
    });
  }
});

apiRouter.post('/api/telegram/manual-setup', async (req, res) => {
  let targetUrl = req.body.url || process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!targetUrl) {
    targetUrl = req.protocol + '://' + req.get('host');
  }
  const result = await setupWebhook(targetUrl);
  res.json(result);
});

apiRouter.get('/api/stats/dashboard', async (req, res) => {
  const totalUsers = await BotUser.countDocuments();
  const totalGroups = await BotGroup.countDocuments();
  const totalCommands = await Command.countDocuments();
  const totalCalls = await Statlog.countDocuments();
  
  const groupsAggr = await BotGroup.aggregate([
    { $group: { _id: null, totalMembers: { $sum: "$memberCount" } } }
  ]);
  const totalGroupMembers = groupsAggr[0]?.totalMembers || 0;
  
  const recentCommands = await Statlog.find().sort({ timestamp: -1 }).limit(10);
  
  res.json({ totalUsers, totalGroups, totalGroupMembers, totalCommands, totalCalls, recentCommands });
});

apiRouter.get('/api/commands', async (req, res) => {
  const commands = await Command.find().sort({ createdAt: -1 });
  res.json(commands);
});

apiRouter.post('/api/commands', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: 'Database not connected. Please set MONGODB_URI in secrets.' });
    }
    if(req.body._id) {
       const updated = await Command.findByIdAndUpdate(req.body._id, req.body, { new: true });
       res.json(updated);
    } else {
       const newCmd = await Command.create(req.body);
       res.json(newCmd);
    }
  } catch(e: any) {
    console.error("Command Save Error:", e);
    res.status(400).json({ error: e.message || 'Unknown save error' });
  }
});

apiRouter.delete('/api/commands/:id', async (req, res) => {
  await Command.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

apiRouter.get('/api/users', async (req, res) => {
  const users = await BotUser.find().sort({ interactions: -1 });
  res.json(users);
});

apiRouter.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await BotUser.aggregate([
      { $unwind: "$purchaseHistory" },
      {
        $project: {
          _id: 0,
          telegramId: "$telegramId",
          firstName: "$firstName",
          username: "$username",
          purchaseHistoryId: "$purchaseHistory._id",
          productId: "$purchaseHistory.productId",
          productName: "$purchaseHistory.productName",
          price: "$purchaseHistory.price",
          transactionId: "$purchaseHistory.transactionId",
          utr: "$purchaseHistory.utr",
          date: "$purchaseHistory.date",
          status: { $ifNull: ["$purchaseHistory.status", "Success"] }
        }
      },
      { $sort: { date: -1 } }
    ]);
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete target transaction record from user account purchase logs and used transaction list
apiRouter.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Missing transaction identifier.' });
    }

    const isOid = mongoose.Types.ObjectId.isValid(id);
    const idQuery = isOid ? new mongoose.Types.ObjectId(id) : null;

    // Pull from BotUser purchase history arrays matching either subdocument _id, transactionId, or utr
    await BotUser.updateMany(
      {
        $or: [
          { "purchaseHistory._id": idQuery },
          { "purchaseHistory.transactionId": id },
          { "purchaseHistory.utr": id }
        ]
      },
      {
        $pull: {
          purchaseHistory: {
            $or: [
              { _id: idQuery },
              { transactionId: id },
              { utr: id }
            ]
          }
        }
      }
    );

    // Also remove from double-spend safety list (UsedTransaction table) to free up the transaction ID for future re-verification/testing
    await UsedTransaction.deleteMany({
      $or: [
        { transactionId: id }
      ]
    });

    res.json({ success: true, message: 'Transaction record successfully cleared from master records.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/api/users/telegram/:telegramId', async (req, res) => {
  try {
    let user = await BotUser.findOne({ telegramId: req.params.telegramId });
    if (!user) {
      user = new BotUser({
        telegramId: req.params.telegramId,
        firstName: 'Telegram User',
        username: '',
        encCoins: 0,
        commonCredits: new Map()
      });
      await user.save();
    }
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/users/telegram/:telegramId/reward-ad', async (req, res) => {
  try {
    const { provider } = req.body;
    
    if (provider !== 'Monetag') {
        return res.status(400).json({ error: 'Unsupported provider. Only Monetag is active.' });
    }
    
    // Check if provider is enabled
    const settings = await Setting.find({});
    const rewardSettings = settings.find((s: any) => s.key === 'rewardSettings')?.value || { Monetag: true };
    const adGapMinutes = settings.find((s: any) => s.key === 'adGapMinutes')?.value || 10;
    
    if (rewardSettings.Monetag === false) {
        return res.status(403).json({ error: 'Monetag provider disabled' });
    }

    const user = await BotUser.findOne({ telegramId: req.params.telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check cooldown
    const lastWatch = user.rewardAdsLastWatch?.[provider];
    const cooldownMs = adGapMinutes * 60 * 1000;
    
    if (lastWatch && (new Date().getTime() - new Date(lastWatch).getTime() < cooldownMs)) {
        return res.status(429).json({ error: 'Cooldown active', timeLeft: cooldownMs - (new Date().getTime() - new Date(lastWatch).getTime()) });
    }
    
    user.encCoins = (user.encCoins || 0) + 10;
    if (!user.rewardAdsLastWatch) user.rewardAdsLastWatch = {};
    user.rewardAdsLastWatch[provider] = new Date();
    await user.save();
    
    res.json({ success: true, newBalance: user.encCoins });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


apiRouter.post('/api/users/telegram/:telegramId/exchange-coins-to-credits', async (req, res) => {
    try {
        const user = await BotUser.findOne({ telegramId: req.params.telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if ((user.encCoins || 0) < 100) {
            return res.status(400).json({ error: 'Not enough coins' });
        }
        
        // Fetch default group credits limit
        const settings = await Setting.find({});
        const defaultGroupCredits = settings.find((s: any) => s.key === 'defaultGroupCredits')?.value || 50;

        user.encCoins -= 100;
        
        // Ensure we correctly handle current limit
        const currentLimit = user.groupCreditsLimit !== undefined ? user.groupCreditsLimit : Number(defaultGroupCredits);
        user.groupCreditsLimit = currentLimit + 10;
        
        await user.save();
        
        res.json({ success: true, newBalance: user.encCoins, newLimit: user.groupCreditsLimit });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/api/redeem-store', async (req, res) => {
    const setting = await Setting.findOne({ key: 'redeemStore' });
    res.json(setting ? setting.value : []);
});

apiRouter.post('/api/users/telegram/:telegramId/redeem', async (req, res) => {
    try {
        const { command, credits } = req.body;
        const user = await BotUser.findOne({ telegramId: req.params.telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const settings = await Setting.findOne({ key: 'redeemStore' });
        const items = settings ? settings.value : [];
        const item = items.find((i: any) => i.command === command);
        
        if (!item) return res.status(404).json({ error: 'Command not found in store' });
        if (credits < item.minRedeemAmount) return res.status(400).json({ error: `Minimum redeem amount is ${item.minRedeemAmount}` });
        
        const cost = credits * item.pricePerCredit;
        if ((user.encCoins || 0) < cost) return res.status(400).json({ error: 'Not enough coins' });
        
        user.encCoins -= cost;
        if (!user.commonCredits) {
            user.commonCredits = new Map();
        }
        const currentCommon = user.commonCredits.get(command) || 0;
        user.commonCredits.set(command, currentCommon + Number(credits));
        await user.save();
        
        res.json({ success: true, newBalance: user.encCoins, newCommonCredits: user.commonCredits.get(command) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.put('/api/users/:id', async (req, res) => {
  const u = await BotUser.findByIdAndUpdate(req.params.id, req.body, {new: true});
  res.json(u);
});

apiRouter.get('/api/groups', async (req, res) => {
  const groups = await BotGroup.find().sort({ interactions: -1 });
  res.json(groups);
});

apiRouter.put('/api/groups/:id', async (req, res) => {
  const g = await BotGroup.findByIdAndUpdate(req.params.id, req.body, {new: true});
  res.json(g);
});

apiRouter.get('/api/settings', async (req, res) => {
  const settings = await Setting.find({});
  res.json(settings);
});

apiRouter.post('/api/settings', async (req, res) => {
  const { settings } = req.body;
  for (const s of settings) {
    await Setting.findOneAndUpdate({ key: s.key }, { value: s.value }, { upsert: true });
    if (s.key === 'appUrl') {
      setCachedAppUrl(s.value ? String(s.value) : null);
    }
  }
  res.json({ success: true });
});

// Helper to update Telegram Donation leaderboard message
async function updateDonationMessage(providedAppUrl?: string) {
  const bot = getBot();
  if (!bot) {
    console.warn("Main Telegram bot is not initialized. Cannot update donation message.");
    return;
  }

  const messageIdSetting = await Setting.findOne({ key: 'donationChannelMessageId' });
  const donations = await Donation.find({ status: 'Approved' });

  // Sort by INR equivalent value descending
  const sorted = donations.sort((a, b) => {
    const valA = a.method === 'crypto' ? a.amount * 83 : a.amount;
    const valB = b.method === 'crypto' ? b.amount * 83 : b.amount;
    return valB - valA;
  });

  let text = "🏆 *Top Donations!*\n";
  text += "━━━━━━━━━━━━━━━━━━━━\n\n";

  if (sorted.length === 0) {
    text += "No donations yet! Be the first to support our channel context ❤️\n\n";
  } else {
    sorted.slice(0, 10).forEach((d, i) => {
      let medal = "";
      if (i === 0) medal = " 🥇";
      else if (i === 1) medal = " 🥈";
      else if (i === 2) medal = " 🥉";
      else medal = " 🎖️";

      if (d.method === 'crypto') {
        text += `${i + 1}. *${d.name}* - $${d.amount} (${d.cryptoCurrency})${medal}\n`;
      } else {
        text += `${i + 1}. *${d.name}* - ₹${d.amount}${medal}\n`;
      }
    });
    text += "\n";
  }

  text += "━━━━━━━━━━━━━━━━━━━━\n";
  text += "Donate using the given webapp below👇!";

  const appUrlSetting = await Setting.findOne({ key: 'appUrl' });
  let appUrl = appUrlSetting?.value || getCachedAppUrl() || providedAppUrl || '';
  if (!appUrl.startsWith('http') && providedAppUrl) {
    appUrl = providedAppUrl;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "Donate Now 💸", url: `${appUrl}/donate` }]
    ]
  };

  // Auto-heal: If there is no active donation leader board message ID, send a new one
  if (!messageIdSetting || !messageIdSetting.value) {
    try {
      console.log("No sent donation message ID found. Creating a new message...");
      const sent = await bot.telegram.sendMessage('@encorexosint', text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      await Setting.findOneAndUpdate(
        { key: 'donationChannelMessageId' },
        { value: sent.message_id },
        { upsert: true }
      );
      console.log("Automatically sent new donation channel message and updated ID.");
      return;
    } catch (sendErr: any) {
      console.error("Failed to automatically send donation channel message:", sendErr.message);
      return;
    }
  }

  const messageId = Number(messageIdSetting.value);

  try {
    await bot.telegram.editMessageText('@encorexosint', messageId, undefined, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    console.log("Donation channel message edited successfully!");
  } catch (err: any) {
    console.error("Failed to edit donation channel message:", err.message);
    if (err.message && err.message.includes("message is not modified")) {
      return;
    }
    // Auto-heal: If edit failed because message is deleted or not found, broadcast a fresh message
    try {
      console.log("Failed to edit message. Creating a new message instead of editing...");
      const sent = await bot.telegram.sendMessage('@encorexosint', text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      await Setting.findOneAndUpdate(
        { key: 'donationChannelMessageId' },
        { value: sent.message_id },
        { upsert: true }
      );
      console.log("Successfully auto-healed and sent a new donation message to replace deleted one.");
    } catch (fallbackErr: any) {
      console.error("Failed to send fallback message:", fallbackErr.message);
    }
  }
}

apiRouter.get('/api/bot-maintenance-status', async (req, res) => {
  try {
    const maintenanceSetting = await Setting.findOne({ key: 'botMaintenanceMode' });
    res.json({ maintenance: !!maintenanceSetting?.value });
  } catch (err: any) {
    res.status(500).json({ error: err.message, maintenance: false });
  }
});

// Donation Endpoints
apiRouter.get('/api/donations/config', async (req, res) => {
  try {
    const configSetting = await Setting.findOne({ key: 'donationSystemConfig' });
    const defaultConfig = {
      payeeUpi: 'alkhkumar@fam',
      cryptoCurrencyName: 'USDT (TRC-20)',
      cryptoWalletAddress: '',
      showCrypto: false
    };
    res.json(configSetting?.value || defaultConfig);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/donations/config', async (req, res) => {
  try {
    const { payeeUpi, cryptoCurrencyName, cryptoWalletAddress, showCrypto } = req.body;
    const config = {
      payeeUpi: payeeUpi || 'alkhkumar@fam',
      cryptoCurrencyName: cryptoCurrencyName || 'USDT (TRC-20)',
      cryptoWalletAddress: cryptoWalletAddress || '',
      showCrypto: !!showCrypto
    };

    await Setting.findOneAndUpdate(
      { key: 'donationSystemConfig' },
      { value: config },
      { upsert: true }
    );

    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/api/donations', async (req, res) => {
  try {
    const donations = await Donation.find().sort({ createdAt: -1 });
    res.json(donations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/api/donations/:id', async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) {
      return res.status(404).json({ error: 'Donation record not found' });
    }

    // Free up transaction UTR/TXID from UsedTransaction so it can be reused/re-verified if correct
    if (donation.utr) {
      await UsedTransaction.deleteOne({ transactionId: donation.utr });
    }

    await Donation.findByIdAndDelete(req.params.id);

    const reqProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const reqHost = req.headers.host;
    const currentOrigin = `${reqProtocol}://${reqHost}`;

    // Update the telegram message seamlessly
    await updateDonationMessage(currentOrigin);

    res.json({ success: true, message: 'Donation record deleted and channel leaderboard updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/donations/send-message', async (req, res) => {
  try {
    const bot = getBot();
    if (!bot) {
      return res.status(400).json({ error: 'Main bot is not initialized. Make sure TELEGRAM_BOT_TOKEN is configured.' });
    }

    const reqProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const reqHost = req.headers.host;
    const currentOrigin = `${reqProtocol}://${reqHost}`;

    const donations = await Donation.find({ status: 'Approved' });
    const sorted = donations.sort((a, b) => {
      const valA = a.method === 'crypto' ? a.amount * 83 : a.amount;
      const valB = b.method === 'crypto' ? b.amount * 83 : b.amount;
      return valB - valA;
    });

    let text = "🏆 *Top Donations!*\n";
    text += "━━━━━━━━━━━━━━━━━━━━\n\n";

    if (sorted.length === 0) {
      text += "No donations yet! Be the first to support our channel context ❤️\n\n";
    } else {
      sorted.slice(0, 10).forEach((d, i) => {
        let medal = "";
        if (i === 0) medal = " 🥇";
        else if (i === 1) medal = " 🥈";
        else if (i === 2) medal = " 🥉";
        else medal = " 🎖️";

        if (d.method === 'crypto') {
          text += `${i + 1}. *${d.name}* - $${d.amount} (${d.cryptoCurrency})${medal}\n`;
        } else {
          text += `${i + 1}. *${d.name}* - ₹${d.amount}${medal}\n`;
        }
      });
      text += "\n";
    }

    text += "━━━━━━━━━━━━━━━━━━━━\n";
    text += "Donate using the given webapp below👇!";

    const appUrlSetting = await Setting.findOne({ key: 'appUrl' });
    let appUrl = appUrlSetting?.value || getCachedAppUrl() || currentOrigin;
    if (!appUrl.startsWith('http')) {
      appUrl = currentOrigin;
    }

    // Auto-update appUrl in database settings and cache if it was empty/relative so we remember it
    if (appUrl !== appUrlSetting?.value) {
      await Setting.findOneAndUpdate(
        { key: 'appUrl' },
        { value: appUrl },
        { upsert: true }
      );
      setCachedAppUrl(appUrl);
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "Donate Now 💸", url: `${appUrl}/donate` }]
      ]
    };

    const sent = await bot.telegram.sendMessage('@encorexosint', text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    await Setting.findOneAndUpdate(
      { key: 'donationChannelMessageId' },
      { value: sent.message_id },
      { upsert: true }
    );

    res.json({ success: true, message: 'Donation message sent successfully inside @encorexosint channel!' });
  } catch (err: any) {
    console.error("Failed to send donation message:", err.message);
    res.status(500).json({ error: 'Failed to post to Telegram format channel. Make sure bot is an admin in @encorexosint: ' + err.message });
  }
});

apiRouter.post('/api/donations/verify-upi', async (req, res) => {
  try {
    const { name, amount, utr } = req.body;
    if (!utr) return res.status(400).json({ error: 'Transaction/UTR ID is required' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Please specify a valid numeric amount' });
    }

    const cleanUtr = String(utr).trim();
    
    // Check double spend in UsedTransaction
    const spentTxn = await UsedTransaction.findOne({ transactionId: cleanUtr });
    if (spentTxn) {
      return res.status(400).json({ error: 'This transaction/UTR ID has already been used.' });
    }

    // Check double spend in Donation
    const spentDonation = await Donation.findOne({ utr: cleanUtr });
    if (spentDonation) {
      return res.status(400).json({ error: 'This donation transaction/UTR ID has already been added.' });
    }

    // Call Fampay APIs
    let foundTxn: any = null;
    try {
      // Query 1: Try as UTR
      const utrRes = await axios.get(`https://famnify.vercel.app/fampay?utr=${cleanUtr}`);
      if (utrRes.data && utrRes.data.found && utrRes.data.results && utrRes.data.results.length > 0) {
        foundTxn = utrRes.data.results.find((item: any) => {
          const isSuccess = String(item.Payment).toLowerCase() === 'success';
          const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0;
          return isSuccess && isAmountMatch;
        });
      }

      // Query 2: Try as ID if not found
      if (!foundTxn) {
        const idRes = await axios.get(`https://famnify.vercel.app/fampay?id=${cleanUtr}`);
        if (idRes.data && idRes.data.found && idRes.data.results && idRes.data.results.length > 0) {
          foundTxn = idRes.data.results.find((item: any) => {
            const isSuccess = String(item.Payment).toLowerCase() === 'success';
            const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0;
            return isSuccess && isAmountMatch;
          });
        }
      }
    } catch (apiErr: any) {
      console.error("[Donation Fampay verif error]", apiErr.message);
      return res.status(502).json({ error: 'Verification service temporarily offline. Please try manually or wait and try again.' });
    }

    if (!foundTxn) {
      return res.status(400).json({ 
        error: `Transaction not found on Fampay or amount does not match ₹${amount}. Ensure payment is successful and exact amount was sent.` 
      });
    }

    const realAmount = Number(amount);

    // Register transaction ID as spent
    await UsedTransaction.create({
      transactionId: cleanUtr,
      telegramId: 'donation_webapp',
      amount: realAmount,
      type: 'donation'
    });

    const reqProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const reqHost = req.headers.host;
    const currentOrigin = `${reqProtocol}://${reqHost}`;

    const newDonation = await Donation.create({
      name: name?.trim() || 'Anonymous',
      amount: realAmount,
      method: 'upi',
      utr: cleanUtr,
      status: 'Approved'
    });

    // Rebuild/Update main channel message
    await updateDonationMessage(currentOrigin);

    res.json({ success: true, donation: newDonation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/donations/submit-crypto', async (req, res) => {
  try {
    const { name, amount, utr, cryptoCurrency } = req.body;
    if (!utr) return res.status(400).json({ error: 'Transaction Hash/UTR is required' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Please enter a valid donation amount' });
    }
    if (!cryptoCurrency) return res.status(400).json({ error: 'Crypto Currency name is required' });

    const cleanUtr = String(utr).trim();

    // Check double spend in UsedTransaction
    const spentTxn = await UsedTransaction.findOne({ transactionId: cleanUtr });
    if (spentTxn) {
      return res.status(400).json({ error: 'This transaction/hash has already been used.' });
    }

    // Check double spend in Donation
    const spentDonation = await Donation.findOne({ utr: cleanUtr });
    if (spentDonation) {
      return res.status(400).json({ error: 'This donation transaction/hash has already been submitted.' });
    }

    const newDonation = await Donation.create({
      name: name?.trim() || 'Anonymous',
      amount: Number(amount),
      method: 'crypto',
      utr: cleanUtr,
      cryptoCurrency,
      status: 'Pending'
    });

    res.json({ success: true, message: 'Your crypto donation has been submitted and is pending verification. Thank you!', donation: newDonation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/donations/moderate', async (req, res) => {
  try {
    const { donationId, action } = req.body; // action: 'Approve' or 'Reject'
    if (!donationId || !action) {
      return res.status(400).json({ error: 'donationId and action are required' });
    }

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ error: 'Donation record not found' });

    if (donation.status !== 'Pending') {
      return res.status(400).json({ error: `This donation has already been ${donation.status.toLowerCase()}.` });
    }

    if (action === 'Approve') {
      donation.status = 'Approved';
      await donation.save();

      // Register transaction ID as spent
      await UsedTransaction.create({
        transactionId: donation.utr,
        telegramId: 'donation_webapp',
        amount: donation.amount,
        type: 'donation'
      });

      const reqProtocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const reqHost = req.headers.host;
      const currentOrigin = `${reqProtocol}://${reqHost}`;

      // Update message
      await updateDonationMessage(currentOrigin);
      return res.json({ success: true, message: 'Donation approved successfully and channel message updated!' });
    } else {
      donation.status = 'Rejected';
      await donation.save();
      return res.json({ success: true, message: 'Donation rejected.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/api/broadcast', async (req, res) => {
  try {
    const history = await BroadcastHistory.find().sort({ createdAt: -1 }).limit(50);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/broadcast', async (req, res) => {
  const { target, message, button, isGlobal } = req.body;
  const bot = getBot();
  if (!bot) return res.status(500).json({ error: 'Main bot is not initialized' });

  try {
    // 1. Create a container history item with status: 'sending', so it shows in the Ongoing Broadcast Box!
    const historyEntry = await BroadcastHistory.create({
      message,
      target: target || 'all',
      status: 'sending',
      isGlobal: !!isGlobal,
      totalUsers: 0,
      successUsers: 0,
      failedUsers: 0,
      totalGroups: 0,
      successGroups: 0,
      failedGroups: 0,
      timeTakenMs: 0
    });

    // 2. Spawn the background loop immediately!
    runBackgroundBroadcast(historyEntry._id.toString(), !!isGlobal, target || 'all', message, button).catch((err) => {
      console.error("[Background Broadcast Worker Error]", err);
    });

    // 3. Return the status immediately so that the front-end doesn't timeout!
    res.json({
      success: true,
      message: "Broadcast started successfully in the background!",
      broadcast: historyEntry
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/broadcast/cancel', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'No broadcast ID provided' });
  }
  try {
    const entry = await BroadcastHistory.findById(id);
    if (!entry) {
      return res.status(404).json({ error: 'Broadcast history not found' });
    }
    if (entry.status !== 'sending') {
      return res.status(400).json({ error: 'This broadcast is not currently ongoing' });
    }
    
    entry.status = 'cancelled';
    await entry.save();
    
    console.log(`[Broadcast Cancel] Cancelled is requested and updated to Mongo for entry ID: ${id}`);
    res.json({ success: true, message: 'Broadcast cancellation signal sent successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendTelegramMessageSafe(
  botInstance: any,
  chatId: string,
  message: string,
  reply_markup: any,
  retries = 2
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!botInstance || !botInstance.telegram) {
        return false;
      }
      await botInstance.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup });
      return true;
    } catch (err: any) {
      const errorCode = err.code || err.response?.error_code || err.response?.status;
      const desc = (err.description || err.message || "").toLowerCase();

      // Check for Rate Limit (429)
      const isRateLimit =
        errorCode === 429 ||
        desc.includes('too many requests') ||
        desc.includes('retry_after');

      if (isRateLimit) {
        const retryAfter = err.parameters?.retry_after || 4;
        console.warn(`[Broadcast Rate Limit] Hit 429. Waiting for ${retryAfter}s. Chat: ${chatId}`);
        await sleep(retryAfter * 1000 + 300);
        continue; // retry
      }

      // Check for permanent failures (400, 403, 401, etc.)
      const isPermanent =
        errorCode === 400 ||
        errorCode === 403 ||
        errorCode === 401 ||
        desc.includes('blocked') ||
        desc.includes('forbidden') ||
        desc.includes('not found') ||
        desc.includes('deactivated') ||
        desc.includes('chat not found') ||
        desc.includes('kicked') ||
        desc.includes('not a member') ||
        desc.includes('peer_id_invalid') ||
        desc.includes('user is deactivated') ||
        desc.includes('bot was blocked') ||
        desc.includes('is deleted');

      if (isPermanent) {
        return false;
      }

      // Small sleep before generic retries
      await sleep(100);
    }
  }
  return false;
}

// Real-time broadcast runner function designed to map bot instances dynamically
async function runBackgroundBroadcast(historyId: string, isGlobal: boolean, target: string, message: string, button: any) {
  try {
    const historyEntry = await BroadcastHistory.findById(historyId);
    if (!historyEntry) return;

    const startTime = Date.now();
    const bot = getBot();
    if (!bot) {
      historyEntry.status = 'failed';
      await historyEntry.save();
      return;
    }

    // Load active mirror bots
    const mirrorBots = await MirrorBot.find({ isActive: true });
    // Map username (lowercase) to bot details
    const mirrorBotsMap = new Map<string, any>();
    for (const mb of mirrorBots) {
      if (mb.botUsername) {
        const mbInstance = getMirroredBotInstance(mb.token);
        if (mbInstance) {
          mirrorBotsMap.set(mb.botUsername.toLowerCase(), { instance: mbInstance, plan: mb.plan });
        }
      }
    }

    let targetUsers: any[] = [];
    let targetGroups: any[] = [];

    if (target === 'users' || target === 'all' || target === 'global_broadcast') {
      targetUsers = await BotUser.find({ isBanned: false });
    }
    if (target === 'groups' || target === 'all' || target === 'global_broadcast') {
      targetGroups = await BotGroup.find({ isBanned: false });
    }

    // Filter targets based on global/local preferences, excluding Max plan
    let filteredUsers = targetUsers;
    let filteredGroups = targetGroups;
    const mainBotUsername = bot.botInfo?.username?.toLowerCase() || '';

    if (!isGlobal) {
      // Direct Main Bot targets only (interacted with main bot or has empty interacted list)
      filteredUsers = targetUsers.filter(u => {
        if (!u.interactedBots || u.interactedBots.length === 0) return true;
        return u.interactedBots.some((b: string) => b.toLowerCase() === mainBotUsername);
      });
      filteredGroups = targetGroups.filter(g => {
        if (!g.interactedBots || g.interactedBots.length === 0) return true;
        return g.interactedBots.some((b: string) => b.toLowerCase() === mainBotUsername);
      });
    } else {
      // Global targets (Main Bot + Free/Silver/Gold Mirror bots only. Excludes white-labeled MAX bots)
      filteredUsers = targetUsers.filter(u => {
        if (!u.interactedBots || u.interactedBots.length === 0) return true;
        return u.interactedBots.some((botName: string) => {
          const lowerName = botName.toLowerCase();
          if (lowerName === mainBotUsername) return true;
          const mapped = mirrorBotsMap.get(lowerName);
          if (mapped && mapped.plan !== 'max') return true;
          return false;
        });
      });
      filteredGroups = targetGroups.filter(g => {
        if (!g.interactedBots || g.interactedBots.length === 0) return true;
        return g.interactedBots.some((botName: string) => {
          const lowerName = botName.toLowerCase();
          if (lowerName === mainBotUsername) return true;
          const mapped = mirrorBotsMap.get(lowerName);
          if (mapped && mapped.plan !== 'max') return true;
          return false;
        });
      });
    }

    historyEntry.totalUsers = filteredUsers.length;
    historyEntry.totalGroups = filteredGroups.length;
    await historyEntry.save();

    let successUsers = 0;
    let failedUsers = 0;
    let successGroups = 0;
    let failedGroups = 0;

    // Button Setup
    let reply_markup: any = undefined;
    if (button) {
      const inlineBtn: any = { text: button.text };
      if (button.action === 'url') {
        inlineBtn.url = button.value;
      } else {
        inlineBtn.callback_data = button.value;
      }
      if (button.style) inlineBtn.style = button.style;
      reply_markup = { inline_keyboard: [[inlineBtn]] };
    }

    let lastCommitTime = 0;
    const commitProgress = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastCommitTime < 1000) {
        return; // debounce DB writes to max 1 update per second
      }
      lastCommitTime = now;
      try {
        await BroadcastHistory.updateOne(
          { _id: historyId },
          {
            $set: {
              successUsers,
              failedUsers,
              successGroups,
              failedGroups
            }
          }
        );
      } catch (err) {
        console.error("[Broadcast Progress Update Error]", err);
      }
    };

    // Group tasks by bot activeSender
    interface BroadcastTask {
      chatId: string;
      type: 'user' | 'group';
    }

    const botTasksMap = new Map<any, BroadcastTask[]>();
    botTasksMap.set(bot, []);

    const getBotForChat = (interactedBots: string[] | undefined) => {
      if (interactedBots && interactedBots.length > 0) {
        for (const botName of interactedBots) {
          const mapped = mirrorBotsMap.get(botName.toLowerCase());
          if (mapped) {
            return mapped.instance;
          }
        }
      }
      return bot;
    };

    // Allocate user tasks
    for (const u of filteredUsers) {
      const activeSender = getBotForChat(u.interactedBots);
      if (!botTasksMap.has(activeSender)) {
        botTasksMap.set(activeSender, []);
      }
      botTasksMap.get(activeSender)!.push({
        chatId: String(u.telegramId),
        type: 'user'
      });
    }

    // Allocate group tasks
    for (const g of filteredGroups) {
      const activeSender = getBotForChat(g.interactedBots);
      if (!botTasksMap.has(activeSender)) {
        botTasksMap.set(activeSender, []);
      }
      botTasksMap.get(activeSender)!.push({
        chatId: String(g.telegramId),
        type: 'group'
      });
    }

    // Define a rate-limited channel worker for a specific bot's queue
    const runWorkerForBot = async (botInstance: any, tasks: BroadcastTask[]) => {
      // Use 15 concurrent requests for main bot, & 10 for cloned bots to stay perfectly compliant
      const isMainBot = (botInstance === bot);
      const CHUNK_SIZE = isMainBot ? 12 : 8; 

      for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        // Safe check for live cancellation status
        const freshEntry = await BroadcastHistory.findById(historyId).select('status');
        if (!freshEntry || freshEntry.status === 'cancelled') {
          console.log(`[Broadcast Worker] Active cancellation signal caught for ID ${historyId}. Halting worker.`);
          return;
        }

        const chunk = tasks.slice(i, i + CHUNK_SIZE);
        const chunkStartTime = Date.now();

        await Promise.all(
          chunk.map(async (task) => {
            const success = await sendTelegramMessageSafe(botInstance, task.chatId, message, reply_markup);
            if (task.type === 'user') {
              if (success) successUsers++;
              else failedUsers++;
            } else {
              if (success) successGroups++;
              else failedGroups++;
            }
          })
        );

        await commitProgress();

        // Safe spacing: rate-limits total throughput cleanly below limits
        const elapsed = Date.now() - chunkStartTime;
        const sleepTime = 1000 - elapsed;
        if (sleepTime > 0) {
          await sleep(sleepTime);
        } else {
          // yield CPU briefly to prevent execution locks
          await sleep(50);
        }
      }
    };

    // Execute workers concurrently for all active bots to utilize multi-token system fully!
    const workers: Promise<void>[] = [];
    for (const [botInstance, tasks] of botTasksMap.entries()) {
      if (tasks.length > 0) {
        workers.push(runWorkerForBot(botInstance, tasks));
      }
    }

    await Promise.all(workers);

    // Final database update
    const finalEntry = await BroadcastHistory.findById(historyId);
    if (finalEntry && finalEntry.status !== 'cancelled') {
      const timeTakenMs = Date.now() - startTime;
      await BroadcastHistory.updateOne(
        { _id: historyId },
        {
          $set: {
            status: 'completed',
            timeTakenMs,
            successUsers,
            failedUsers,
            successGroups,
            failedGroups
          }
        }
      );
    }
  } catch (globalErr: any) {
    console.error("[Background broadcast fatal issue]", globalErr);
  }
}

apiRouter.get('/api/adgem-callback', async (req, res) => {
  try {
    // Adgem sends: ?user_id={player_id}&reward={amount}&transaction_id={transaction_id}&auth={payout}
    const { user_id, reward, transaction_id, auth, key } = req.query;
    
    // Simple verification with your postback key (useful if you pass it directly in the URL template)
    const POSTBACK_KEY = 'amd71c3n5k7li3elg90mg1nk';
    if (key !== POSTBACK_KEY) {
      console.warn(`[Adgem Postback] Invalid key attempt.`);
      // Depending on Adgem's exact hashing (which usually uses md5 of tx id + app postback key), 
      // you could verify MD5 here if `auth` contains the hash. But to stay simple, 
      // we check for `key` in the URL if it was added manually.
    }
    
    const coinsToAdd = parseInt(String(reward || 0), 10);
    const tgId = String(user_id);

    if (!tgId || isNaN(coinsToAdd) || coinsToAdd <= 0) {
      return res.status(400).send('Invalid parameters');
    }

    const user = await BotUser.findOne({ telegramId: tgId });
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.encCoins = (user.encCoins || 0) + coinsToAdd;
    await user.save();

    console.log(`[Adgem Postback] Added ${coinsToAdd} ENC to ${tgId} (txn: ${transaction_id})`);
    
    // Adgem requires a positive integer or "1" to denote success
    return res.status(200).send('1');
  } catch (err: any) {
    console.error('[Adgem Postback Error]', err);
    return res.status(500).send('0');
  }
});

apiRouter.get('/api/timewall-callback', async (req, res) => {
  try {
    const { userId, transactionId, revenue, currencyAmount, hash } = req.query;
    const TIMEWALL_SECRET = '621566a48bf270663785099237c56514';
    
    // Check IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const allowedIps = ['51.81.120.73', '142.111.248.18'];
    const isAllowedIp = allowedIps.some(ip => String(clientIp).includes(ip));
    
    if (!isAllowedIp) {
       console.warn(`[TimeWall Postback] Unrecognized IP: ${clientIp}`);
       // Allow for now to debug, or you can block it by uncommenting below:
       // return res.status(403).send('Unauthorized IP');
    }

    if (hash) {
      // TimeWall hash formula: hash("sha256", userID . revenue . SecretKey)
      const stringToHash = `${userId}${revenue}${TIMEWALL_SECRET}`;
      const generatedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
      if (generatedHash !== hash) {
        console.warn(`[TimeWall Postback] Invalid hash. Expected ${generatedHash}, got ${hash}`);
        return res.status(403).send('Invalid hash');
      }
    } else {
       console.warn(`[TimeWall Postback] No hash provided.`);
       return res.status(403).send('Hash required');
    }
    
    const coinsToAdd = parseInt(String(currencyAmount || 0), 10);
    const tgId = String(userId);

    if (!tgId || isNaN(coinsToAdd)) {
      return res.status(400).send('Invalid parameters');
    }

    const user = await BotUser.findOne({ telegramId: tgId });
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.encCoins = (user.encCoins || 0) + coinsToAdd;
    // Don't let users go negative via chargebacks if you want, but typical behavior is to deduct.
    await user.save();

    console.log(`[TimeWall Postback] Processed ${coinsToAdd} ENC for ${tgId} (txn: ${transactionId}, revenue: ${revenue})`);
    
    // TimeWall expects an HTTP 200 OK success status
    return res.status(200).send('OK');
  } catch (err: any) {
    console.error('[TimeWall Postback Error]', err);
    return res.status(500).send('Error processing postback');
  }
});

// Shop and Store settings endpoints
apiRouter.get('/api/shop/settings', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'shopSettings' });
    if (!setting) {
      return res.json({ premiumMonthlyPrice: 80 });
    }
    res.json(setting.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/shop/settings', async (req, res) => {
  try {
    await Setting.findOneAndUpdate(
      { key: 'shopSettings' },
      { value: req.body },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Subscription Tiers endpoint
apiRouter.get('/api/subscription-tiers', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'subscriptionTiers' });
    if (!setting) {
      const defaultTiers = [
        {
          id: "tier_basic",
          name: "Basic Sub",
          price: 50,
          discountPercent: 5,
          commands: []
        },
        {
          id: "tier_gold",
          name: "Gold Sub",
          price: 100,
          discountPercent: 15,
          commands: []
        },
        {
          id: "tier_premium",
          name: "Premium VIP Sub",
          price: 150,
          discountPercent: 25,
          commands: []
        }
      ];
      return res.json(defaultTiers);
    }
    res.json(setting.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/subscription-tiers', async (req, res) => {
  try {
    await Setting.findOneAndUpdate(
      { key: 'subscriptionTiers' },
      { value: req.body },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Coupon Code Admin endpoints
apiRouter.get('/api/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/coupons', async (req, res) => {
  try {
    const { code, discountPercent, tierId, maxUses, isActive } = req.body;
    if (!code || discountPercent === undefined || !tierId || maxUses === undefined) {
      return res.status(400).json({ error: 'Missing required coupon properties.' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    const coupon = await Coupon.findOneAndUpdate(
      { code: cleanCode },
      { code: cleanCode, discountPercent: Number(discountPercent), tierId, maxUses: Number(maxUses), isActive: isActive ?? true },
      { upsert: true, new: true }
    );
    res.json({ success: true, coupon });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/api/coupons/delete', async (req, res) => {
  try {
    const { id } = req.body;
    await Coupon.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Public validation endpoint for users checking out
apiRouter.post('/api/shop/validate-coupon', async (req, res) => {
  try {
    const { code, productId } = req.body;
    if (!code || !productId) {
      return res.status(400).json({ error: 'Coupon code and Product ID/Tier ID are required.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode });

    if (!coupon) {
      return res.status(404).json({ error: 'Invalid coupon code.' });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ error: 'This coupon is no longer active.' });
    }

    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'This coupon code limit has been reached.' });
    }

    // Check tier compatibility
    if (coupon.tierId !== 'all' && coupon.tierId !== productId) {
      return res.status(400).json({ error: 'This coupon code is not applicable to the selected subscription tier.' });
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        tierId: coupon.tierId,
        maxUses: coupon.maxUses,
        usedCount: coupon.usedCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/shop/verify-payment', async (req, res) => {
  try {
    const { telegramId, productId, amount, paymentId, creditsCount, couponCode, botRef } = req.body;
    if (!telegramId || !productId || !amount || !paymentId) {
      return res.status(400).json({ error: 'Missing required validation parameters.' });
    }

    const cleanPaymentId = String(paymentId).trim();

    // Validate Coupon if couponCode is supplied
    let activeCoupon: any = null;
    if (couponCode) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      activeCoupon = await Coupon.findOne({ code: cleanCode });
      if (!activeCoupon) {
        return res.status(400).json({ error: 'Applied coupon code is invalid.' });
      }
      if (!activeCoupon.isActive) {
        return res.status(400).json({ error: 'Applied coupon code is no longer active.' });
      }
      if (activeCoupon.usedCount >= activeCoupon.maxUses) {
        return res.status(400).json({ error: 'Applied coupon code limit has been reached.' });
      }
      if (activeCoupon.tierId !== 'all' && activeCoupon.tierId !== productId) {
        return res.status(400).json({ error: 'Applied coupon code does not apply to this subscription tier.' });
      }
    }

    // Before processing, check for upgrade-only policy if already subscribed
    const isSubscriptionRequest = productId === 'premium' || productId.startsWith('tier_');
    if (isSubscriptionRequest) {
      const user = await BotUser.findOne({ telegramId: String(telegramId) });
      if (user && user.isPremium && user.premiumTier) {
        const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
        const shopSettingsSetting = await Setting.findOne({ key: 'shopSettings' });
        const shopSettings = shopSettingsSetting?.value || {};
        const tiers = (tiersSetting && Array.isArray(tiersSetting.value)) ? tiersSetting.value : [];
        
        let currentTierConfig: any = null;
        if (user.premiumTier === 'premium') {
          currentTierConfig = { price: shopSettings.premiumMonthlyPrice || 80 };
        } else {
          currentTierConfig = tiers.find((t: any) => t.id === user.premiumTier);
        }

        let newTierConfig: any = null;
        if (productId === 'premium') {
          newTierConfig = { price: shopSettings.premiumMonthlyPrice || 80 };
        } else {
          newTierConfig = tiers.find((t: any) => t.id === productId);
        }

        const currentPrice = currentTierConfig ? Number(currentTierConfig.price) : 0;
        const newPrice = newTierConfig ? Number(newTierConfig.price) : 0;

        if (currentPrice > 0 && newPrice <= currentPrice) {
          return res.status(400).json({ error: 'You can only upgrade your subscription to a higher-priced tier.' });
        }
      }
    }

    // 1. Double spend protection across all requests
    const spentTxn = await UsedTransaction.findOne({ transactionId: cleanPaymentId });
    if (spentTxn) {
      return res.status(400).json({ error: 'This transaction/UTR ID has already been verified and used.' });
    }

    // 2. Fetch from Fampay gateway
    let foundTxn: any = null;
    try {
      // Query 1: Try as UTR
      const utrRes = await axios.get(`https://famnify.vercel.app/fampay?utr=${cleanPaymentId}`);
      if (utrRes.data && utrRes.data.found && utrRes.data.results && utrRes.data.results.length > 0) {
        foundTxn = utrRes.data.results.find((item: any) => {
          const isSuccess = String(item.Payment).toLowerCase() === 'success';
          const isAmountMatch = Math.abs(parseFloat(item.money) - Number(amount)) < 1.0; // tolerate small roundoffs
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
    } catch (apiErr: any) {
      console.error("[Fampay Verification Request Error]", apiErr.message);
      return res.status(502).json({ error: 'Fampay payment service network error. Please try again.' });
    }

    if (!foundTxn) {
      try {
        const isSubscription = productId === 'premium' || productId.startsWith('tier_');
        const user = await BotUser.findOne({ telegramId: String(telegramId) });
        if (user) {
          user.purchaseHistory.push({
            productId,
            productName: isSubscription ? `${productId} Subscription` : `Credits for ${productId}`,
            price: Number(amount),
            transactionId: cleanPaymentId,
            utr: cleanPaymentId,
            date: new Date(),
            status: 'Failed'
          });
          await user.save();
        }
      } catch (logErr) {
        console.error("Failed to log failed txn in api.ts:", logErr);
      }

      return res.status(404).json({ 
        error: 'Payment transaction not found or amount mismatch. Ensure you paid the exact amount and entered the correct UTR/ID.' 
      });
    }

    // Verify double-checking on found details to confirm again
    const finalUtr = foundTxn.utr || cleanPaymentId;
    const finalTxnId = foundTxn.txn_id || cleanPaymentId;

    // Check again if the matched IDs inside fampay results might be stored under another used tx record
    const doubleSpentCheckUtr = await UsedTransaction.findOne({ transactionId: finalUtr });
    const doubleSpentCheckTxn = await UsedTransaction.findOne({ transactionId: finalTxnId });
    if (doubleSpentCheckUtr || doubleSpentCheckTxn) {
      return res.status(400).json({ error: 'This transaction has already been verified for another purchase.' });
    }

    // 3. Mark transaction as spent
    if (finalUtr) {
      await UsedTransaction.create({ transactionId: finalUtr, telegramId, amount: Number(amount), type: productId });
    }
    if (finalTxnId && finalTxnId !== finalUtr) {
      await UsedTransaction.create({ transactionId: finalTxnId, telegramId, amount: Number(amount), type: productId });
    }

    // 4. Update user profile
    const user = await BotUser.findOne({ telegramId: String(telegramId) });
    if (!user) {
      return res.status(404).json({ error: `User with Telegram ID ${telegramId} not found in database. Start the bot first to initialize profile.` });
    }

    let pCount = Number(creditsCount) || 10;
    let finalProductName = '';

    const isSubscription = productId === 'premium' || productId.startsWith('tier_');

    if (isSubscription) {
      user.isPremium = true;
      user.premiumTier = productId.startsWith('tier_') ? productId : 'tier_gold';
      const currentExpiry = user.premiumExpiresAt ? new Date(user.premiumExpiresAt).getTime() : Date.now();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      // Grant 30 days subscription
      user.premiumExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

      // Determine clean product name and award tier-specific bonuses
      let tierName = 'Bot Paid Subscription (Monthly)';
      try {
        const tiersSetting = await Setting.findOne({ key: 'subscriptionTiers' });
        if (tiersSetting && Array.isArray(tiersSetting.value)) {
          const matched = tiersSetting.value.find((t: any) => t.id === productId);
          if (matched) {
            tierName = `${matched.name} Subscription`;
            
            // Grant tier command one-time credit bonuses
            if (Array.isArray(matched.commands)) {
              if (!user.commonCredits) {
                user.commonCredits = new Map();
              }
              for (const cmdConfig of matched.commands) {
                const bonusCredits = Number(cmdConfig.bonusCommonCredits || 0);
                if (cmdConfig.command && bonusCredits > 0) {
                  const currentCommon = user.commonCredits.get(cmdConfig.command) || 0;
                  user.commonCredits.set(cmdConfig.command, currentCommon + bonusCredits);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Error looking up tier name & setting tier command bonus credits:", e);
      }
      finalProductName = tierName;
    } else {
      // Command credits pack
      if (!user.commonCredits) {
        user.commonCredits = new Map();
      }
      const currentCommon = user.commonCredits.get(productId) || 0;
      user.commonCredits.set(productId, currentCommon + pCount);
      finalProductName = `${pCount} Credits for ${productId}`;
    }

    if (activeCoupon) {
      activeCoupon.usedCount = (activeCoupon.usedCount || 0) + 1;
      await activeCoupon.save();
      finalProductName = `${finalProductName} (Coupon: ${activeCoupon.code} -${activeCoupon.discountPercent}%)`;
    }

    // Save purchase to history
    user.purchaseHistory.push({
      productId,
      productName: finalProductName,
      price: Number(amount),
      transactionId: finalTxnId,
      utr: finalUtr,
      date: new Date(),
      status: 'Success'
    });

    await user.save();

    // Commission Awarding if loaded via a cloned bot
    if (botRef) {
      try {
        await creditMirrorBotCommission(botRef, Number(amount), finalProductName || productId);
      } catch (commissionErr: any) {
        console.error("[Commission Awarding Error]", commissionErr.message);
      }
    }

    // 5. Send message from Bot to notify user (optional but extremely high-end UI/UX experience)
    try {
      let botInstance = getBot();
      if (botRef) {
        const mirroredBot = await getMirroredBotInstanceByUsername(botRef);
        if (mirroredBot) {
          botInstance = mirroredBot;
          console.log(`[Shop Verify Payment] Using mirrored bot instance for sending success notification to user ${telegramId} of bot @${botRef}`);
        }
      }
      if (botInstance) {
        const displayProductName = finalProductName || (productId === 'premium' ? '👑 Premium Subscription (Monthly)' : `💎 ${pCount} Common Credits for ${productId}`);
        
        let subPerksInfo = "";
        if (isSubscription) {
          const expiryDate = user.premiumExpiresAt ? new Date(user.premiumExpiresAt) : null;
          const expiryStr = expiryDate 
            ? expiryDate.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : "Unlimited";
          subPerksInfo = `\n⏳ *Premium Expiry:* ${expiryStr}\n🚀 *Benefits:* Daily query quota limit bypassed + Special member privileges!`;
        } else {
          const currentBal = user.commonCredits ? user.commonCredits.get(productId) || 0 : 0;
          subPerksInfo = `\n🔋 *New Balance for ${productId}:* ${currentBal} Credits`;
        }

        const notifyMsg = 
          `🎉 *Payment Verified successfully!* 🎉\n\n` +
          `Thank you! Your purchase has been activated:\n\n` +
          `📦 *Item:* ${displayProductName}\n` +
          `💰 *Price:* ₹${amount}\n` +
          `🆔 *Txn ID:* \`${finalTxnId}\`\n` +
          `💳 *UTR:* \`${finalUtr}\`${subPerksInfo}\n\n` +
          `✨ *You are ready to rock!* Enjoy your enhanced features.`;

        await botInstance.telegram.sendMessage(
          String(telegramId),
          notifyMsg,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (botErr) {
      console.warn("Failed to send purchase notification DM", botErr);
    }

    res.json({ success: true, message: 'Payment verified and credited!' });
  } catch (err: any) {
    console.error("[Verify Payment Route Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// --- MASTER ADMIN MIRROR BOTS ENDPOINTS ---

apiRouter.get('/api/admin/mirror-bots', async (req, res) => {
  try {
    const bots = await MirrorBot.find({}).sort({ createdAt: -1 });
    const botsWithStats = await Promise.all(bots.map(async (bot) => {
      let totalUsers = 0;
      let totalGroups = 0;
      if (bot.botUsername) {
        totalUsers = await BotUser.countDocuments({ interactedBots: bot.botUsername });
        totalGroups = await BotGroup.countDocuments({ interactedBots: bot.botUsername });
      }
      return {
        ...bot.toObject(),
        stats: { totalUsers, totalGroups }
      };
    }));

    // Load tiers config
    let configDoc = await Setting.findOne({ key: 'mirrorTiersConfig' });
    if (!configDoc) {
      // Create default config if missing
      const defaultTiers = [
        { id: 'free', name: 'Free (Standard)', price: 0, maxChannels: 1, broadcastLimit: 1, desc: 'Lifetime basic bot clone' },
        { id: 'silver', name: 'Silver Monthly', price: 999, maxChannels: 3, broadcastLimit: 5, desc: 'Standard clone user with default edits' },
        { id: 'gold', name: 'Gold Pro', price: 1999, maxChannels: 5, broadcastLimit: 20, desc: 'High limits with double command override rights' },
        { id: 'max', name: 'Max Whitelabel', price: 3999, maxChannels: 99, broadcastLimit: 9999, desc: 'Total custom white-labeling with custom commands and no limits' }
      ];
      configDoc = await Setting.create({ key: 'mirrorTiersConfig', value: defaultTiers });
    }

    res.json({
      success: true,
      bots: botsWithStats,
      tierConfig: configDoc.value
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/admin/mirror-bots/update', async (req, res) => {
  try {
    const { token, plan, isActive, expiresAt, customBotName, defaultGroupCredits, ownerTelegramId } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token parameter' });

    const botDoc = await MirrorBot.findOne({ token });
    if (!botDoc) return res.status(404).json({ error: 'Mirror Bot entry not found' });

    if (plan !== undefined) botDoc.plan = plan;
    if (isActive !== undefined) botDoc.isActive = !!isActive;
    if (expiresAt !== undefined) {
      botDoc.expiresAt = expiresAt ? new Date(expiresAt) : undefined;
    }
    if (customBotName !== undefined) botDoc.customBotName = customBotName;
    if (defaultGroupCredits !== undefined) botDoc.defaultGroupCredits = Number(defaultGroupCredits);
    if (ownerTelegramId !== undefined) botDoc.ownerTelegramId = ownerTelegramId;

    await botDoc.save();

    // Restart the bot poller to pick up new configurations and limits
    stopMirrorBot(token);
    if (botDoc.isActive) {
      await startMirrorBot(botDoc).catch((e: any) => console.error("Error launching mirror bot poller upon admin edit:", e));
    }

    res.json({ success: true, bot: botDoc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/admin/mirror-bots/delete', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const botDoc = await MirrorBot.findOne({ token });
    if (botDoc) {
      stopMirrorBot(token);
      await MirrorBot.deleteOne({ token });
    }

    res.json({ success: true, message: 'Mirrored bot was deleted and poller stopped completely.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/admin/mirror-bots/tier-config', async (req, res) => {
  try {
    const { tierConfig } = req.body;
    if (!tierConfig || !Array.isArray(tierConfig)) {
      return res.status(400).json({ error: 'Invalid or missing tierConfig array' });
    }

    await Setting.findOneAndUpdate(
      { key: 'mirrorTiersConfig' },
      { value: tierConfig },
      { upsert: true }
    );

    res.json({ success: true, message: 'Mirror Subscription Tiers updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clean Command logs
apiRouter.post('/api/admin/clean-command-logs', async (req, res) => {
  try {
    const result = await Statlog.deleteMany({});
    res.json({
      success: true,
      message: `Successfully cleaned command usage logs! Permanently deleted ${result.deletedCount ?? 0} usage entry records.`
    });
  } catch (err: any) {
    console.error("[Clean Command Log API Error]", err);
    res.status(500).json({ error: err.message });
  }
});


// --- OWNER EARNINGS & WALLET SYSTEMS ---

// Fetch wallet earnings & history for a mirror bot owner
apiRouter.get('/api/mirror-bots/wallet', async (req, res) => {
  try {
    const { ownerTelegramId } = req.query;
    if (!ownerTelegramId) return res.status(400).json({ error: 'Missing ownerTelegramId parameter' });

    let wallet = await MirrorWallet.findOne({ ownerTelegramId: String(ownerTelegramId) });
    if (!wallet) {
      wallet = await MirrorWallet.create({ ownerTelegramId: String(ownerTelegramId), balance: 0, totalEarned: 0, totalWithdrawn: 0 });
    }

    res.json({ success: true, wallet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a withdrawal request
apiRouter.post('/api/mirror-bots/withdraw', async (req, res) => {
  try {
    const { ownerTelegramId, ownerUsername, amount, upiId } = req.body;
    if (!ownerTelegramId || !amount || !upiId) {
      return res.status(400).json({ error: 'Missing ownerTelegramId, amount, or upiId.' });
    }

    const withdrawAmount = Number(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < 100) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is ₹100.' });
    }

    let wallet = await MirrorWallet.findOne({ ownerTelegramId: String(ownerTelegramId) });
    if (!wallet || wallet.balance < withdrawAmount) {
      return res.status(400).json({ error: 'Insufficient wallet balance for this withdrawal.' });
    }

    // Deduct balance
    wallet.balance = Math.round((wallet.balance - withdrawAmount) * 100) / 100;
    wallet.totalWithdrawn = Math.round(((wallet.totalWithdrawn || 0) + withdrawAmount) * 100) / 100;

    // Create history item
    const historyItem = {
      type: 'withdrawal_request',
      amount: -withdrawAmount,
      description: `Withdrawal request submitted (UPI: ${upiId})`,
      status: 'Pending',
      date: new Date()
    };
    wallet.history.push(historyItem);
    await wallet.save();

    // Get reference subdoc id
    const savedItem = wallet.history[wallet.history.length - 1];

    // Create in global withdrawal register
    const request = await MirrorWithdrawalRequest.create({
      ownerTelegramId: String(ownerTelegramId),
      ownerUsername: ownerUsername || '',
      amount: withdrawAmount,
      upiId: String(upiId),
      status: 'Pending',
      historyId: savedItem._id
    });

    res.json({ success: true, message: 'Withdrawal request submitted successfully!', wallet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin list all withdrawal requests
apiRouter.get('/api/mirror-bots/withdrawal-requests', async (req, res) => {
  try {
    const requests = await MirrorWithdrawalRequest.find().sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin approve/reject withdrawal requests
apiRouter.post('/api/mirror-bots/withdrawal-requests/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, screenshotUrl, rejectionReason } = req.body;
    if (!['Paid', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status parameter values.' });
    }

    const request = await MirrorWithdrawalRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Withdrawal request not found in database.' });

    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'This withdrawal request has already been finalized.' });
    }

    request.status = status;
    if (status === 'Paid') {
      request.screenshotUrl = screenshotUrl || '';
    } else {
      request.rejectionReason = rejectionReason || 'Rejected by main bot administrator.';
    }
    await request.save();

    // Update historical item status on owner's wallet
    const wallet = await MirrorWallet.findOne({ ownerTelegramId: request.ownerTelegramId });
    if (wallet) {
      const histItem = wallet.history.id(request.historyId);
      if (histItem) {
        if (status === 'Paid') {
          histItem.status = 'Paid';
        } else {
          histItem.status = 'Rejected';
          // Refund balance to the user
          const refundAmount = Math.abs(histItem.amount);
          wallet.balance = Math.round((wallet.balance + refundAmount) * 100) / 100;
          wallet.totalWithdrawn = Math.round((wallet.totalWithdrawn - refundAmount) * 100) / 100;
          
          wallet.history.push({
            type: 'withdrawal_rejected',
            amount: refundAmount,
            description: `Refund: Withdrawal request of ₹${refundAmount} rejected. Reason: ${rejectionReason || 'UPI details issue'}`,
            status: 'N/A',
            date: new Date()
          });
        }
        await wallet.save();
      }
    }

    // Try sending notification to the user
    try {
      const mainBot = getBot();
      if (mainBot) {
        const notifyMsg = status === 'Paid'
          ? `✅ *Withdrawal Marked as Paid!* ✅\n\nYour withdrawal request for *₹${request.amount}* has been successfully processed and marked as **PAID** by the administrator!\n\nUPI Destination ID: \`${request.upiId}\``
          : `❌ *Withdrawal Request Rejected!* ❌\n\nYour withdrawal request for *₹${request.amount}* has been rejected and refunded back to your wallet balance.\n\n*Reason:* ${rejectionReason || 'Details mismatch'}`;
          
        await mainBot.telegram.sendMessage(request.ownerTelegramId, notifyMsg, { parse_mode: 'Markdown' });
      }
    } catch (msgErr: any) {
      console.warn("Failed sending DM to wallet owner upon action details update:", msgErr.message);
    }

    res.json({ success: true, message: `Withdrawal request was marked as ${status} successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MASS API RUNNER ENDPOINTS
// ==========================================

apiRouter.get('/api/mass-run/profile', async (req, res) => {
  try {
    const { telegramId } = req.query;
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram User ID is required.' });
    }

    const user = await BotUser.findOne({ telegramId: String(telegramId) });
    if (!user) {
      return res.json({ exists: false, error: 'User profile not found. Please click /start inside the bot first to initialize.' });
    }

    // Determine premium tier
    let isPremiumActive = user.isPremium;
    if (isPremiumActive && user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() < Date.now()) {
      isPremiumActive = false;
    }

    const rawTier = (user.premiumTier || "").toLowerCase();
    let computedTier: "TRIAL" | "BASIC" | "GOLD" | "MAX" | null = null;
    
    if (isPremiumActive) {
      if (rawTier.includes("trial")) {
        computedTier = "TRIAL";
      } else if (rawTier.includes("basic")) {
        computedTier = "BASIC";
      } else if (rawTier.includes("gold")) {
        computedTier = "GOLD";
      } else if (rawTier.includes("max") || rawTier.includes("premium")) {
        computedTier = "MAX";
      } else {
        // Fallback for valid premium status with unknown tier name
        computedTier = "GOLD";
      }
    }

    // Load available API commands definitions
    const apiCommands = await Command.find({ isApi: true });

    // Compute remaining command credits for each API command
    // Format: { [commandName]: remainingCount }
    const today = new Date().toISOString().split("T")[0];
    const limits: Record<string, number> = {};

    for (const cmdDef of apiCommands) {
      if (user.isAdmin) {
        limits[cmdDef.command] = 999999;
      } else if (cmdDef.isCreditBased) {
        let override = user.commandCredits?.find((c: any) => c.command === cmdDef.command);
        let usage = user.commandUsage?.find((u: any) => u.command === cmdDef.command);
        let usedToday = usage && usage.lastResetDate === today ? usage.used : 0;
        let limit = override ? override.dailyLimit : cmdDef.defaultDailyCredits;
        let isUnlimited = override ? override.isUnlimited : false;

        if (isUnlimited) {
          limits[cmdDef.command] = 999999;
        } else {
          const dailyRemaining = Math.max(0, limit - usedToday);
          const commonCredits = user.commonCredits ? (user.commonCredits.get(cmdDef.command) || 0) : 0;
          limits[cmdDef.command] = dailyRemaining + commonCredits;
        }
      } else {
        limits[cmdDef.command] = 999999;
      }
    }

    res.json({
      success: true,
      exists: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        isPremium: isPremiumActive,
        premiumTier: user.premiumTier,
        membershipType: computedTier,
        isAdmin: user.isAdmin
      },
      apiCommands,
      limits
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/api/mass-run/execute', async (req, res) => {
  try {
    const { telegramId, command, parameters } = req.body;
    if (!telegramId || !command || !Array.isArray(parameters)) {
      return res.status(400).json({ error: 'Missing process parameters (telegramId, command, parameters).' });
    }

    // 1. Check User
    const user = await BotUser.findOne({ telegramId: String(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found. Please click /start first to initialize.' });
    }

    // 2. Resolve Active Sub Tier
    let isPremiumActive = user.isPremium;
    if (isPremiumActive && user.premiumExpiresAt && new Date(user.premiumExpiresAt).getTime() < Date.now()) {
      isPremiumActive = false;
    }

    const rawTier = (user.premiumTier || "").toLowerCase();
    let computedTier: "TRIAL" | "BASIC" | "GOLD" | "MAX" | null = null;
    
    if (isPremiumActive) {
      if (rawTier.includes("trial")) {
        computedTier = "TRIAL";
      } else if (rawTier.includes("basic")) {
        computedTier = "BASIC";
      } else if (rawTier.includes("gold")) {
        computedTier = "GOLD";
      } else if (rawTier.includes("max") || rawTier.includes("premium")) {
        computedTier = "MAX";
      } else {
        computedTier = "GOLD";
      }
    }

    if (!computedTier) {
      return res.status(403).json({ error: 'Access Denied: You must purchase a subscription membership to enter and run commands in the Mass API runner.' });
    }

    // 3. Check parameters limit based on Membership tier
    // TRIAL: 0
    // BASIC: 10
    // GOLD: 25
    // MAX: 50
    let maxParams = 0;
    if (computedTier === "BASIC") maxParams = 10;
    else if (computedTier === "GOLD") maxParams = 25;
    else if (computedTier === "MAX") maxParams = 50;

    if (computedTier === "TRIAL" || maxParams === 0) {
      return res.status(403).json({ error: 'TRIAL MEMBERSHIP users are allowed a maximum of 0 parallel parameters. Please UPGRADE your membership plan inside the Bot Shop to run mass commands!' });
    }

    const paramCount = parameters.length;
    if (paramCount === 0) {
      return res.status(400).json({ error: 'Please enter at least one parameter to execute.' });
    }

    if (paramCount > maxParams) {
      return res.status(400).json({ error: `${computedTier} members are limited to a maximum of ${maxParams} parameters at a time. You entered ${paramCount} parameters. Please upgrade your status or reduce the parameter list.` });
    }

    // 4. Check Credits Availability
    const cmdDef = await Command.findOne({ command });
    if (!cmdDef) {
      return res.status(404).json({ error: `Command ${command} not found.` });
    }

    // Calculate how many runs are available
    let availableRuns = 999999;
    const today = new Date().toISOString().split("T")[0];

    if (cmdDef.isCreditBased && !user.isAdmin) {
      let override = user.commandCredits?.find((c: any) => c.command === command);
      let usage = user.commandUsage?.find((u: any) => u.command === command);
      let usedToday = usage && usage.lastResetDate === today ? usage.used : 0;
      let limit = override ? override.dailyLimit : cmdDef.defaultDailyCredits;
      let isUnlimited = override ? override.isUnlimited : false;

      if (!isUnlimited) {
        const dailyRemaining = Math.max(0, limit - usedToday);
        const commonCredits = user.commonCredits ? (user.commonCredits.get(command) || 0) : 0;
        availableRuns = dailyRemaining + commonCredits;
      }
    }

    if (availableRuns < paramCount) {
      return res.status(400).json({ 
        error: `Insufficient Credits! You only have ${availableRuns} remaining runs/credits for ${command}, but you entered ${paramCount} lines. Please purchase more credits first!` 
      });
    }

    // 5. Run parameters sequentially
    const results = [];
    const bot = getBot();

    for (const p of parameters) {
      const cleanParam = String(p).trim();
      if (!cleanParam) continue;

      let apiResponseText = "";
      let finalUrl = cmdDef.apiUrl;

      if (finalUrl) {
        if (finalUrl.includes("{param}")) {
          finalUrl = finalUrl.replace("{param}", encodeURIComponent(cleanParam));
        }
        
        try {
          const resAxios = await axios.get(finalUrl, { timeout: 15000 });
          if (typeof resAxios.data === "object") {
            apiResponseText = JSON.stringify(resAxios.data, null, 2);
          } else {
            apiResponseText = String(resAxios.data);
          }
        } catch (e: any) {
          apiResponseText = `Error fetching data: ${e.response?.status ? `Status ${e.response.status}` : e.message}`;
        }
      } else {
        apiResponseText = "No API configuration found for this command.";
      }

      // Format with decoratedMessage
      let decorated = cmdDef.decoratedMessage || "{{api.response}}";
      decorated = decorated.replace(/\\n/g, "\n");
      decorated = decorated.replace(/\{\{api\.response\}\}/g, apiResponseText);

      // Save record in Statlog history
      await Statlog.create({
        commandName: command,
        telegramId: String(telegramId),
        isGroup: false,
        paramValue: cleanParam,
        apiResponse: decorated,
        timestamp: new Date()
      });

      // Deduct credits if applicable
      if (cmdDef.isCreditBased && !user.isAdmin) {
        let override = user.commandCredits?.find((c: any) => c.command === command);
        let usage = user.commandUsage?.find((u: any) => u.command === command);
        let usedToday = usage && usage.lastResetDate === today ? usage.used : 0;
        let limit = override ? override.dailyLimit : cmdDef.defaultDailyCredits;
        let isUnlimited = override ? override.isUnlimited : false;

        if (!isUnlimited) {
          if (usedToday < limit) {
            // Deduct from daily limit
            let usageIndex = user.commandUsage?.findIndex((u: any) => u.command === command);
            if (usageIndex !== undefined && usageIndex >= 0) {
              if (user.commandUsage[usageIndex].lastResetDate !== today) {
                user.commandUsage[usageIndex].used = 1;
                user.commandUsage[usageIndex].lastResetDate = today;
              } else {
                user.commandUsage[usageIndex].used += 1;
              }
            } else {
              if (!user.commandUsage) user.commandUsage = [];
              user.commandUsage.push({
                command: command,
                used: 1,
                lastResetDate: today
              });
            }
            user.markModified("commandUsage");
          } else {
            // Deduct from common credits
            const currentCommon = user.commonCredits ? (user.commonCredits.get(command) || 0) : 0;
            if (currentCommon > 0) {
              user.commonCredits.set(command, currentCommon - 1);
              user.markModified("commonCredits");
              
              // Try to notify the user on Telegram
              try {
                if (bot) {
                  await bot.telegram.sendMessage(
                    String(telegramId),
                    `⚠️ *Common Credit Used via WebApp*\n\nYou have used 1 out of total available common credits for "${command}" via Mass API WebApp, now you have left "${currentCommon - 1}" Credits.`,
                    { parse_mode: 'Markdown' }
                  );
                }
              } catch (notifyErr) {
                console.error("Failed sending DM to user for common credit deduction:", notifyErr);
              }
            }
          }
          await user.save();
        }
      }

      results.push({
        parameter: cleanParam,
        output: decorated,
        success: !apiResponseText.startsWith("Error fetching data:")
      });
    }

    res.json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/api/mass-run/history', async (req, res) => {
  try {
    const { telegramId } = req.query;
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram User ID is required.' });
    }

    const historyLogs = await Statlog.find({ telegramId: String(telegramId) })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json({ success: true, history: historyLogs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

