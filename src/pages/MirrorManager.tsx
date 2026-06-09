import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Bot, Key, Shield, Radio, Plus, Trash2, Edit3, 
  CheckCircle2, Ban, Users, Settings, Award, 
  AlertTriangle, Zap, ExternalLink, RefreshCw, XCircle, ListFilter,
  Wallet, Clock, Landmark, Coins, Flame, ChevronRight, Activity, Search, Info, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlanCountdown, PointsHelpModal, InfoBanner } from './MirrorManagerComponents';
import { MirrorManagerOnboarding } from './MirrorManagerOnboarding';

export function MirrorManager() {
  // Query param auto-fill
  const getQueryUserId = () => {
    return new URLSearchParams(window.location.search).get('userid') || '';
  };

  const getAutoTelegramId = () => {
    const queryId = getQueryUserId();
    if (queryId) return queryId;
    const tgUserId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgUserId) return String(tgUserId);
    return localStorage.getItem('mirror_owner_id') || '';
  };

  const getTabFromUrl = () => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam && ['overview', 'settings', 'commands', 'users_groups', 'shop', 'broadcast', 'wallet'].includes(tabParam)) {
      return tabParam as any;
    }
    return 'overview';
  };

  // State Management
  const [ownerTelegramId, setOwnerTelegramId] = useState(getAutoTelegramId());
  const [token, setToken] = useState(localStorage.getItem('mirror_bot_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [botDetail, setBotDetail] = useState<any>(null);
  const [botStats, setBotStats] = useState<any>({ totalUsers: 0, totalGroups: 0 });
  const [ownedBots, setOwnedBots] = useState<any[]>([]);

  const [activeTab, setActiveTabInternal] = useState<'overview' | 'settings' | 'commands' | 'users_groups' | 'shop' | 'broadcast' | 'wallet'>(getTabFromUrl());

  const setActiveTab = (tab: 'overview' | 'settings' | 'commands' | 'users_groups' | 'shop' | 'broadcast' | 'wallet') => {
    setActiveTabInternal(tab);
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('tab', tab);
    const newurl = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.pushState({ path: newurl }, '', newurl);
  };

  // Listen to popstate changes (browser back/forward navigation support)
  useEffect(() => {
    const handlePopState = () => {
      setActiveTabInternal(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadBroadcastHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await axios.get('/api/broadcast');
      if (Array.isArray(res.data)) {
        setBroadcastHistory(res.data);
      }
    } catch (err) {
      console.error("Error loading broadcast history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCancelBroadcast = async (broadcastId: string) => {
    if (!window.confirm("Are you sure you want to cancel this ongoing broadcast? This will send a stop signal to all running queue workers.")) {
      return;
    }
    try {
      setLoading(true);
      const res = await axios.post('/api/broadcast/cancel', { id: broadcastId });
      if (res.data?.success) {
        setSuccessMsg("Broadcast cancellation signal sent successfully!");
        await loadBroadcastHistory();
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || "Failed to cancel broadcast.");
    } finally {
      setLoading(false);
    }
  };

  // Broadcast auto-refresh progress interval hook
  useEffect(() => {
    let interval: any;
    if (isAuthenticated && activeTab === 'broadcast') {
      loadBroadcastHistory();
      interval = setInterval(() => {
        loadBroadcastHistory();
      }, 3050); // Poll every ~3 seconds which update the progress live!
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, activeTab]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Wallet / Earning States
  const [wallet, setWallet] = useState<any>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTab]);

  // Loading & Messages
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Subelement states
  const [usersList, setUsersList] = useState<any[]>([]);
  const [groupsList, setGroupsList] = useState<any[]>([]);
  const [ugSearchQuery, setUgSearchQuery] = useState('');
  const [registeredTiers, setRegisteredTiers] = useState<any[]>([]);

  // User Credit Editor
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editCreditsCommand, setEditCreditsCommand] = useState('');
  const [editCreditsAmount, setEditCreditsAmount] = useState(0);

  // Global Command override editors
  const [botOverrideCmd, setBotOverrideCmd] = useState('');
  const [botOverrideVal, setBotOverrideVal] = useState(50);

  // Shop / Purchasing States
  const [showPointsHelpModal, setShowPointsHelpModal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<any | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');
  const [planSlideIndex, setPlanSlideIndex] = useState(0);
  const [sliderDirection, setSliderDirection] = useState(0); // -1 for left, 1 for right

  // Page inputs
  const [tempTokenInput, setTempTokenInput] = useState('');
  const [tempUserIdInput, setTempUserIdInput] = useState(getAutoTelegramId());

  // Mount effect to load and double verify auto logon context
  useEffect(() => {
    const autoId = getAutoTelegramId();
    if (autoId) {
      setOwnerTelegramId(autoId);
      setTempUserIdInput(autoId);
      localStorage.setItem('mirror_owner_id', autoId);
    }
  }, []);

  // Sub-tab operational states
  const [customBotName, setCustomBotName] = useState('');
  const [defaultGroupCredits, setDefaultGroupCredits] = useState(50);
  const [forceChanName, setForceChanName] = useState('');
  const [forceChanLink, setForceChanLink] = useState('');

  // Custom commands state (Silver+)
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdDesc, setNewCmdDesc] = useState('');
  const [newCmdApi, setNewCmdApi] = useState('');
  const [newCmdCredit, setNewCmdCredit] = useState(false);
  const [newCmdCost, setNewCmdCost] = useState(0);
  const [newCmdDecorator, setNewCmdDecorator] = useState('{{api.response}}');
  const [newCmdAutoDeleteSeconds, setNewCmdAutoDeleteSeconds] = useState(0);
  const [defaultCommands, setDefaultCommands] = useState<any[]>([]);

  // Ban list form
  const [banId, setBanId] = useState('');
  const [banType, setBanType] = useState<'user' | 'group'>('user');

  // Broadcast campaign
  const [bcMessage, setBcMessage] = useState('');
  const [bcTarget, setBcTarget] = useState<'all' | 'users' | 'groups'>('all');

  // Core system configuration defaults fetched
  useEffect(() => {
    fetchGlobalDefaultCommands();
  }, []);

  const fetchGlobalDefaultCommands = async () => {
    try {
      const res = await axios.get('/api/commands').catch(() => null);
      if (res && Array.isArray(res.data)) {
        setDefaultCommands(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [fixLoading, setFixLoading] = useState(false);

  const handleFixStuck = async () => {
    if (!token) {
      alert('Missing token. Please authorize first.');
      return;
    }
    try {
      setFixLoading(true);
      setErrorMsg('');
      const res = await axios.post('/api/mirror-bots/fix-stuck', { token });
      alert(res.data.message || 'Successfully reset bot connection and flushed webhook!');
      await loadBotProfile(token);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed resetting bot hook.');
    } finally {
      setFixLoading(false);
    }
  };

  // If token is already present, fetch the bot details instantly
  useEffect(() => {
    if (token) {
      loadBotProfile(token);
    }
  }, [token]);

  const loadBotProfile = async (botToken: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await axios.get(`/api/mirror-bots/detail?token=${encodeURIComponent(botToken)}`);
      if (res.data?.success) {
        setBotDetail(res.data.bot);
        setBotStats(res.data.stats);
        setRegisteredTiers(res.data.tierConfig || []);
        setCustomBotName(res.data.bot.customBotName || '');
        setDefaultGroupCredits(res.data.bot.defaultGroupCredits || 50);
        setIsAuthenticated(true);
        localStorage.setItem('mirror_bot_token', botToken);
        if (res.data.bot.ownerTelegramId) {
          localStorage.setItem('mirror_owner_id', res.data.bot.ownerTelegramId);
          setOwnerTelegramId(res.data.bot.ownerTelegramId);
          fetchOwnedBots(res.data.bot.ownerTelegramId);
          fetchUsersAndGroups(botToken, ugSearchQuery);
        }
      } else {
        setErrorMsg('Could not fetch mirrored bot details.');
        setIsAuthenticated(false);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Validation failed. Bot might not exist yet.');
      setIsAuthenticated(false);
    }
    setLoading(false);
  };

  // Fetch interacting users and groups
  const fetchUsersAndGroups = async (botToken: string, searchVal: string) => {
    if (!botToken) return;
    try {
      const res = await axios.get(`/api/mirror-bots/users-groups?token=${encodeURIComponent(botToken)}&search=${encodeURIComponent(searchVal)}`);
      if (res.data?.success) {
        setUsersList(res.data.users || []);
        setGroupsList(res.data.groups || []);
      }
    } catch (err) {
      console.error("Error loading users and groups of mirror bot", err);
    }
  };

  // Fetch owner's wallet details & history
  const fetchWallet = async (ownerId: string) => {
    if (!ownerId) return;
    setWalletLoading(true);
    try {
      const res = await axios.get(`/api/mirror-bots/wallet?ownerTelegramId=${ownerId}`);
      if (res.data?.success) {
        setWallet(res.data.wallet);
      }
    } catch (err) {
      console.error("Error loading wallet details", err);
    } finally {
      setWalletLoading(false);
    }
  };

  // Submit withdrawal request
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiId.trim() || !withdrawAmount.trim()) {
      setWithdrawError("Please provide both a valid UPI ID and a withdrawal amount.");
      return;
    }

    const amt = Number(withdrawAmount);
    if (isNaN(amt) || amt < 100) {
      setWithdrawError("Minimum withdrawal amount is ₹100.");
      return;
    }

    if (!wallet || wallet.balance < amt) {
      setWithdrawError("Insufficient wallet balance.");
      return;
    }

    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      const res = await axios.post('/api/mirror-bots/withdraw', {
        ownerTelegramId: botDetail?.ownerTelegramId,
        ownerUsername: botDetail?.botUsername || '',
        amount: amt,
        upiId: upiId.trim()
      });

      if (res.data?.success) {
        setWithdrawSuccess(`Withdrawal request for ₹${amt} submitted successfully! Wait for administrator payment approval.`);
        setWithdrawAmount('');
        setWallet(res.data.wallet);
      }
    } catch (err: any) {
      setWithdrawError(err.response?.data?.error || "Failed submitting withdrawal request. Try again.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  // Sync users/groups whenever searching or active tabulated view changes
  useEffect(() => {
    if (isAuthenticated && token && activeTab === 'users_groups') {
      fetchUsersAndGroups(token, ugSearchQuery);
    }
  }, [activeTab, ugSearchQuery, isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated && botDetail?.ownerTelegramId && activeTab === 'wallet') {
      fetchWallet(botDetail.ownerTelegramId);
    }
  }, [activeTab, isAuthenticated, botDetail]);

  // Handle saving specific user command credits
  const handleSaveUserCredits = async () => {
    if (!token || !editingUser || !editCreditsCommand) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/update-user-credits', {
        token,
        userTelegramId: editingUser.telegramId,
        command: editCreditsCommand,
        commonCreditsAmount: editCreditsAmount
      });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'User credits edited successfully!');
        setEditingUser(null);
        fetchUsersAndGroups(token, ugSearchQuery);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed editing user credits.');
    } finally {
      setLoading(false);
    }
  };

  // Handle saving global override
  const handleSaveGlobalOverride = async (cmd: string, val?: number, deleteMs?: number) => {
    if (!token || !cmd) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/update-overrides', {
        token,
        command: cmd,
        dailyLimit: val,
        autoDeleteMs: deleteMs
      });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Global override limits updated successfully!');
        setBotDetail(res.data.bot);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed updating command credentials override.');
    } finally {
      setLoading(false);
    }
  };

  // Handle purchasing and verifying subscription tier upgrade
  const handleVerifySubPayment = async (planId: string, itemPrice: number) => {
    if (!token || !ownerTelegramId || !planId) return;
    if (!utrInput.trim()) {
      setPayError('Please enter your transaction reference key / UTR / Fampay transaction ID first.');
      return;
    }
    setPaymentProcessing(true);
    setPayError('');
    setPaySuccess('');
    try {
      const res = await axios.post('/api/mirror-bots/verify-payment', {
        token,
        ownerTelegramId,
        plan: planId,
        amount: itemPrice,
        paymentId: utrInput.trim()
      });
      if (res.data?.success) {
        setPaySuccess(`Congratulations! Your payment has been checked out successfully. Your bot has been upgraded to ${planId.toUpperCase()}!`);
        setUtrInput('');
        setCheckoutPlan(null);
        await loadBotProfile(token); // refresh details
      }
    } catch (err: any) {
      setPayError(err.response?.data?.error || 'Verification failed. Double check your UTR or paid money.');
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Find all bots registered under the current telegram ID
  const fetchOwnedBots = async (tgId: string) => {
    if (!tgId) return;
    try {
      const res = await axios.get(`/api/mirror-bots?ownerTelegramId=${tgId}`);
      if (Array.isArray(res.data)) {
        setOwnedBots(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (tempUserIdInput.trim()) {
      fetchOwnedBots(tempUserIdInput.trim());
    } else {
      setOwnedBots([]);
    }
  }, [tempUserIdInput]);

  // Standard token onboarding registration / claim
  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!tempTokenInput.trim() || !tempUserIdInput.trim()) {
      setErrorMsg('Please supply both your Telegraf Bot Token and Telegram Account ID.');
      return;
    }

    setLoading(true);
    try {
      const tok = tempTokenInput.trim();
      const tgId = tempUserIdInput.trim();

      const chk = await axios.post('/api/mirror-bots/check-token', { token: tok });
      if (chk.data?.success) {
        const reg = await axios.post('/api/mirror-bots', {
          token: tok,
          ownerTelegramId: tgId,
          plan: 'free'
        });

        if (reg.data?.success) {
          localStorage.setItem('mirror_bot_token', tok);
          localStorage.setItem('mirror_owner_id', tgId);
          setToken(tok);
          setOwnerTelegramId(tgId);
          setSuccessMsg('Your mirrored bot has been initialized and started!');
        } else {
          setErrorMsg('Failed registering the bot configuration.');
        }
      } else {
        setErrorMsg('Invalid token. Please obtain a clean bot token from Telegram @BotFather.');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Error occurred joining mirror system.');
    }
    setLoading(false);
  };

  // Toggle dynamic active bot status state
  const handleToggleBotActive = async () => {
    if (!botDetail) return;
    setLoading(true);
    try {
      const nextState = !botDetail.isActive;
      const res = await axios.post('/api/mirror-bots/toggle-active', {
        token: botDetail.token,
        isActive: nextState
      });
      if (res.data?.success) {
        setBotDetail({ ...botDetail, isActive: nextState });
        setSuccessMsg(nextState ? "Mirrored Bot Status started and online!" : "Mirrored bot status stopped and offline.");
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Power toggle failed.');
    }
    setLoading(false);
  };

  const handleToggleBotActiveDirect = async (b: any) => {
    try {
      const nextState = !b.isActive;
      const res = await axios.post('/api/mirror-bots/toggle-active', {
        token: b.token,
        isActive: nextState
      });
      if (res.data?.success) {
        fetchOwnedBots(tempUserIdInput);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed toggle active.');
    }
  };

  const handleDeleteBotDirect = async (b: any) => {
    if (window.confirm(`Are you sure you want to completely delete @${b.botUsername}? This cannot be undone.`)) {
      try {
        const res = await axios.post('/api/mirror-bots/delete', {
          token: b.token,
          ownerTelegramId: b.ownerTelegramId
        });
        if (res.data?.success) {
          alert('Bot deleted successfully!');
          fetchOwnedBots(tempUserIdInput);
        }
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed deleting bot.');
      }
    }
  };

  // Save Name & Core Details
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botDetail) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/update', {
        token: botDetail.token,
        customBotName: customBotName.trim(),
        defaultGroupCredits: Number(defaultGroupCredits)
      });
      if (res.data?.success) {
        setSuccessMsg('Settings updated successfully!');
        setBotDetail(res.data.bot);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Save failed.');
    }
    setLoading(false);
  };

  // Save forced Channel
  const handleAddForceChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botDetail) return;
    if (!forceChanName.trim() || !forceChanLink.trim()) {
      setErrorMsg('Please fulfill both the channel username and invitation link.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const handle = forceChanName.trim().startsWith('@') ? forceChanName.trim() : '@' + forceChanName.trim();
      const updatedList = [...(botDetail.forceChannels || []), { username: handle, link: forceChanLink.trim() }];

      const res = await axios.post('/api/mirror-bots/update', {
        token: botDetail.token,
        forceChannels: updatedList
      });

      if (res.data?.success) {
        setSuccessMsg('Forced subscription channels updated successfully!');
        setBotDetail(res.data.bot);
        setForceChanName('');
        setForceChanLink('');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Unable to store custom channel handles.');
    }
    setLoading(false);
  };

  // Remove forced subscription channel
  const handleRemoveForceChannel = async (channelUsername: string) => {
    if (!botDetail) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const updatedList = (botDetail.forceChannels || []).filter((ch: any) => ch.username !== channelUsername);
      const res = await axios.post('/api/mirror-bots/update', {
        token: botDetail.token,
        forceChannels: updatedList
      });

      if (res.data?.success) {
        setSuccessMsg('Channel constraint removed.');
        setBotDetail(res.data.bot);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Delete channel operation failed.');
    }
    setLoading(false);
  };

  // Silver+ Action: Exclude system default command
  const handleToggleCommandActive = async (commandName: string, isCurrentlyExcluded: boolean) => {
    if (!botDetail) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/toggle-command', {
        token: botDetail.token,
        command: commandName,
        isExcluded: !isCurrentlyExcluded
      });

      if (res.data?.success) {
        setSuccessMsg(isCurrentlyExcluded ? `Command ${commandName} re-activated on your bot.` : `Command ${commandName} deactivated on your bot.`);
        setBotDetail({
          ...botDetail,
          excludedCommands: res.data.excludedCommands
        });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed updating command exclusions.');
    }
    setLoading(false);
  };

  // Silver+ Action: Adding Custom API Command
  const handleCreateCustomCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botDetail) return;
    if (!newCmdName.trim() || !newCmdApi.trim()) {
      setErrorMsg('Please specify a command name (e.g. /mycmd) and API endpoint URL.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/custom-command', {
        token: botDetail.token,
        command: newCmdName.trim(),
        description: newCmdDesc.trim(),
        apiUrl: newCmdApi.trim(),
        isCreditBased: newCmdCredit,
        defaultDailyCredits: Number(newCmdCost),
        decoratedMessage: newCmdDecorator.trim(),
        autoDeleteSeconds: newCmdAutoDeleteSeconds > 0 ? Number(newCmdAutoDeleteSeconds) : null
      });

      if (res.data?.success) {
        setSuccessMsg('Dynamic custom API command saved successfully!');
        setBotDetail({
          ...botDetail,
          customCommands: res.data.customCommands
        });
        setNewCmdName('');
        setNewCmdDesc('');
        setNewCmdApi('');
        setNewCmdCredit(false);
        setNewCmdCost(0);
        setNewCmdDecorator('{{api.response}}');
        setNewCmdAutoDeleteSeconds(0);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed saving dynamic custom API command.');
    }
    setLoading(false);
  };

  // Silver+ Action: Delete Custom Command
  const handleDeleteCustomCommand = async (commandName: string) => {
    if (!botDetail) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.delete(`/api/mirror-bots/custom-command`, {
        data: {
          token: botDetail.token,
          command: commandName
        }
      });

      if (res.data?.success) {
        setSuccessMsg('Custom command deleted.');
        setBotDetail({
          ...botDetail,
          customCommands: res.data.customCommands
        });
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Could not delete custom command.');
    }
    setLoading(false);
  };

  // Perform broadcast
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botDetail) return;
    if (!bcMessage.trim()) {
      setErrorMsg('Please type some campaign text first.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/broadcast', {
        token: botDetail.token,
        message: bcMessage.trim(),
        target: bcTarget
      });

      if (res.data?.success) {
        setSuccessMsg(res.data.message);
        setBcMessage('');
        await loadBotProfile(botDetail.token);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Broadcast delivery failed.');
    }
    setLoading(false);
  };

  const handleExitBotSession = () => {
    localStorage.removeItem('mirror_bot_token');
    setToken('');
    setBotDetail(null);
    setIsAuthenticated(false);
  };

  // RENDERING ONBOARDING IF NOT AUTHENTICATED
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#070914] text-slate-150 font-sans p-6 md:p-12 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[130px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto space-y-8 relative">
          <header className="text-center md:text-left border-b border-slate-850 pb-5">
            <h1 className="text-2xl font-black text-white tracking-widest uppercase flex items-center justify-center md:justify-start gap-2.5">
              <Bot className="w-7 h-7 text-indigo-400" />
              <span>Clone Engine Terminal</span>
            </h1>
          </header>
          
          <MirrorManagerOnboarding
            tempTokenInput={tempTokenInput}
            setTempTokenInput={setTempTokenInput}
            tempUserIdInput={tempUserIdInput}
            loading={loading}
            errorMsg={errorMsg}
            successMsg={successMsg}
            ownedBots={ownedBots}
            onOnboardSubmit={handleOnboard}
            onManageBot={(b) => {
              localStorage.setItem('mirror_bot_token', b.token);
              localStorage.setItem('mirror_owner_id', b.ownerTelegramId);
              setToken(b.token);
              setOwnerTelegramId(b.ownerTelegramId);
            }}
            onToggleBotActive={handleToggleBotActiveDirect}
            onDeleteBot={handleDeleteBotDirect}
          />
        </div>
      </div>
    );
  }

  const activePlan = botDetail?.plan || 'free';

  // MAIN AUTHENTICATED EXPERIENCES (MULTIPLE WORKSPACES/PAGES STYLE)
  // Let's declare our available "pages" / workspaces list
  const subPages = [
    { id: 'overview', label: 'Monitor Workstation', icon: Activity, desc: 'Realtime bot heartbeat metrics' },
    { id: 'settings', label: 'Identity & Forced Subs', icon: Settings, desc: 'Naming, constraints & sub locks' },
    { id: 'commands', label: 'Commands Routing Matrix', icon: Zap, desc: 'Deductions, exclusion list & custom APIs' },
    { id: 'users_groups', label: 'Audits & User Limits', icon: Users, desc: 'Track relations, overrides & bans' },
    { id: 'broadcast', label: 'Dynamic Broadcaster', icon: Radio, desc: 'Promote alerts to subscriber directories' },
    { id: 'wallet', label: 'Earning Ledger', icon: Coins, desc: 'Withdraw commissions securely' },
    { id: 'shop', label: 'Privilege Level upgrades', icon: Award, desc: 'Elevate bot limit parameters' },
  ] as const;

  const activePageObj = subPages.find(p => p.id === activeTab) || subPages[0];

  return (
    <div ref={containerRef} className="min-h-screen bg-[#060813] text-slate-100 font-sans p-4 md:p-8 relative overflow-hidden pb-12">
      {/* Cinematic Blur Highlights */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none animate-pulse duration-5000" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-[40%] right-[20%] w-[35%] h-[35%] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      {/* Glass header navigation */}
      <div className="max-w-6xl mx-auto space-y-6 relative">
        <div className="bg-slate-900/35 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-505/20 text-indigo-400">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  {botDetail?.customBotName || botDetail?.botName || "Mirrored Clone Bot"}
                </h2>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full select-none uppercase tracking-widest border
                  ${activePlan === 'free' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : ''}
                  ${activePlan === 'silver' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : ''}
                  ${activePlan === 'gold' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : ''}
                  ${activePlan === 'max' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.25)]' : ''}
                `}>
                  💎 {activePlan} Tier
                </span>
              </div>
              <p className="text-[11px] text-indigo-300 font-mono mt-0.5">
                @{botDetail?.botUsername || "unregistered"} &bull; Token: 
                <span className="font-bold font-sans text-slate-350 ml-1.5 bg-slate-950/50 px-2 py-0.5 rounded border border-slate-850 text-[10px]">
                  {token.slice(0, 10)}...{token.slice(-6)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-auto flex-wrap">
            <button
              onClick={handleToggleBotActive}
              disabled={loading}
              className={`px-3 py-1.5 rounded-xl text-[10.5px] uppercase font-bold border transition duration-300 cursor-pointer flex items-center gap-2
                ${botDetail?.isActive 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${botDetail?.isActive ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
              {botDetail?.isActive ? "Polling Live" : "Suspended"}
            </button>

            <button
              onClick={handleExitBotSession}
              className="px-3 py-1.5 border border-slate-850 hover:border-slate-700 text-slate-300 bg-slate-950/20 rounded-xl text-[10.5px] uppercase font-bold hover:bg-slate-900 transition cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>

            <button
              onClick={async () => {
                if (window.confirm("Are you sure you want to completely delete this mirrored bot and stop its polling service? This cannot be undone.")) {
                  try {
                    setLoading(true);
                    const res = await axios.post('/api/mirror-bots/delete', {
                      token: botDetail.token,
                      ownerTelegramId: botDetail.ownerTelegramId
                    });
                    if (res.data?.success) {
                      alert('Bot deleted successfully!');
                      handleExitBotSession();
                    }
                  } catch (err: any) {
                    alert(err.response?.data?.error || 'Error deleting bot.');
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              disabled={loading}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 rounded-xl text-[10.5px] uppercase font-bold hover:text-rose-400 transition cursor-pointer border border-rose-500/20 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Decommission
            </button>
          </div>
        </div>

        {/* Global Alert System inside translucent cards */}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-rose-500/5 border border-rose-500/20 text-rose-350 rounded-xl text-xs flex items-center gap-3 relative shadow-xl"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <p className="font-semibold">{errorMsg}</p>
          </motion.div>
        )}

        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-emerald-500/5 border border-emerald-500/20 text-emerald-350 rounded-xl text-xs flex items-center gap-3 relative shadow-xl"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <p className="font-semibold">{successMsg}</p>
          </motion.div>
        )}

        {/* Multi-Page Glass Interface layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* NAVIGATION SIDEBAR: Glass floating console */}
          <div className="lg:col-span-3 bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl space-y-1.5 text-xs">
            <div className="px-2 mb-3">
              <span className="text-[9.5px] font-black uppercase text-slate-500 tracking-widest block">Workstation Terminals</span>
              <p className="text-[10px] text-indigo-400 font-bold mt-0.5">Control Panel Sub-Pages</p>
            </div>
            
            <div className="space-y-1">
              {subPages.map((page) => {
                const isSelected = activeTab === page.id;
                const Icon = page.icon;
                return (
                  <button
                    key={page.id}
                    onClick={() => setActiveTab(page.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-xl font-bold transition-all flex items-center gap-3 cursor-pointer relative group
                      ${isSelected 
                        ? 'bg-indigo-600/10 border border-indigo-500/30 text-white shadow-md' 
                        : 'text-slate-400 hover:text-white border border-transparent hover:bg-slate-950/20'}`}
                  >
                    {isSelected && (
                      <motion.div 
                        layoutId="activeSideBarGlow"
                        className="absolute left-1 w-1 h-5 bg-indigo-500 rounded-full"
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      />
                    )}
                    <Icon className={`w-4.5 h-4.5 shrink-0 transition-transform group-hover:scale-105 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <div className="truncate">
                      <p className="leading-none">{page.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACTIVE MULTI-PAGE VIEWPORT */}
          <div ref={canvasRef} className="lg:col-span-9 space-y-6">
            
            {/* Sub-page Breadcrumb Header */}
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="absolute top-[-30%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[90px] pointer-events-none" />
              <div>
                <span className="text-[9px] uppercase tracking-widest font-black text-indigo-400 block mb-0.5 font-mono">Workstation / {activePageObj.label}</span>
                <h3 className="text-base font-black text-white uppercase tracking-wider">{activePageObj.label}</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{activePageObj.desc}</p>
              </div>
              <div className="flex items-center gap-3.5 self-start sm:self-auto">
                <span className="text-[10px] font-mono text-slate-500">Connected</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6"
              >
                
                {/* SUB-PAGE 1: OVERVIEW METRIC HEALTH */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Glowing stats Highlights */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl relative overflow-hidden">
                        <div className="absolute -right-4 -bottom-4 opacity-5 text-white"><Users className="w-20 h-20" /></div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-400" /> Private Subscribers
                        </p>
                        <p className="text-3xl font-black text-white font-mono">{botStats.totalUsers || 0}</p>
                        <p className="text-[10.5px] text-slate-400 mt-1 font-semibold">Active direct channels</p>
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl relative overflow-hidden">
                        <div className="absolute -right-4 -bottom-4 opacity-5 text-white"><Shield className="w-20 h-20" /></div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" /> Group Integrations
                        </p>
                        <p className="text-3xl font-black text-white font-mono">{botStats.totalGroups || 0}</p>
                        <p className="text-[10.5px] text-slate-400 mt-1 font-semibold">Tracked server channels</p>
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Integration Points
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowPointsHelpModal(true)}
                              className="w-4 h-4 rounded-full bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] font-black transition flex items-center justify-center cursor-pointer select-none"
                            >
                              ?
                            </button>
                          </div>
                          {(() => {
                            const getPointsLimit = (p: string) => {
                              const pl = (p || 'free').toLowerCase();
                              if (pl === 'silver') return 50000;
                              if (pl === 'gold') return 200000;
                              if (pl === 'max') return 1500000;
                              return 10000;
                            };
                            const limit = getPointsLimit(activePlan);
                            const used = botDetail?.integrationPointsUsed || 0;
                            const percentage = limit > 0 ? (used / limit) * 100 : 0;
                            return (
                              <>
                                <div className="flex items-baseline gap-1 mt-1.5">
                                  <span className="text-2xl font-black text-white font-mono">
                                    {used.toLocaleString()}
                                  </span>
                                  <span className="text-xs text-slate-500 font-bold font-mono">
                                    / {limit.toLocaleString()}
                                  </span>
                                </div>

                                <div className="mt-3.5">
                                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-850">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        percentage >= 90 ? 'bg-rose-500' : percentage >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(percentage, 100)}%` }}
                                    ></div>
                                  </div>
                                  <div className="flex justify-between items-center mt-1.5 text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">
                                    <span>{percentage.toFixed(1)}% used</span>
                                    <span>{botDetail?.integrationPointsMonth || 'Active Month'}</span>
                                  </div>
                                </div>
                              </>
                              );
                            })()}
                          </div>
                        </div>

                      </div>

                    {/* Current Plan Parameters details */}
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
                      <h4 className="text-white text-xs font-black uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-1.5">
                        <Award className="w-4.5 h-4.5 text-indigo-400" /> Current Plan Blueprint
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-300">
                        <div className="p-4 bg-slate-950/40 rounded-xl space-y-1.5 border border-slate-850 select-none">
                          <p className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest font-mono">Plan Level</p>
                          <p className="font-black text-indigo-400 uppercase text-sm font-sans tracking-wide">{activePlan}</p>
                          {activePlan !== 'free' && botDetail?.expiresAt && (
                            <PlanCountdown expiresAt={botDetail.expiresAt} />
                          )}
                        </div>

                        <div className="p-4 bg-slate-950/40 rounded-xl space-y-1.5 border border-slate-850 font-sans">
                          <p className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest font-mono">Forced Sub Channels Allowed</p>
                          <p className="font-extrabold text-white text-sm">
                            {activePlan === 'free' ? 'Up to 1 Custom Channel' : ''}
                            {activePlan === 'silver' ? 'Up to 2 Custom Channels' : ''}
                            {activePlan === 'gold' ? 'Up to 5 Custom Channels' : ''}
                            {activePlan === 'max' ? 'Up to 10 Custom Channels (Bypass Enabled 🔓)' : ''}
                          </p>
                        </div>

                        <div className="p-4 bg-slate-950/40 rounded-xl space-y-1.5 border border-slate-850">
                          <p className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest font-mono">Broadcast Capacity limits</p>
                          <p className="font-extrabold text-white text-sm">
                            {activePlan === 'free' ? '1 Broadcast Dispatch / Day' : ''}
                            {activePlan === 'silver' ? '5 Broadcast Dispatches / Day' : ''}
                            {activePlan === 'gold' ? '20 Broadcast Dispatches / Day' : ''}
                            {activePlan === 'max' ? '⚡ Fully Unlimited Broadcasts' : ''}
                          </p>
                        </div>

                        <div className="p-4 bg-slate-950/40 rounded-xl space-y-1.5 border border-slate-850">
                          <p className="text-[9.5px] text-slate-500 uppercase font-black tracking-widest font-mono">Client-Side Credit Editor</p>
                          <p className="font-extrabold text-white text-sm">
                            {activePlan === 'free' ? '🔒 Locked (Default Credits Only)' : '✅ Unlocked (Full overrides allowed)'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Stuck diagnostics module */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 shadow-2xl space-y-3 relative">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-[40px] pointer-events-none" />
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 font-sans">
                        <div className="space-y-1.5 max-w-xl">
                          <h4 className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
                            Bot heartbeats diagnostics reset
                          </h4>
                          <p className="text-[11.5px] text-amber-200/90 leading-relaxed font-semibold">
                            If your bot clone becomes unresponsive due to telegram webhooks queues becoming clogged, you can trigger a system-level webhook flush.
                          </p>
                          <p className="text-[10.5px] text-slate-400 leading-normal font-medium">
                            This resets the connection hook, cleans out corrupted pending queues, and starts the poller instantly. Works cleanly on all plans.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={fixLoading}
                          onClick={handleFixStuck}
                          className="md:self-center px-4.5 py-2.5 bg-amber-500 hover:bg-amber-600 border border-amber-400/30 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition duration-300 shadow-lg cursor-pointer whitespace-nowrap self-start active:translate-y-0.5 disabled:opacity-50"
                        >
                          {fixLoading ? (
                            <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin inline-block"></span>
                          ) : (
                            <span className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Force Reboot</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-PAGE 2: IDENTITY BRAND & FORCE JOINS */}
                {activeTab === 'settings' && (
                  <div className="space-y-6">
                    
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
                      <h4 className="text-white text-xs font-black uppercase tracking-wider border-b border-slate-800 pb-3 mb-5 flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-indigo-400" /> Edit bot branding variables
                      </h4>

                      <form onSubmit={handleSaveDetails} className="space-y-4 text-xs font-sans">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                              Clone display name override
                            </label>
                            <input 
                              type="text" 
                              value={customBotName}
                              onChange={(e) => setCustomBotName(e.target.value)}
                              placeholder="e.g. Find OSINT Tool"
                              className="w-full bg-slate-950/40 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                              Starting Group Credits balance
                            </label>
                            <input 
                              type="number" 
                              value={defaultGroupCredits}
                              onChange={(e) => setDefaultGroupCredits(Number(e.target.value))}
                              className="w-full bg-slate-950/40 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono font-bold"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="bg-indigo-650 hover:bg-indigo-600 border border-indigo-505/30 transition-all text-white px-5 py-2.5 text-[10px] uppercase font-black tracking-widest rounded-xl hover:-translate-y-0.5"
                        >
                          Commit Identity Settings
                        </button>
                      </form>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-6">
                      <div>
                        <h4 className="text-white text-xs font-black uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-2">
                          <Shield className="w-4.5 h-4.5 text-indigo-400" /> Force Subscribe system
                        </h4>
                        <p className="text-[10.5px] text-slate-400 mt-1 select-none font-sans">
                          Require all bot query users to join custom telegram handles before unlocking features.
                        </p>
                      </div>

                      {/* Main lock handle */}
                      <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-4 flex items-center justify-between font-sans">
                        <div className="flex items-center gap-2.5">
                          <div className="bg-amber-500/10 p-1.5 rounded-lg text-amber-400">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-white">@encorexosint (Permanent System Lock)</p>
                            <p className="text-[10px] text-amber-200/90 font-mono mt-0.5">Required base channel validation requirement.</p>
                          </div>
                        </div>
                        <span className="text-[8px] font-mono font-black bg-amber-500/20 text-amber-305 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Locked
                        </span>
                      </div>

                      {/* User dynamic forced channels */}
                      {(botDetail?.forceChannels || []).length > 0 ? (
                        <div className="space-y-2 border-t border-slate-800/80 pt-4 font-sans">
                          <p className="text-[9.5px] font-black uppercase tracking-widest text-slate-500 mb-2">Dynamic sub channels</p>
                          {botDetail.forceChannels.map((ch: any) => (
                            <div key={ch.username} className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between">
                              <div>
                                <p className="text-xs font-black font-mono text-indigo-305">{ch.username}</p>
                                <a href={ch.link} target="_blank" rel="noreferrer" className="text-[10px] text-slate-400 hover:text-white hover:underline mt-0.5 inline-flex items-center gap-1.5">
                                  {ch.link} <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <button
                                onClick={() => handleRemoveForceChannel(ch.username)}
                                disabled={loading}
                                className="px-3 py-1.5 text-rose-450 border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg text-[9px] uppercase font-black transition cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic font-sans">No additional child channels configured in settings.</p>
                      )}

                      {/* Add channels logic */}
                      <div className="border-t border-slate-850 pt-4 font-sans">
                        {(() => {
                          const getClientMaxForceChannels = (p: string) => {
                            if (p === 'silver') return 2;
                            if (p === 'gold') return 5;
                            if (p === 'max') return 10;
                            return 1;
                          };
                          const currentForceChannelsCount = (botDetail?.forceChannels || []).length;
                          const maxForceChannelsAllowed = getClientMaxForceChannels(activePlan);
                          const isLimitReached = currentForceChannelsCount >= maxForceChannelsAllowed;

                          if (isLimitReached) {
                            return (
                              <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-1 text-slate-350">
                                <h5 className="font-extrabold text-[10px] text-indigo-400 uppercase tracking-wider">Channel Capacity quota met</h5>
                                <p className="text-[10.5px]">Your currently active plan limit of {maxForceChannelsAllowed} sub channel(s) has been fully reached.</p>
                                {activePlan !== 'max' && (
                                  <button onClick={() => setActiveTab('shop')} className="text-indigo-405 hover:underline font-bold text-[10.5px] mt-1 block">
                                    👑 Upgrade plan tiers to configure more channels →
                                  </button>
                                )}
                              </div>
                            );
                          }

                          return (
                            <form onSubmit={handleAddForceChannel} className="space-y-4">
                              <h5 className="text-xs font-black text-white uppercase tracking-wider">Add custom forced join handle</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[9.5px] uppercase font-black tracking-widest text-slate-500 mb-1.5">Channel Username Handle</label>
                                  <input 
                                    type="text" 
                                    value={forceChanName}
                                    onChange={(e) => setForceChanName(e.target.value)}
                                    placeholder="e.g. @MyChannel"
                                    className="w-full bg-slate-950/40 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono placeholder-slate-700 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] uppercase font-black tracking-widest text-slate-500 mb-1.5">Invitation link</label>
                                  <input 
                                    type="text" 
                                    value={forceChanLink}
                                    onChange={(e) => setForceChanLink(e.target.value)}
                                    placeholder="e.g. https://t.me/MyChannel"
                                    className="w-full bg-slate-950/40 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder-slate-700 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <button
                                type="submit"
                                disabled={loading}
                                className="bg-indigo-650 hover:bg-indigo-600 transition-all font-black text-[10px] uppercase text-white px-4.5 py-2.5 rounded-xl border border-indigo-500/20"
                              >
                                Activate forced filter
                              </button>
                            </form>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-PAGE 3: COMMAND MATRIX CONFIGS */}
                {activeTab === 'commands' && (
                  <div className="space-y-6">
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
                      <div className="flex border-b border-slate-800 pb-3.5 mb-2 items-center justify-between">
                        <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                          <ListFilter className="w-4.5 h-4.5 text-indigo-400" /> Core commands Limits override
                        </h4>
                        <span className="text-[9px] font-mono text-slate-500 font-bold uppercase tracking-widest">Core Command list</span>
                      </div>

                      {activePlan === 'free' && (
                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 font-sans leading-relaxed">
                          <strong>Active locks on overrides:</strong> Elevating core commands, tweaking limits, or setting dynamic response timers requires SILVER privilege levels or higher.
                          <button onClick={() => setActiveTab('shop')} className="text-indigo-400 hover:underline block mt-1 font-bold">
                            👑 Learn how to upgrade limits
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                        {defaultCommands.map((cmd) => {
                          const isEx = !!(botDetail?.excludedCommands || []).includes(cmd.command);
                          const currentTier = registeredTiers.find(t => t.id === activePlan);
                          const isMax = activePlan === 'max';
                          const allowedEditConfig = currentTier?.editableCommands?.find((ec: any) => ec.command === cmd.command);
                          const isEditableInPlan = isMax || !!allowedEditConfig;

                          const currentOverrideObj = botDetail?.commandCreditsOverrides?.find((co: any) => co.command === cmd.command);
                          const currentOverride = currentOverrideObj?.dailyLimit;
                          const activeLimit = currentOverride !== undefined ? currentOverride : cmd.defaultDailyCredits;

                          const activeAutoDelete = currentOverrideObj?.autoDeleteMs !== undefined ? currentOverrideObj.autoDeleteMs : (cmd.autoDeleteMs || 0);
                          const activeAutoDeleteSeconds = activeAutoDelete < 1000 ? activeAutoDelete : Math.floor(activeAutoDelete / 1000);

                          return (
                            <div key={cmd.command} className="bg-slate-950/40 rounded-2xl border border-slate-850 p-4.5 flex flex-col justify-between gap-4 font-sans hover:border-slate-800 transition">
                              <div>
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className={`font-mono font-black text-sm tracking-wide ${isEx ? 'text-slate-600 line-through' : 'text-white'}`}>
                                      {cmd.command}
                                    </p>
                                    <div className="space-y-0.5 mt-1 text-[10.5px]">
                                      <p className="text-slate-500">Default Limit: <span className="font-mono">{cmd.defaultDailyCredits || 0}</span></p>
                                      <p className="text-indigo-400 font-bold">Current Active Quota: <span className="font-mono">{activeLimit}</span></p>
                                      <p className={activeAutoDeleteSeconds > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                                        ⏱️ Timer: {activeAutoDeleteSeconds > 0 ? `${activeAutoDeleteSeconds}s auto-delete` : 'disabled'}
                                      </p>
                                    </div>
                                  </div>
                                  {activePlan !== 'free' && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCommandActive(cmd.command, isEx)}
                                      disabled={loading}
                                      className={`px-3 py-1 text-[9.5px] uppercase font-black rounded-lg border transition duration-300 cursor-pointer
                                        ${isEx 
                                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/25' 
                                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'}`}
                                    >
                                      {isEx ? 'Excluded' : 'Exposed'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isEditableInPlan ? (
                                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850 text-xs">
                                  <span className="text-[8.5px] font-black uppercase tracking-wider text-indigo-400 block mb-2 font-mono">Limit overrides tuning console</span>
                                  <div className="flex flex-wrap items-end gap-3 justify-between">
                                    <div className="space-y-1">
                                      <label className="text-[8.5px] uppercase font-bold text-slate-500">Limit</label>
                                      <input 
                                        type="number"
                                        placeholder={activeLimit.toString()}
                                        id={`cmd-limit-${cmd.command}`}
                                        className="w-16 bg-slate-950 font-mono text-center border border-slate-850 rounded px-1.5 py-1 text-white focus:outline-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[8.5px] uppercase font-bold text-slate-500">Auto Delete (s)</label>
                                      <input 
                                        type="number"
                                        placeholder={activeAutoDeleteSeconds > 0 ? activeAutoDeleteSeconds.toString() : 'Off'}
                                        id={`cmd-timer-${cmd.command}`}
                                        className="w-16 bg-slate-950 font-mono text-center border border-slate-850 rounded px-1.5 py-1 text-white focus:outline-none"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const lim = (document.getElementById(`cmd-limit-${cmd.command}`) as HTMLInputElement)?.value;
                                        const tim = (document.getElementById(`cmd-timer-${cmd.command}`) as HTMLInputElement)?.value;
                                        const newLim = lim ? Number(lim) : undefined;
                                        const newTim = tim !== '' ? Number(tim) * 1000 : undefined;
                                        handleSaveGlobalOverride(cmd.command, newLim, newTim);
                                        if (lim) (document.getElementById(`cmd-limit-${cmd.command}`) as HTMLInputElement).value = '';
                                        if (tim) (document.getElementById(`cmd-timer-${cmd.command}`) as HTMLInputElement).value = '';
                                      }}
                                      className="bg-indigo-650 hover:bg-indigo-600 transition text-white text-[10.5px] px-3 py-1.5 font-bold rounded-lg cursor-pointer"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </div>
                              ) : activePlan !== 'max' && (
                                <p className="text-[9.5px] text-slate-500 italic mt-1 select-none font-medium">🔒 Upgrade plan parameters to edit overriding keys.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dynamic Custom Web API commands list */}
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-5 font-sans">
                      <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-5 h-5 text-indigo-400" /> Custom API command routing
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Inject dynamic GET endpoints routed autonomously through command events.</p>
                        </div>
                      </div>

                      {activePlan === 'free' ? (
                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                          <strong>Privileges Locked:</strong> Silver privilege tier or above is required to construct custom endpoints.
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Lists */}
                          {(botDetail?.customCommands || []).length > 0 && (
                            <div className="space-y-2 border-slate-850">
                              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Dynamic custom triggers</span>
                              {botDetail.customCommands.map((cc: any) => (
                                <div key={cc.command} className="p-4 bg-slate-950/40 rounded-xl border border-slate-850 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                                  <div>
                                    <p className="font-mono font-black text-indigo-405 text-sm">{cc.command}</p>
                                    <p className="text-slate-300 font-medium text-[11px] mt-0.5">{cc.description}</p>
                                    <p className="text-[10px] font-mono text-slate-500 mt-1 truncate max-w-md bg-slate-950 px-2 py-1 rounded">GET: {cc.apiUrl}</p>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteCustomCommand(cc.command)}
                                    className="px-3.5 py-1.5 bg-rose-500/10 text-rose-455 hover:bg-rose-500/20 rounded-lg text-[9.5px] uppercase font-black cursor-pointer border border-rose-500/20 inline-block self-end md:self-auto"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Form creation */}
                          <form onSubmit={handleCreateCustomCommand} className="space-y-4 p-4.5 border border-slate-850 bg-slate-950/20 rounded-2xl">
                            <h5 className="text-xs font-black text-white uppercase tracking-wider">Deploy dynamic command hook</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[9px] uppercase font-black text-slate-550 mb-1">Command Handle</label>
                                <input 
                                  type="text" 
                                  value={newCmdName}
                                  onChange={(e) => setNewCmdName(e.target.value)}
                                  placeholder="e.g. /mycmd"
                                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] uppercase font-black text-slate-550 mb-1">Description</label>
                                <input 
                                  type="text" 
                                  value={newCmdDesc}
                                  onChange={(e) => setNewCmdDesc(e.target.value)}
                                  placeholder="e.g. Dynamic Lookups"
                                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white"
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-[9px] uppercase font-black text-slate-550 mb-1">HTTP GET API Target endpoint</label>
                                <input 
                                  type="text" 
                                  value={newCmdApi}
                                  onChange={(e) => setNewCmdApi(e.target.value)}
                                  placeholder="https://api.myendpoint.com/query?v={{query}}"
                                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 font-mono text-white text-[10.5px]"
                                />
                                <p className="text-[9.5px] text-slate-500 mt-1 font-mono">Use {"{{query}}"} to inject user trigger string arguments.</p>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-[9px] uppercase font-black text-slate-550 mb-1">JSON layout output parser decorator</label>
                                <textarea
                                  value={newCmdDecorator}
                                  onChange={(e) => setNewCmdDecorator(e.target.value)}
                                  rows={2}
                                  placeholder="Reply output: \n{{api.response}}"
                                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 font-mono text-white text-[10.5px]"
                                />
                                <p className="text-[9.5px] text-slate-500 font-mono">Injects whole API JSON string where {"{{api.response}}"} is placed.</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  id="new-credit"
                                  checked={newCmdCredit}
                                  onChange={(e) => setNewCmdCredit(e.target.checked)}
                                  className="bg-slate-950 border border-slate-850 rounded"
                                />
                                <label htmlFor="new-credit" className="text-[10px] uppercase font-black text-slate-400 tracking-wide cursor-pointer">Charge user credits?</label>
                              </div>
                              {newCmdCredit && (
                                <div>
                                  <input 
                                    type="number" 
                                    value={newCmdCost}
                                    onChange={(e) => setNewCmdCost(Number(e.target.value))}
                                    placeholder="Cost limit"
                                    className="bg-slate-950 border border-slate-850 rounded-xl px-3 py-1 text-white font-mono text-xs"
                                  />
                                </div>
                              )}
                              <div>
                                <label className="block text-[9px] text-slate-500 uppercase tracking-widest font-black mb-1">Auto Delete (Seconds)</label>
                                <input 
                                  type="number" 
                                  value={newCmdAutoDeleteSeconds || ''}
                                  onChange={(e) => setNewCmdAutoDeleteSeconds(e.target.value ? Number(e.target.value) : 0)}
                                  placeholder="e.g. 15 (0 to disable)"
                                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-1.5"
                                />
                              </div>
                            </div>
                            <button
                              type="submit"
                              disabled={loading}
                              className="bg-indigo-655 hover:bg-indigo-600 transition text-white px-5 py-2.5 text-[10px] uppercase font-black tracking-widest rounded-xl border border-indigo-505/20"
                            >
                              Register Web Hook Command
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SUB-PAGE 4: RELATIONS, GROUPS & AUDITS */}
                {activeTab === 'users_groups' && (
                  <div className="space-y-6">
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
                      <div>
                        <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
                          <Users className="w-5 h-5 text-indigo-400" /> Relations Database Audits
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Control active lists configuration and execute overrides or blacklists.</p>
                      </div>
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 w-4 h-4 top-2.5 text-slate-500" />
                        <input 
                          type="text"
                          placeholder="Search database records..."
                          value={ugSearchQuery}
                          onChange={(e) => setUgSearchQuery(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9.5 pr-4 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 text-xs font-sans">
                      
                      {/* USERS COLUMN */}
                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl space-y-4">
                        <h5 className="font-black text-xs text-indigo-400 border-b border-slate-800 pb-2 flex items-center gap-2 uppercase tracking-wide">
                          👤 Interactive Subscribers ({usersList.length})
                        </h5>
                        {usersList.length === 0 ? (
                          <p className="text-slate-500 italic mt-2">No user relations recorded.</p>
                        ) : (
                          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                            {usersList.map((u) => {
                              const isBanned = botDetail?.bannedUsers?.includes(u.telegramId);
                              return (
                                <div key={u.telegramId} className="p-3 bg-slate-950/40 rounded-xl border border-slate-850/60 flex flex-col justify-between gap-2">
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <p className="font-bold text-white text-[12.5px]">
                                        {u.firstName || 'User'} {u.username && <span className="text-indigo-405 font-mono text-[10.5px]">@{u.username}</span>}
                                      </p>
                                      {isBanned && <span className="bg-rose-500/20 text-[8px] font-black border border-rose-500/30 text-rose-400 px-2 rounded-full uppercase tracking-widest font-mono">banned</span>}
                                    </div>
                                    <p className="font-mono text-[9px] text-slate-500 mt-0.5">ID: {u.telegramId}</p>
                                    {u.commandCredits && u.commandCredits.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[8px]">
                                        {u.commandCredits.map((cc: any) => (
                                          <span key={cc.command} className="bg-indigo-505/10 border border-indigo-500/20 text-indigo-300 px-1 rounded font-bold">{cc.command}: {cc.dailyLimit}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex justify-end gap-1.5 items-center mt-1">
                                    <button
                                      onClick={() => {
                                        setEditingUser(u);
                                        setEditCreditsCommand(defaultCommands[0]?.command || '');
                                        const cc = u.commandCredits?.find((x: any) => x.command === (defaultCommands[0]?.command || ''));
                                        setEditCreditsAmount(cc ? cc.dailyLimit : (defaultCommands[0]?.defaultDailyCredits || 0));
                                      }}
                                      className="bg-slate-900 border border-slate-850 hover:bg-slate-800 text-[9.5px] py-1 px-2.5 rounded-lg text-slate-350 cursor-pointer text-center font-bold"
                                    >
                                      Edit Limits
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await axios.post('/api/mirror-bots/ban', {
                                            token,
                                            targetId: u.telegramId,
                                            type: 'user',
                                            isBanned: !isBanned
                                          });
                                          if (res.data?.success) {
                                            setSuccessMsg(res.data.message);
                                            await loadBotProfile(token);
                                          }
                                        } catch (e: any) {
                                          setErrorMsg(e.response?.data?.error || 'Ban trigger failed');
                                        }
                                      }}
                                      className={`text-[9.5px] py-1 px-2.5 rounded-lg font-black transition cursor-pointer border uppercase tracking-wider
                                        ${isBanned 
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-555/20 hover:bg-emerald-500/20' 
                                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'}`}
                                    >
                                      {isBanned ? 'Unban' : 'Ban'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* GROUPS COLUMN */}
                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl space-y-4">
                        <h5 className="font-black text-xs text-indigo-400 border-b border-slate-800 pb-2 flex items-center gap-2 uppercase tracking-wide">
                          👥 Group Communities Active ({groupsList.length})
                        </h5>
                        {groupsList.length === 0 ? (
                          <p className="text-slate-505 italic mt-2">No active groups recorded.</p>
                        ) : (
                          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                            {groupsList.map((g) => {
                              const isBanned = botDetail?.bannedGroups?.includes(g.telegramId);
                              return (
                                <div key={g.telegramId} className="p-3 bg-slate-950/40 rounded-xl border border-slate-850/60 flex flex-col justify-between gap-2">
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <p className="font-bold text-white text-[12.5px]">{g.title || 'Untitled Group'}</p>
                                      {isBanned && <span className="bg-rose-500/20 text-[8px] font-black border border-rose-500/30 text-rose-450 px-2 rounded-full uppercase tracking-widest font-mono">blacklisted</span>}
                                    </div>
                                    <p className="font-mono text-[9px] text-slate-500 mt-0.5">ID: {g.telegramId}</p>
                                  </div>
                                  <div className="flex justify-end gap-1.5 items-center mt-1">
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await axios.post('/api/mirror-bots/ban', {
                                            token,
                                            targetId: g.telegramId,
                                            type: 'group',
                                            isBanned: !isBanned
                                          });
                                          if (res.data?.success) {
                                            setSuccessMsg(res.data.message);
                                            await loadBotProfile(token);
                                          }
                                        } catch (e: any) {
                                          setErrorMsg(e.response?.data?.error || 'Group ban trigger failed');
                                        }
                                      }}
                                      className={`text-[9.5px] py-1 px-2.5 rounded-lg font-black transition cursor-pointer border uppercase tracking-wider
                                        ${isBanned 
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                                          : 'bg-rose-500/10 text-rose-450 border-rose-505/20 hover:bg-rose-500/20'}`}
                                    >
                                      {isBanned ? 'Lift Block' : 'Blacklist'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>

                    {/* USERS CREDIT LIMIT DIALOG EDITOR */}
                    {editingUser && (
                      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-slate-100 space-y-4"
                        >
                          <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-wider">Configure client credits limit</h4>
                            <p className="text-[10.5px] text-slate-400 mt-1">Deploy direct limit configuration overrides for users.</p>
                          </div>

                          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-850 text-xs text-slate-400">
                            <strong>User Context:</strong> {editingUser.firstName} {editingUser.username && <span>(@{editingUser.username})</span>}
                            <div className="font-mono text-[10px] text-slate-500 mt-1">ID: {editingUser.telegramId}</div>
                          </div>

                          <div className="space-y-3.5 text-xs">
                            <div>
                              <label className="text-[9.5px] uppercase font-black text-slate-450 tracking-wider block mb-1.5">Target command</label>
                              <select
                                value={editCreditsCommand}
                                onChange={(e) => {
                                  setEditCreditsCommand(e.target.value);
                                  const cc = editingUser.commandCredits?.find((x: any) => x.command === e.target.value);
                                  setEditCreditsAmount(cc ? cc.dailyLimit : (defaultCommands.find(c => c.command === e.target.value)?.defaultDailyCredits || 0));
                                }}
                                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-white focus:outline-none"
                              >
                                {defaultCommands.map(c => (
                                  <option key={c.command} value={c.command}>{c.command} (Default: {c.defaultDailyCredits})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[9.5px] uppercase font-black text-slate-450 tracking-wider block mb-1.5">Overriding Daily Limit Quota</label>
                              <input 
                                type="number"
                                value={editCreditsAmount}
                                onChange={(e) => setEditCreditsAmount(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-855 rounded-xl px-3.5 py-2 font-mono text-white text-xs focus:outline-none"
                                placeholder="e.g. 100"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 border-t border-slate-850 pt-3 text-xs">
                            <button
                              onClick={() => setEditingUser(null)}
                              className="bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold py-1.5 px-4 rounded-xl cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveUserCredits}
                              className="bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 text-white font-extrabold uppercase text-[10.5px] tracking-wider py-1.5 px-4 rounded-xl cursor-pointer transition border border-indigo-505/20"
                            >
                              Commit Overrides
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-PAGE 5: BROADCAST DISPATCHER */}
                {activeTab === 'broadcast' && (
                  <div className="space-y-6">
                    {/* ONGOING BROADCAST PROGRESS PANEL (Dynamic Glass) */}
                    {(() => {
                      const ongoing = broadcastHistory.find(b => b.status === 'sending');
                      if (!ongoing) return null;
                      const total = (ongoing.totalUsers || 0) + (ongoing.totalGroups || 0);
                      const processed = (ongoing.successUsers || 0) + (ongoing.failedUsers || 0) + (ongoing.successGroups || 0) + (ongoing.failedGroups || 0);
                      const progressPercentage = total > 0 ? (processed / total) * 100 : 0;
                      const pct = Math.min(progressPercentage, 100);
                      return (
                        <div className="bg-[#0b0f2a]/55 border border-indigo-500/20 backdrop-blur-xl rounded-2xl p-6 shadow-[0_8px_32px_rgba(99,102,241,0.15)] space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
                            <div className="flex items-center gap-3">
                              <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                              </span>
                              <div>
                                <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 leading-none">
                                  Campaign Dispatch in Progress...
                                </h4>
                                <span className="text-[10px] text-slate-400 mt-1 block">
                                  Target: <strong className="text-indigo-400 uppercase font-bold font-mono">{ongoing.target}</strong>
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCancelBroadcast(ongoing._id)}
                              className="px-4.5 py-2.5 bg-rose-500 hover:bg-rose-600 border border-rose-450/20 text-white font-black text-xs uppercase tracking-wider rounded-xl transition duration-300 shadow-md cursor-pointer whitespace-nowrap self-start sm:self-center"
                            >
                              Cancel Broadcast
                            </button>
                          </div>

                          <div className="space-y-2 mt-2 leading-none">
                            <div className="flex justify-between items-baseline">
                              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest font-mono">Dispatched Items</span>
                              <span className="text-xs text-white font-black font-mono">
                                {processed.toLocaleString()} <span className="text-slate-500 font-bold">/ {total.toLocaleString()}</span>
                              </span>
                            </div>
                            <div className="w-full bg-[#050715] h-2.5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 font-bold font-mono">
                              <span>{pct.toFixed(1)}% complete</span>
                              <span className="text-emerald-400">Success: {ongoing.successUsers + ongoing.successGroups} &nbsp; <span className="text-rose-450">Failed: {ongoing.failedUsers + ongoing.failedGroups}</span></span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="bg-[#0b0f2a]/40 border border-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-5 font-sans">
                    <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                          <Radio className="w-5 h-5 text-indigo-400" /> Mass marketing dispatcher console
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Send alert campaigns safely from your bot to connected user chats.</p>
                      </div>
                    </div>

                    {/* day indicators */}
                    <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4.5">
                        <span className="text-[9.5px] uppercase font-black text-slate-500 tracking-wider">Dispatched today</span>
                        <p className="text-2xl font-black text-indigo-400 font-mono mt-1">{botDetail?.broadcastsToday || 0}</p>
                      </div>
                      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4.5">
                        <span className="text-[9.5px] uppercase font-black text-slate-500 tracking-wider">Maximum allowable</span>
                        <p className="text-2xl font-black text-white font-mono mt-1">
                          {activePlan === 'free' ? '1 / day' : ''}
                          {activePlan === 'silver' ? '5 / day' : ''}
                          {activePlan === 'gold' ? '20 / day' : ''}
                          {activePlan === 'max' ? 'Infinite' : ''}
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleSendBroadcast} className="space-y-4.5 text-xs text-sans">
                      <div>
                        <label className="block text-[9.5px] tracking-widest font-black text-slate-500 uppercase mb-2">Workspace Filter</label>
                        <select 
                          value={bcTarget}
                          onChange={(e) => setBcTarget(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-white text-xs uppercase"
                        >
                          <option value="all">Private Subscribers &amp; Group channels</option>
                          <option value="users">Direct users only</option>
                          <option value="groups">Group channels only</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9.5px] tracking-widest font-black text-slate-500 uppercase mb-2">Campaign template payload (Markdown format)</label>
                        <textarea 
                          value={bcMessage}
                          onChange={(e) => setBcMessage(e.target.value)}
                          rows={6}
                          placeholder="Type alert notifications details..."
                          className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-white text-xs font-mono focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-650 hover:bg-indigo-600 transition-all text-white text-[10.5px] uppercase font-black tracking-widest px-6 py-3 rounded-xl border border-indigo-505/20 hover:-translate-y-0.5"
                      >
                        📡 Dispatch Campaign payload live
                      </button>
                    </form>
                  </div>
                </div>
              )}

                {/* SUB-PAGE 6: COINS, WALLET & COMMISSIONS LEDGER */}
                {activeTab === 'wallet' && (
                  <div className="space-y-6">
                    
                    {/* Wallet highlight indexes */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-slate-300">
                      
                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase font-black text-slate-500 tracking-wider">Withdrawable Balance</span>
                          <p className="text-3xl font-black text-white font-mono">₹{wallet?.balance ?? '0.00'}</p>
                          <p className="text-[9.5px] text-slate-500">Min. payout: ₹100</p>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-400 p-3.5 rounded-full border border-emerald-500/15">
                          <Wallet className="w-5 h-5 shrink-0" />
                        </div>
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase font-black text-slate-500 tracking-wider">Total Earned</span>
                          <p className="text-3xl font-black text-indigo-405 font-mono">₹{wallet?.totalEarned ?? '0.00'}</p>
                          <p className="text-[9.5px] text-slate-500">Includes system margins</p>
                        </div>
                        <div className="bg-indigo-500/10 text-indigo-400 p-3.5 rounded-full border border-indigo-500/15">
                          <Coins className="w-5 h-5 shrink-0" />
                        </div>
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase font-black text-slate-500 tracking-wider">Total Withdrawn</span>
                          <p className="text-3xl font-black text-slate-400 font-mono">₹{wallet?.totalWithdrawn ?? '0.00'}</p>
                          <p className="text-[9.5px] text-slate-500">Completed manual payouts</p>
                        </div>
                        <div className="bg-slate-800/50 text-slate-400 p-3.5 rounded-full border border-slate-800">
                          <Landmark className="w-5 h-5 shrink-0" />
                        </div>
                      </div>

                    </div>

                    {/* Affiliate commissions tiers guide in glass visual */}
                    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5 text-xs text-indigo-300 leading-relaxed font-sans space-y-1">
                      <h5 className="font-black uppercase text-[10px] text-indigo-400 flex items-center gap-1.5 animate-pulse tracking-wider">
                        <Award className="w-4 h-4 text-indigo-455" /> Affiliate system commission blueprints
                      </h5>
                      <p className="text-[11px] leading-relaxed text-slate-300">
                        Earn recurring UPI cash margins automatically when subscribers buy credit packages inside your cloned instance. Payout structures scale with plan tiers:
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-center text-xs">
                        <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-2.5">
                          <span className="text-[8.5px] text-slate-500 block">FREE PLAN</span>
                          <span className="font-mono font-black text-indigo-400 text-sm">20% Cash</span>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-2.5">
                          <span className="text-[8.5px] text-blue-400 block font-bold">SILVER PLAN</span>
                          <span className="font-mono font-black text-blue-300 text-sm">35% Cash</span>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-2.5">
                          <span className="text-[8.5px] text-amber-400 block font-bold">GOLD PLAN</span>
                          <span className="font-mono font-black text-amber-300 text-sm">50% Cash</span>
                        </div>
                        <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-xl p-2.5 shadow-lg shadow-indigo-950/20">
                          <span className="text-[8.5px] text-purple-400 block font-bold">MAX PLAN</span>
                          <span className="font-mono font-black text-purple-300 text-sm">70% Cash</span>
                        </div>
                      </div>
                    </div>

                    {/* Request Cash withdrawal & Transaction LEDGER logs */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans">
                      
                      {/* Left: Request Payout Form */}
                      <form onSubmit={handleWithdrawSubmit} className="lg:col-span-5 bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl space-y-4 text-xs font-sans">
                        <div>
                          <h4 className="text-white text-xs font-black uppercase tracking-wider">Execute withdrawal</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Submit BHIM UPI handles to trigger withdrawals.</p>
                        </div>

                        <div className="space-y-4 font-sans text-xs">
                          <div>
                            <label className="block text-[9px] uppercase font-black text-slate-500 mb-1.5">UPI Address Handle (VPA)</label>
                            <input 
                              type="text"
                              required
                              value={upiId}
                              onChange={(e) => setUpiId(e.target.value)}
                              placeholder="e.g. yourname@ybl or upi"
                              className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-black text-slate-500 mb-1.5">Amount (₹)</label>
                            <input 
                              type="number"
                              required
                              min="100"
                              value={withdrawAmount}
                              onChange={(e) => setWithdrawAmount(e.target.value)}
                              placeholder="Min ₹100"
                              className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-white font-mono"
                            />
                          </div>

                          {withdrawError && (
                            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-350 rounded-xl font-bold text-[10.5px]">
                              {withdrawError}
                            </div>
                          )}

                          {withdrawSuccess && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-350 rounded-xl font-bold text-[10.5px]">
                              {withdrawSuccess}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={withdrawLoading || !upiId || !withdrawAmount}
                            className="bg-indigo-650 hover:bg-indigo-600 border border-indigo-505/20 text-white font-black text-xs uppercase p-3 w-full rounded-xl select-none cursor-pointer transition active:translate-y-0.5"
                          >
                            {withdrawLoading ? 'Processing withdrawal...' : 'Submit payout Request'}
                          </button>
                        </div>
                      </form>

                      {/* Right Ledger reports */}
                      <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-5 shadow-2xl space-y-4 text-xs">
                        <div>
                          <h4 className="text-white text-xs font-black uppercase tracking-wider">Earnings Ledger logs</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Historical verification ledger of rewards/withdrawals.</p>
                        </div>

                        {walletLoading ? (
                          <div className="h-44 flex items-center justify-center font-bold text-slate-500 uppercase font-mono animate-pulse">Retrieving ledger details...</div>
                        ) : !wallet || !wallet.history || wallet.history.length === 0 ? (
                          <div className="h-32 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-550 select-none">
                            <Clock className="w-8 h-8 text-slate-700 stroke-1 mb-2 animate-spin duration-3000" />
                            <p className="text-xs">No historical statements compiled yet.</p>
                          </div>
                        ) : (
                          <div className="overflow-y-auto max-h-[290px] border border-slate-850 rounded-xl divide-y divide-slate-850 text-xs font-sans">
                            {[...wallet.history].reverse().map((h: any, idx: number) => {
                              const isInc = h.amount > 0;
                              return (
                                <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-950/20 transition">
                                  <div className="space-y-1">
                                    <p className="font-bold text-white text-[12px]">{h.description || 'Campaign commission credits shadow'}</p>
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(h.date).toLocaleString()}</p>
                                  </div>
                                  <div className="text-right shrink-0 space-y-1">
                                    <p className={`font-black font-mono text-xs ${isInc ? 'text-emerald-450' : 'text-rose-450'}`}>
                                      {isInc ? '+' : ''}₹{h.amount}
                                    </p>
                                    {h.status !== 'N/A' && (
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase font-mono
                                        ${h.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-550/20' : ''}
                                        ${h.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-555/20' : ''}
                                        ${h.status === 'Rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-555/20' : ''}
                                      `}>
                                        {h.status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* SUB-PAGE 7: PROF PRIVILEGE UPGRADE SHOP */}
                {activeTab === 'shop' && (() => {
                  const availablePlans = registeredTiers.filter(t => t.id !== 'free');
                  const p = availablePlans[planSlideIndex];
                  return (
                    <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
                      <div className="border-b border-slate-800 pb-4 mb-6">
                        <h4 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                          <Award className="w-5 h-5 text-indigo-400" /> Professional Subscription upgrades
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 font-sans font-medium">Elevate bot parameters to raise maximum channel and speed capacities.</p>
                      </div>

                      {availablePlans.length > 0 && (
                        <div className="flex border border-slate-800/80 max-w-sm mx-auto p-1 rounded-2xl bg-slate-950/60 mb-6 gap-1 relative font-sans">
                          {availablePlans.map((item, idx) => {
                            const isSel = planSlideIndex === idx;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setSliderDirection(idx > planSlideIndex ? 1 : -1);
                                  setPlanSlideIndex(idx);
                                }}
                                className={`relative py-2.5 text-[10px] w-full uppercase font-black tracking-widest text-center transition duration-300 rounded-xl cursor-pointer select-none z-10 w-full text-center
                                  ${isSel ? 'text-slate-950' : 'text-slate-400 hover:text-white'}`}
                              >
                                {isSel && (
                                  <motion.div
                                    layoutId="innerShopTabGlow"
                                    className="absolute inset-0 bg-white rounded-xl -z-10 shadow-lg"
                                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                                  />
                                )}
                                {item.name}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Sliding Area representing active option */}
                      {availablePlans.length > 0 && p && (
                        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto font-sans">
                          <button
                            onClick={() => {
                              const newI = (planSlideIndex - 1 + availablePlans.length) % availablePlans.length;
                              setPlanSlideIndex(newI);
                            }}
                            className="p-2 border border-slate-850 hover:bg-slate-800 text-slate-400 rounded-full cursor-pointer transition select-none flex items-center justify-center font-bold"
                          >
                            ◀
                          </button>

                          <div className="w-full relative overflow-hidden min-h-[360px] flex flex-col justify-center">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-4 shadow-xl">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-black text-[9px] uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">{p.id} tier</span>
                                  <h4 className="font-black text-lg text-white mt-2 leading-none uppercase">{p.name}</h4>
                                  <p className="text-2xl font-black text-white font-mono mt-1">₹{p.price}/<span className="text-xs text-slate-500">mo</span></p>
                                </div>
                                {botDetail?.plan === p.id && (
                                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-555/20 font-black text-[8px] uppercase tracking-wider px-2.5 py-1 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.25)]">Active Plan</span>
                                )}
                              </div>

                              <div className="divide-y divide-slate-850/60 font-sans text-slate-350 text-[11px] font-medium">
                                <div className="py-2 flex justify-between">
                                  <span>Forced Join Check limits:</span>
                                  <span className="font-bold text-white uppercase">{p.maxChannels} custom channels</span>
                                </div>
                                <div className="py-2 flex justify-between">
                                  <span>Daily campaign dispatch logs:</span>
                                  <span className="font-bold text-white uppercase">{p.broadcastLimit} users limit</span>
                                </div>
                                <div className="py-2 flex justify-between bg-emerald-500/5 px-2 rounded-lg border border-emerald-500/10 my-1 font-sans">
                                  <span className="font-bold text-emerald-400">Cash commissions share:</span>
                                  <span className="font-black text-emerald-400 font-mono">
                                    {p.id === 'silver' ? '35% Commission' : ''}
                                    {p.id === 'gold' ? '50% Commission' : ''}
                                    {p.id === 'max' ? '70% Commission' : ''}
                                  </span>
                                </div>
                                {p.desc && <div className="py-2 italic text-[10px] text-slate-500 leading-normal">💡 {p.desc}</div>}
                              </div>

                              <button
                                onClick={() => {
                                  setCheckoutPlan(p);
                                  setPayError('');
                                  setPaySuccess('');
                                  setUtrInput('');
                                }}
                                className="w-full bg-indigo-650 hover:bg-indigo-600 transition font-black text-[10.5px] uppercase tracking-wider text-white py-2.5 rounded-xl block cursor-pointer border border-indigo-505/20 text-center"
                              >
                                {botDetail?.plan === p.id ? '🔄 Extend subscription (30 days)' : `Upgrade to ${p.name}`}
                              </button>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const newI = (planSlideIndex + 1) % availablePlans.length;
                              setPlanSlideIndex(newI);
                            }}
                            className="p-2 border border-slate-850 hover:bg-slate-800 text-slate-400 rounded-full cursor-pointer transition select-none flex items-center justify-center font-bold"
                          >
                            ▶
                          </button>
                        </div>
                      )}

                      {/* Dot carousel indicator */}
                      <div className="flex justify-center gap-1.5 mt-2.5">
                        {availablePlans.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setPlanSlideIndex(idx)}
                            className={`w-2 h-2 rounded-full cursor-pointer transition-transform ${idx === planSlideIndex ? 'bg-indigo-400 scale-125' : 'bg-slate-800'}`}
                          />
                        ))}
                      </div>

                      {/* UPI SECURE CHECKOUT POPUP DIALOG MODAL */}
                      {checkoutPlan && (() => {
                        const upiUrl = `upi://pay?pa=alkhkumar@fam&pn=Encore%20Xosint&am=${checkoutPlan.price}&cu=INR&tn=${encodeURIComponent(`Upgrade to ${checkoutPlan.name} Plan`)}`;
                        return (
                          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-left space-y-4 text-slate-100 max-h-[88vh] overflow-y-auto"
                            >
                              <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                                <div>
                                  <h4 className="font-black text-sm text-white uppercase tracking-wider">UPI Checkout Terminal</h4>
                                  <p className="text-[9.5px] text-slate-400 uppercase tracking-widest font-mono mt-0.5">{checkoutPlan.name} Privilege upgrade</p>
                                </div>
                                <button
                                  onClick={() => setCheckoutPlan(null)}
                                  className="text-slate-450 hover:text-white text-[11px] uppercase font-mono cursor-pointer"
                                >
                                  ✕ Close
                                </button>
                              </div>

                              <div className="flex flex-col items-center justify-center bg-slate-950/40 p-4 border border-slate-850 rounded-xl space-y-2">
                                <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Scan QR code to transfer ₹{checkoutPlan.price}</span>
                                <div className="bg-white p-2 rounded-2xl border border-slate-750 flex items-center justify-center w-40 h-40">
                                  <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUrl)}`}
                                    alt="UPI QR Code"
                                    className="w-36 h-36"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <p className="text-[9px] text-center text-slate-500 italic max-w-xs leading-normal font-sans">Supports Google Pay, PhonePe, Paytm, BHIM and major networks.</p>
                              </div>

                              <div className="space-y-3">
                                <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-[9.5px] text-amber-200/90 leading-relaxed font-sans">
                                  ⚠️ INPUT EXACT TRANSACTION ID: Ensure you record and paste the 12-digit UPI UTR number or Fampay Transaction ID sequence securely below following success. Mismatched sums are filtered automatically.
                                </div>

                                <div className="space-y-1 font-sans text-xs">
                                  <label className="text-[9px] uppercase font-black text-slate-450 block font-sans">UPI Transaction UTR or Fampay Ref</label>
                                  <input 
                                    type="text"
                                    placeholder="e.g. 614050212984"
                                    value={utrInput}
                                    onChange={(e) => setUtrInput(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-white font-mono"
                                  />
                                </div>

                                {payError && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-350 text-[10px] rounded-lg font-bold">❌ {payError}</div>}
                                {paySuccess && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-350 text-[10px] rounded-lg font-bold">🎉 {paySuccess}</div>}

                                <div className="flex gap-2 justify-end pt-2 border-t border-slate-850">
                                  <button
                                    onClick={() => setCheckoutPlan(null)}
                                    className="bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold py-1.5 px-3 rounded-lg text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleVerifySubPayment(checkoutPlan.id, checkoutPlan.price)}
                                    disabled={paymentProcessing}
                                    className="bg-indigo-650 hover:bg-indigo-650 transition text-white px-4 py-1.5 rounded-lg text-xs font-bold"
                                  >
                                    {paymentProcessing ? 'Processing request...' : 'Verify Transfer'}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

              </motion.div>
            </AnimatePresence>

          </div>

        </div>

        {/* Global Point help detail Modal element */}
        <PointsHelpModal show={showPointsHelpModal} onClose={() => setShowPointsHelpModal(false)} />

      </div>
    </div>
  );
}
