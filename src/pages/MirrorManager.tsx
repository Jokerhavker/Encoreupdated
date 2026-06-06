import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Bot, Key, Shield, Radio, Plus, Trash2, Edit3, 
  CheckCircle2, Ban, Users, Settings, Award, 
  AlertTriangle, Zap, ExternalLink, RefreshCw, XCircle, ListFilter,
  Wallet, Clock, Landmark, Coins, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function MirrorManager() {
  // Query param auto-fill
  const getQueryUserId = () => {
    return new URLSearchParams(window.location.search).get('userid') || '';
  };

  // State Management
  const [ownerTelegramId, setOwnerTelegramId] = useState(getQueryUserId() || localStorage.getItem('mirror_owner_id') || '');
  const [token, setToken] = useState(localStorage.getItem('mirror_bot_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [botDetail, setBotDetail] = useState<any>(null);
  const [botStats, setBotStats] = useState<any>({ totalUsers: 0, totalGroups: 0 });
  const [ownedBots, setOwnedBots] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'commands' | 'users_groups' | 'shop' | 'broadcast' | 'wallet'>('overview');
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
  const [tempUserIdInput, setTempUserIdInput] = useState(getQueryUserId() || localStorage.getItem('mirror_owner_id') || '');

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
        // Refresh wallet state
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
  const handleSaveGlobalOverride = async (cmd: string, val: number) => {
    if (!token || !cmd) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/update-overrides', {
        token,
        command: cmd,
        dailyLimit: val
      });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Global override limits updated successfully!');
        setBotDetail(res.data.bot);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed updating command credentials override limit.');
    } finally {
      setLoading(false);
    }
  };

  // Handle purchasing and verifying subscription tier upgrade
  const handleVerifySubPayment = async (planId: string, itemPrice: number) => {
    if (!token || !ownerTelegramId || !planId) return;
    if (!utrInput.trim()) {
      setPayError('Please fill your 12-digit UPI transaction reference / UTR ID first.');
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
      // 1. Verify telegram connection
      const tok = tempTokenInput.trim();
      const tgId = tempUserIdInput.trim();

      const chk = await axios.post('/api/mirror-bots/check-token', { token: tok });
      if (chk.data?.success) {
        // 2. Persist register
        const reg = await axios.post('/api/mirror-bots', {
          token: tok,
          ownerTelegramId: tgId,
          plan: 'free' // defaults to lifetime free onboarding tier
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
        decoratedMessage: newCmdDecorator.trim()
      });

      if (res.data?.success) {
        setSuccessMsg('Dynamic custom API command saved successfully!');
        setBotDetail({
          ...botDetail,
          customCommands: res.data.customCommands
        });
        // Clear form
        setNewCmdName('');
        setNewCmdDesc('');
        setNewCmdApi('');
        setNewCmdCredit(false);
        setNewCmdCost(0);
        setNewCmdDecorator('{{api.response}}');
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

  // Clear current active token session to log out
  const handleExitBotSession = () => {
    localStorage.removeItem('mirror_bot_token');
    setToken('');
    setBotDetail(null);
    setIsAuthenticated(false);
  };

  // Authentication Onboarding screen
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-6">
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
          <div className="bg-indigo-600 p-6 text-white text-center">
            <Bot className="w-12 h-12 mx-auto mb-2 text-indigo-100" />
            <h2 className="text-xl font-bold">Mirrored Bot Setup Control</h2>
            <p className="text-xs text-indigo-100 max-w-sm mx-auto mt-1">
              Onboard and launch your own instant functional clone of ENCORE XOSINT in seconds.
            </p>
          </div>

          <form onSubmit={handleOnboard} className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-lg text-xs flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 bg-green-50 border border-green-100 text-green-700 rounded-lg text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{successMsg}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Key className="w-3 h-3 text-indigo-500" />
                  Bot Token (obtained from Telegram @BotFather)
                </label>
                <input 
                  type="text" 
                  value={tempTokenInput}
                  onChange={(e) => setTempTokenInput(e.target.value)}
                  placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3 text-indigo-500" />
                  Your Telegram Numeric User ID
                </label>
                <input 
                  type="text" 
                  value={tempUserIdInput}
                  onChange={(e) => setTempUserIdInput(e.target.value)}
                  placeholder="e.g. 590981446"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : "Initialize and Clonal Start Bot"}
            </button>
          </form>
        </div>

        {/* Owned bots list on login screen */}
        {ownedBots.length > 0 && (
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 space-y-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5 border-b pb-2">
              <Bot className="w-4 h-4 text-indigo-600" />
              Your Cloned Bot(s) ({ownedBots.length}/1)
            </h3>
            <div className="divide-y divide-gray-50">
              {ownedBots.map((b: any) => (
                <div key={b.token} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-1.5 align-middle">
                      {b.customBotName || b.botName || 'Mirrored Bot'}
                      <span className={`w-2 h-2 rounded-full inline-block ${b.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} title={b.isActive ? 'Active Poller Running' : 'Poller Paused'} />
                    </p>
                    <p className="text-[10px] font-mono text-gray-400">@{b.botUsername || 'unregistered'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Plan tier: <span className="font-semibold text-indigo-600 uppercase">{b.plan}</span></p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        localStorage.setItem('mirror_bot_token', b.token);
                        localStorage.setItem('mirror_owner_id', b.ownerTelegramId);
                        setToken(b.token);
                        setOwnerTelegramId(b.ownerTelegramId);
                      }}
                      className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded transition text-[10px] cursor-pointer"
                    >
                      Manage
                    </button>
                    <button
                      onClick={async () => {
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
                          alert(err.response?.data?.error || 'Failed pausing bot.');
                        }
                      }}
                      className={`font-semibold px-2.5 py-1.5 rounded transition text-[10px] cursor-pointer ${
                        b.isActive ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {b.isActive ? 'Stop' : 'Start'}
                    </button>
                    <button
                      onClick={async () => {
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
                      }}
                      className="bg-red-50 text-red-600 hover:bg-red-100 font-semibold px-2.5 py-1.5 rounded transition text-[10px] cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Informative Walkthrough */}
        <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100/50 space-y-3 text-xs leading-relaxed text-indigo-950">
          <p className="font-bold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Zap className="w-4 h-4 text-indigo-600" />
            How to get a Bot Token from FatherBot:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-indigo-900/90 pl-1">
            <li>Search for <strong>@BotFather</strong> on official Telegram app.</li>
            <li>Send the start command: <code>/newbot</code>.</li>
            <li>Input a custom Display Name, e.g. <code>My OSINT Finder</code>.</li>
            <li>Input a unique suffix username, e.g. <code>MyXOsintBot</code>.</li>
            <li>Copy the generated HTTP API **token** and paste it globally in the setup form above!</li>
          </ol>
        </div>
      </div>
    );
  }

  // Admin Dashboard views (Authenticated bot loaded!)
  const activePlan = botDetail?.plan || 'free';

  return (
    <div ref={containerRef} className="max-w-5xl mx-auto space-y-6 pt-4 pb-8">
      
      {/* Bot info header strip */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-100">
            <Bot className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {botDetail?.customBotName || botDetail?.botName || "Mirrored Clone Bot"}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full select-none uppercase tracking-wide
                ${activePlan === 'free' ? 'bg-slate-100 text-slate-700 border border-slate-200' : ''}
                ${activePlan === 'silver' ? 'bg-blue-50 text-blue-600 border border-blue-100' : ''}
                ${activePlan === 'gold' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' : ''}
                ${activePlan === 'max' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : ''}
              `}>
                💎 {activePlan} PLAN
              </span>
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              @{botDetail?.botUsername || "unregistered"} &bull; Token: 
              <span className="font-bold font-sans text-gray-700 ml-1 bg-gray-50 px-1.5 py-0.5 rounded select-all border text-[10px]">
                {token.slice(0, 10)}...{token.slice(-6)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Active poller state toggle */}
          <button
            onClick={handleToggleBotActive}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5
              ${botDetail?.isActive 
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${botDetail?.isActive ? 'bg-green-500 animate-ping' : 'bg-red-500'}`} />
            {botDetail?.isActive ? "Status : Active" : "Status : Paused"}
          </button>

          <button
            onClick={handleExitBotSession}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Disconnect Bot
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
                  } else {
                    alert('Deletion failed.');
                  }
                } catch (err: any) {
                  alert(err.response?.data?.error || 'Error deleting bot.');
                } finally {
                  setLoading(false);
                }
              }
            }}
            disabled={loading}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Bot
          </button>
        </div>
      </div>

      {/* Top Banner replacing Simulator with direct Action */}
      <div className="bg-indigo-600 text-white rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 font-medium">
        <div className="space-y-1">
          <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4 text-white" /> Upgrade & Shop Your Bot
          </p>
          <p className="text-[11px] text-indigo-50/90 font-light pr-2">
            Gain privileged access to command overrides, customizable API endpoints, unlimited broadcasts, and multiple forced join channels.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setActiveTab('wallet')}
            className="bg-indigo-700 hover:bg-indigo-850 border border-indigo-500 text-white font-extrabold text-[11px] px-3 py-2 rounded-lg transition shadow-xs cursor-pointer select-none whitespace-nowrap flex items-center gap-1.5"
          >
            <Wallet className="w-3.5 h-3.5" /> 💼 Wallet & Earnings
          </button>
          
          <button
            onClick={() => setActiveTab('shop')}
            className="bg-white text-indigo-600 hover:bg-indigo-50 font-extrabold text-[11px] px-3 py-2 rounded-lg transition shadow-xs cursor-pointer select-none whitespace-nowrap"
          >
            👑 View Plans & Upgrade
          </button>
        </div>
      </div>

      {/* Global Toast Area */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
          <p className="font-semibold">{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-100 text-green-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {/* Multi-Tab Navigation Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden p-3.5 space-y-1">
          <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider px-3 mb-2">Bot Settings Tabs</p>
          
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'overview' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Bot className="w-4 h-4 shrink-0" /> Dashboard
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-4 h-4 shrink-0" /> General Settings
          </button>

          <button
            onClick={() => setActiveTab('commands')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'commands' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Zap className="w-4 h-4 shrink-0" /> Commands
          </button>

          <button
            onClick={() => setActiveTab('users_groups')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'users_groups' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Users className="w-4 h-4 shrink-0" /> Users & Groups
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'broadcast' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Radio className="w-4 h-4 shrink-0" /> Broadcast
          </button>

          <button
            onClick={() => setActiveTab('wallet')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'wallet' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Wallet className="w-4 h-4 shrink-0" /> Wallet & Earnings
          </button>
        </div>

        {/* Tab Canvas Content */}
        <div ref={canvasRef} className="lg:col-span-3 space-y-6">

          {/* TAB 1: Status Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Stats highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5 animate-pulse">
                    <Users className="w-3.5 h-3.5 text-indigo-500" /> Bot Private Users
                  </p>
                  <p className="text-2xl font-black text-gray-800 font-mono">{botStats.totalUsers || 0}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Interacted private channels</p>
                </div>

                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5 animate-pulse">
                     <Settings className="w-3.5 h-3.5 text-indigo-500" /> Bot Group Chats
                  </p>
                  <p className="text-2xl font-black text-gray-800 font-mono">{botStats.totalGroups || 0}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Groups actively tracked</p>
                </div>

                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Integration Points
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowPointsHelpModal(true)}
                        className="w-4 h-4 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 text-[10px] font-black font-mono transition flex items-center justify-center cursor-pointer select-none"
                      >
                        i
                      </button>
                    </div>
                    {(() => {
                      const getPointsLimit = (p: string) => {
                        const pl = (p || 'free').toLowerCase();
                        if (pl === 'silver') return 50000;
                        if (pl === 'gold') return 200000;
                        if (pl === 'max') return 1500005; // 1.5M + check
                        if (pl === 'max') return 1500000;
                        return 10000;
                      };
                      const limit = getPointsLimit(activePlan);
                      const used = botDetail?.integrationPointsUsed || 0;
                      const percentage = limit > 0 ? (used / limit) * 100 : 0;
                      return (
                        <>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-black text-gray-800 font-mono">
                              {used.toLocaleString()}
                            </span>
                            <span className="text-xs text-gray-400 font-bold">
                              / {limit.toLocaleString()}
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  percentage >= 90 ? 'bg-red-500' : percentage >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center mt-1 text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                              <span>{percentage.toFixed(1)}% used</span>
                              <span>{botDetail?.integrationPointsMonth || 'This Month'}</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Core Limits list bento style */}
              <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-3 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-indigo-600" />
                  Current Plan Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-gray-700">
                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1 select-none">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">Plan Name</p>
                    <p className="font-extrabold text-indigo-600 uppercase">{activePlan}</p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">Broadcast Quota</p>
                    <p className="font-extrabold text-indigo-900">
                      {activePlan === 'free' ? '1 Broadcast / Day' : ''}
                      {activePlan === 'silver' ? '5 Broadcasts / Day' : ''}
                      {activePlan === 'gold' ? '20 Broadcasts / Day' : ''}
                      {activePlan === 'max' ? 'Unlimited Broadcasts' : ''}
                    </p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">Forced Subscribe Limits</p>
                    <p className="font-extrabold text-indigo-900 flex items-center gap-1">
                      {activePlan === 'free' ? 'None (Only Main Group Locked @encorexosint)' : ''}
                      {activePlan === 'silver' ? 'Upto 1 Custom Forced Channel (+ Main)' : ''}
                      {activePlan === 'gold' ? 'Upto 2 Custom Forced Channels (+ Main)' : ''}
                      {activePlan === 'max' ? 'Upto 5 Custom Forced Channels (+ Main)' : ''}
                    </p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">User Credit System Editable?</p>
                    <p className="font-extrabold text-indigo-900">
                      {activePlan === 'free' ? '❌ No (Locked default user credits)' : '✅ Yes (Full customizable overrides allowed)'}
                    </p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">Integration Points Quota</p>
                    <p className="font-extrabold text-indigo-900">
                      {activePlan === 'free' ? '10K Integration Points / month' : ''}
                      {activePlan === 'silver' ? '50K Integration Points / month' : ''}
                      {activePlan === 'gold' ? '200K Integration Points / month' : ''}
                      {activePlan === 'max' ? '1.5M Integration Points / month' : ''}
                    </p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-lg space-y-1">
                    <p className="text-[10px] text-gray-450 uppercase font-black tracking-wider">Referral Sales Commission</p>
                    <p className="font-extrabold text-indigo-900">
                      {activePlan === 'free' ? '💰 20% Commission' : ''}
                      {activePlan === 'silver' ? '💰 35% Commission' : ''}
                      {activePlan === 'gold' ? '💰 50% Commission' : ''}
                      {activePlan === 'max' ? '💰 50% Commission' : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bot Connection Troubleshooting (Fix Stuck Tooltip) */}
              <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-600 animate-bounce" />
                      Bot Connection & Delivery Troubleshooting
                    </h3>
                    <p className="text-xs text-amber-800 leading-relaxed font-semibold">
                      If your cloned bot isn't responding or seems offline, Telegram's system-level webhook delivery might be stuck.
                    </p>
                    <p className="text-[11px] text-amber-700/85 leading-normal">
                      Use the button below to force-flush the Telegram webhook registration, drop pending queues, drop stale webhooks, and cleanly restart the bot's instant delivery listener immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={fixLoading}
                    onClick={handleFixStuck}
                    className="md:self-center px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-black text-xs uppercase tracking-wide rounded-lg transition-all shadow-xs active:scale-95 flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start"
                  >
                    {fixLoading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span>
                        Rebooting...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        Fix Stuck (Reset Bot)
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Branding & Force Join */}
          {activeTab === 'settings' && (
            <div className="space-y-6">

              {/* Bot Meta Info branding change */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-3 mb-4 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-indigo-600" /> Customize Bot Profile settings
                </h3>

                <form onSubmit={handleSaveDetails} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                      Custom Desired Bot Name
                    </label>
                    <input 
                      type="text" 
                      value={customBotName}
                      onChange={(e) => setCustomBotName(e.target.value)}
                      placeholder="e.g. Hunter Find FinderOSINT"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white bg-gray-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 tracking-wide uppercase mb-1 flex items-center gap-1">
                      Daily Group Credits
                    </label>
                    <input 
                      type="number" 
                      value={defaultGroupCredits}
                      onChange={(e) => setDefaultGroupCredits(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:bg-white bg-gray-50/50"
                    />
                    <p className="text-[10px] text-gray-400 font-medium mt-1">Starting balance when premium clone is added to group chats.</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                  >
                    Save branding
                  </button>
                </form>
              </div>

              {/* Force Subscribe config */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 border-b pb-3 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" /> Required forced channel settings
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-1 select-none">
                    Under standard clone terms, all users must join required channels to activate and interact with bot queries.
                  </p>
                </div>

                {/* Main fixed channel */}
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 rounded-md text-amber-800">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-amber-950">@encorexosint (Main Channel)</p>
                      <p className="text-[10px] text-amber-800 font-medium">Constant forced join channel (Locked for all Clonal Plans).</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-sans font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                    🔒 Protected
                  </span>
                </div>

                {/* Render current dynamic list */}
                {(botDetail?.forceChannels || []).length > 0 ? (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Dynamic User Channels</p>
                    {botDetail.forceChannels.map((ch: any) => (
                      <div key={ch.username} className="bg-slate-50 border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold font-mono text-gray-800">{ch.username}</p>
                          <a href={ch.link} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1">
                            {ch.link} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>

                        <button
                          onClick={() => handleRemoveForceChannel(ch.username)}
                          disabled={loading}
                          className="p-1 px-2.5 bg-red-50 text-red-600 rounded border border-red-100 text-[10px] font-bold hover:bg-red-100 cursor-pointer transition"
                        >
                          Delete Channel
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 font-medium italic select-none">No custom sub channels assigned. Add one below!</div>
                )}

                {/* Add channel section */}
                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-xs font-bold text-gray-900">Add custom forced channel:</h4>
                  {activePlan === 'free' ? (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 flex items-start gap-2 select-none">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
                      <div>
                        <strong>Free tier limits:</strong> Custom force subscription channels require SILVER plans or higher.
                        <button onClick={() => setActiveTab('shop')} className="text-indigo-600 font-extrabold hover:underline ml-1 block mt-1">
                          👑 Upgrade your plan here to add forced channels!
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleAddForceChannel} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Channel Username Handle</label>
                        <input 
                          type="text" 
                          value={forceChanName}
                          onChange={(e) => setForceChanName(e.target.value)}
                          placeholder="e.g. @MyCoolChannel"
                          className="w-full border border-gray-300 rounded px-2.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Invitation Join Link</label>
                        <input 
                          type="text" 
                          value={forceChanLink}
                          onChange={(e) => setForceChanLink(e.target.value)}
                          placeholder="e.g. https://t.me/MyCoolChannel"
                          className="w-full border border-gray-300 rounded px-2.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="md:col-span-2 pt-1">
                        <button
                          type="submit"
                          disabled={loading}
                          className="bg-indigo-600 text-white px-4 py-2 rounded text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                        >
                          Activate custom Force Channel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Commands Tab */}
          {activeTab === 'commands' && (
            <div className="space-y-6">

              {/* Free plan default commands list lock */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <ListFilter className="w-4 h-4 text-indigo-600" /> Commands
                  </h3>
                  <span className="text-[10px] text-gray-500 font-bold uppercase select-none">
                    Core commands list
                  </span>
                </div>

                <p className="text-[11.5px] text-gray-500 leading-relaxed leading-normal mb-1">
                  Adjust custom limit overrides and toggle exclusions of core commands on your bot clone. All user credits deduction systems remain fully synchronized.
                </p>

                {activePlan === 'free' ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 leading-relaxed mb-4">
                    <strong>Free Tier restrictions:</strong> In commands, free plan users can see Command Name and Global Credits. Excluding commands or custom limit overriding requires upgrade!
                    <button onClick={() => setActiveTab('shop')} className="text-indigo-600 font-extrabold hover:underline block mt-1">
                      👑 Quick upgrade your subscription parameters
                    </button>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {defaultCommands.map((cmd) => {
                    const isEx = !!(botDetail?.excludedCommands || []).includes(cmd.command);
                    const currentTier = registeredTiers.find(t => t.id === activePlan);
                    const isMax = activePlan === 'max';
                    const allowedEditConfig = currentTier?.editableCommands?.find((ec: any) => ec.command === cmd.command);
                    const isEditableInPlan = isMax || !!allowedEditConfig;
                    const maxLimit = isMax ? 'No limit' : (allowedEditConfig ? `Up to ${allowedEditConfig.maxLimit}` : '');

                    const currentOverride = botDetail?.commandCreditsOverrides?.find((co: any) => co.command === cmd.command)?.dailyLimit;
                    const activeLimit = currentOverride !== undefined ? currentOverride : cmd.defaultDailyCredits;

                    return (
                      <div key={cmd.command} className="bg-gray-50 rounded-lg border border-gray-100 p-3.5 flex flex-col justify-between gap-3 text-xs">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className={`font-mono font-bold text-sm ${isEx ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {cmd.command}
                              </p>
                              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Regular Daily Credits Limit: {cmd.defaultDailyCredits || 0}</p>
                              <p className="text-[10px] text-indigo-600 font-bold mt-0.5">Current Active Quota Limit: {activeLimit}</p>
                            </div>
                            {activePlan !== 'free' && (
                              <button
                                onClick={() => handleToggleCommandActive(cmd.command, isEx)}
                                disabled={loading}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold border transition cursor-pointer select-none
                                  ${isEx 
                                    ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                                    : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                              >
                                {isEx ? 'Exposed' : 'Excluded'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline limit override if allowed in their plan */}
                        {isEditableInPlan ? (
                          <div className="border-t pt-2 flex items-center justify-between gap-2.5 bg-white p-2 rounded border border-gray-100">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-950">
                              Edit Limit {maxLimit && <span className="text-gray-400">({maxLimit})</span>}
                            </span>
                            <div className="flex gap-1.5 items-center">
                              <input
                                type="number"
                                placeholder={activeLimit.toString()}
                                className="bg-white border rounded font-mono px-1.5 py-0.5 text-xs w-20 text-center focus:outline-none"
                                id={`cmd-limit-input-${cmd.command}`}
                              />
                              <button
                                onClick={() => {
                                  const valStr = (document.getElementById(`cmd-limit-input-${cmd.command}`) as HTMLInputElement)?.value;
                                  if (valStr) {
                                    handleSaveGlobalOverride(cmd.command, Number(valStr));
                                    (document.getElementById(`cmd-limit-input-${cmd.command}`) as HTMLInputElement).value = '';
                                  }
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] px-2.5 py-1 rounded transition select-none cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : activePlan !== 'max' && (
                          <div className="text-[9px] text-gray-400 italic font-medium px-1 leading-normal">
                            🔒 Upgrade to customize limits for {cmd.command}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic custom API routing console (Silver+) */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-4">
                <div className="border-b pb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-indigo-600" /> Clone Custom API-based Commands
                  </h3>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Add own customized command that requests third party API dynamically and replies output back!</p>
                </div>

                {activePlan === 'free' ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-900 rounded-lg">
                    <strong>Custom Commands are Locked:</strong> Upgrade bot clamp tier to SILVER or higher to unlock.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* List existing custom commands */}
                    {(botDetail?.customCommands || []).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Current API Commands List</p>
                        {botDetail.customCommands.map((cc: any) => (
                          <div key={cc.command} className="bg-slate-50 border rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                            <div>
                              <p className="font-mono font-black text-indigo-600">{cc.command}</p>
                              <p className="text-gray-500 font-medium">{cc.description}</p>
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-sm">GET: {cc.apiUrl}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteCustomCommand(cc.command)}
                              className="p-1 px-2 text-[10px] bg-red-50 text-red-600 font-bold rounded hover:bg-red-100 cursor-pointer border"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Creation Form */}
                    <form onSubmit={handleCreateCustomCommand} className="space-y-4 p-4 border rounded-xl bg-gray-50/50">
                      <p className="text-xs font-bold text-gray-950">Add dynamic dynamic custom command:</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Command Trigger Name</label>
                          <input 
                            type="text" 
                            value={newCmdName}
                            onChange={(e) => setNewCmdName(e.target.value)}
                            placeholder="e.g. /mycmd"
                            className="w-full border rounded px-2 py-1.5"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Brief Description</label>
                          <input 
                            type="text" 
                            value={newCmdDesc}
                            onChange={(e) => setNewCmdDesc(e.target.value)}
                            placeholder="e.g. Query status finder"
                            className="w-full border rounded px-2 py-1.5"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">API Endpoint Target Get URL (Uses HTTP GET)</label>
                          <input 
                            type="text" 
                            value={newCmdApi}
                            onChange={(e) => setNewCmdApi(e.target.value)}
                            placeholder="e.g. https://api.myendpoint.com/search?q={{query}}"
                            className="w-full border rounded px-2 py-1.5 font-mono"
                          />
                          <p className="text-[9px] text-gray-400 mt-1">Hint: We map <code>{"{{query}}"}</code> placeholder dynamically inside the token trigger URL.</p>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Decoration Response template Layout</label>
                          <textarea 
                            value={newCmdDecorator}
                            onChange={(e) => setNewCmdDecorator(e.target.value)}
                            rows={3}
                            placeholder="e.g. Output for query:\n{{api.response}}"
                            className="w-full border rounded px-2 py-1.5 font-mono"
                          />
                          <p className="text-[9px] text-gray-400 mt-1">Hint: We replace <code>{"{{api.response}}"}</code> placeholder with your raw API JSON reply!</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="creditBased"
                            checked={newCmdCredit}
                            onChange={(e) => setNewCmdCredit(e.target.checked)}
                          />
                          <label htmlFor="creditBased" className="text-xs font-semibold uppercase text-gray-600">Deduct user credits cost?</label>
                        </div>

                        {newCmdCredit && (
                          <div>
                            <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Credits Cost Cost</label>
                            <input 
                              type="number" 
                              value={newCmdCost}
                              onChange={(e) => setNewCmdCost(Number(e.target.value))}
                              className="w-full border rounded px-2 py-1.5"
                            />
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-600 text-white px-3.5 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                      >
                        Register Dynamic Custom API
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}



          {/* TAB 5: Broadcast Tab */}
          {activeTab === 'broadcast' && (
            <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-4">
              <div className="border-b pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Radio className="w-5 h-5 text-indigo-600" /> Broadcast
                </h3>
                <p className="text-[10px] text-gray-400 font-medium mt-1">Send customized broadcast notifications from your bot to users who have interacted with it directly!</p>
              </div>

              {/* Day limit warnings */}
              <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                <div className="bg-gray-50 rounded-lg p-3.5 border space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">Broadcasts sent today</p>
                  <p className="text-lg font-black text-indigo-600 font-mono">{botDetail?.broadcastsToday || 0}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3.5 border space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">Maximum Quota Target Allowed</p>
                  <p className="text-lg font-black text-indigo-600 font-mono">
                    {activePlan === 'free' ? '1 / day' : ''}
                    {activePlan === 'silver' ? '5 / day' : ''}
                    {activePlan === 'gold' ? '20 / day' : ''}
                    {activePlan === 'max' ? 'No limit' : ''}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSendBroadcast} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Target chats filter</label>
                  <select 
                    value={bcTarget}
                    onChange={(e) => setBcTarget(e.target.value as any)}
                    className="w-full border rounded-lg px-3 py-2 text-xs bg-white uppercase font-sans focus:outline-none"
                  >
                    <option value="all">Private Users & Group chats</option>
                    <option value="users">Private users only</option>
                    <option value="groups">Group Chats only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Campaign message (Supports Markdown)</label>
                  <textarea 
                    value={bcMessage}
                    onChange={(e) => setBcMessage(e.target.value)}
                    rows={5}
                    placeholder="Type customized telegram broadcast notification text here..."
                    className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg text-xs hover:bg-indigo-700 cursor-pointer transition flex items-center justify-center"
                >
                  📡 Dispatch Local Campaign
                </button>
              </form>
            </div>
          )}

          {/* TAB 6: Users & Groups list */}
          {activeTab === 'users_groups' && (
            <div className="space-y-6">
              {/* Search Control Board */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Users className="w-5 h-5 text-indigo-600" /> Users & Groups Management
                  </h3>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Below are all active private chats and groups chatting with your cloned bot.</p>
                </div>
                <div className="w-full md:w-72">
                  <input 
                    type="text"
                    placeholder="Search by ID, title, or username..."
                    value={ugSearchQuery}
                    onChange={(e) => setUgSearchQuery(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-xs bg-gray-50 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Grid Containers representing target classes */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* Users Column */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 space-y-4">
                  <h4 className="font-extrabold text-xs text-gray-900 border-b pb-2 uppercase tracking-wide text-indigo-950 flex items-center gap-1.5">
                    👤 Private Users ({usersList.length})
                  </h4>
                  {usersList.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No direct private users have interacted with this bot yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {usersList.map(u => {
                        const isBanned = botDetail?.bannedUsers?.includes(u.telegramId);
                        return (
                          <div key={u.telegramId} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
                            <div>
                              <p className="font-semibold text-xs text-gray-800">{u.firstName || 'User'} {u.username && <span className="text-indigo-600 font-mono text-[10px]">@{u.username}</span>}</p>
                              <p className="font-mono text-[9px] text-gray-400">Telegram ID: <span className="text-gray-600 font-bold">{u.telegramId}</span></p>
                              {u.commandCredits && u.commandCredits.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <span className="text-[8px] text-gray-400 uppercase tracking-widest block w-full">Daily Limits overrides:</span>
                                  {u.commandCredits.map((cc: any) => (
                                    <span key={cc.command} className="bg-indigo-50 text-indigo-700 text-[8px] font-mono px-1 rounded font-bold">{cc.command}: {cc.dailyLimit}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1.5 items-center">
                              {/* Credit editor button */}
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setEditCreditsCommand(defaultCommands[0]?.command || '');
                                  const cc = u.commandCredits?.find((x: any) => x.command === (defaultCommands[0]?.command || ''));
                                  setEditCreditsAmount(cc ? cc.dailyLimit : (defaultCommands[0]?.defaultDailyCredits || 0));
                                }}
                                className="bg-white border text-[10px] py-1 px-2.5 rounded-md text-gray-700 hover:bg-gray-150 cursor-pointer text-center font-semibold"
                              >
                                💳 Edit Credits
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
                                    setErrorMsg(e.response?.data?.error || 'Failed to ban/unban user');
                                  }
                                }}
                                className={`text-[10px] py-1 px-2.5 rounded-md font-bold cursor-pointer text-center text-white transition
                                  ${isBanned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                              >
                                {isBanned ? 'Lift Ban' : 'Ban User'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Groups Column */}
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 space-y-4">
                  <h4 className="font-extrabold text-xs text-gray-900 border-b pb-2 uppercase tracking-wide text-indigo-950 flex items-center gap-1.5">
                    👥 Group Chats ({groupsList.length})
                  </h4>
                  {groupsList.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No group chats have registered this bot yet.</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {groupsList.map(g => {
                        const isBanned = botDetail?.bannedGroups?.includes(g.telegramId);
                        return (
                          <div key={g.telegramId} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
                            <div>
                              <p className="font-semibold text-xs text-gray-800">{g.title || 'Untitled Group'}</p>
                              <p className="font-mono text-[9px] text-gray-400">Chat ID: <span className="text-gray-600 font-bold">{g.telegramId}</span></p>
                            </div>
                            <div className="flex gap-1.5 items-center">
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
                                    setErrorMsg(e.response?.data?.error || 'Failed to ban/unban group');
                                  }
                                }}
                                className={`text-[10px] py-1 px-2.5 rounded-md font-bold cursor-pointer text-center text-white transition
                                  ${isBanned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                              >
                                {isBanned ? 'Lift Ban' : 'Ban Group'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* User Credits Management Modal */}
              {editingUser && (
                <div className="fixed inset-0 bg-indigo-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-2xl max-w-sm w-full p-6 border shadow-xl space-y-4">
                    <div>
                      <h4 className="text-sm font-extrabold text-gray-900">Custom Credits Configuration</h4>
                      <p className="text-[10px] text-gray-400 font-medium">Modify custom common credits for direct interaction or specify command limits.</p>
                    </div>

                    <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 text-[11px] text-gray-700 font-medium font-sans">
                      <span className="font-bold text-gray-900">Target Member:</span> {editingUser.firstName} {editingUser.username && <span>(@{editingUser.username})</span>}
                      <br />
                      <span className="font-bold text-gray-900 font-mono">ID:</span> {editingUser.telegramId}
                    </div>

                    <div className="space-y-3 font-sans">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-indigo-950 block mb-1">Target Command</label>
                        <select
                          value={editCreditsCommand}
                          onChange={(e) => {
                            setEditCreditsCommand(e.target.value);
                            const cc = editingUser.commandCredits?.find((x: any) => x.command === e.target.value);
                            setEditCreditsAmount(cc ? cc.dailyLimit : (defaultCommands.find(c => c.command === e.target.value)?.defaultDailyCredits || 0));
                          }}
                          className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {defaultCommands.map(c => (
                            <option key={c.command} value={c.command}>{c.command} (Default: {c.defaultDailyCredits})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-indigo-950 block mb-1">Daily Limit Override Amount</label>
                        <input 
                          type="number"
                          value={editCreditsAmount}
                          onChange={(e) => setEditCreditsAmount(Number(e.target.value))}
                          className="w-full border rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 150"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <button
                        onClick={() => setEditingUser(null)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveUserCredits}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer transition"
                      >
                        Save Overrides
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: Detailed Purchasing & Plan Upgrades page */}
          {activeTab === 'shop' && (() => {
            const availablePlans = registeredTiers.filter(t => t.id !== 'free');
            const p = availablePlans[planSlideIndex];

            return (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
                  <div className="border-b pb-4 mb-6">
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-1.5">
                      <Award className="w-5 h-5 text-indigo-600" /> Professional Subscription Elevators
                    </h3>
                    <p className="text-xs text-gray-400 font-medium mt-1">
                      Upgrade your mirrored instance to unlock extended limits, bespoke command parameters, custom brand logs, and larger force join capabilities!
                    </p>
                  </div>

                  {/* Modern Tab Selector with animated spring highlight background */}
                  {availablePlans.length > 0 && (
                    <div className="flex justify-center border-b border-gray-100 pb-4 gap-2 relative bg-gray-50/70 p-1.5 rounded-xl max-w-md mx-auto mb-6">
                      {availablePlans.map((item, idx) => {
                        const isSelected = planSlideIndex === idx;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSliderDirection(idx > planSlideIndex ? 1 : -1);
                              setPlanSlideIndex(idx);
                            }}
                            className={`relative px-4 py-2 text-xs font-black uppercase tracking-wider transition rounded-lg cursor-pointer select-none z-10 w-full text-center
                              ${isSelected ? 'text-white font-extrabold' : 'text-gray-500 hover:text-indigo-600'}`}
                          >
                            {isSelected && (
                              <motion.div
                                layoutId="activePlanTab"
                                className="absolute inset-0 bg-indigo-600 rounded-lg -z-10"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              />
                            )}
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Horizontal Sliding Display Cards */}
                  {availablePlans.length > 0 && p && (
                    <div className="relative flex items-center justify-between gap-4 max-w-xl mx-auto">
                      {/* Left Slide Button */}
                      <button
                        onClick={() => {
                          const newIdx = (planSlideIndex - 1 + availablePlans.length) % availablePlans.length;
                          setSliderDirection(-1);
                          setPlanSlideIndex(newIdx);
                        }}
                        className="p-2 border border-gray-100 rounded-full hover:bg-gray-100 text-gray-600 hover:text-indigo-605 cursor-pointer transition shrink-0 select-none hidden sm:block w-9 h-9 flex items-center justify-center font-bold"
                        title="Previous Plan"
                      >
                        ◀
                      </button>

                      {/* Sliding Area */}
                      <div className="w-full relative overflow-hidden min-h-[440px] flex flex-col items-center justify-center p-1">
                        <AnimatePresence initial={false} custom={sliderDirection} mode="wait">
                          <motion.div
                            key={p.id}
                            custom={sliderDirection}
                            variants={{
                              enter: (direction: number) => ({
                                x: direction > 0 ? 150 : -150,
                                opacity: 0,
                                scale: 0.96
                              }),
                              center: {
                                x: 0,
                                opacity: 1,
                                scale: 1,
                                transition: { duration: 0.35, ease: "easeOut" }
                              },
                              exit: (direction: number) => ({
                                x: direction < 0 ? 150 : -150,
                                opacity: 0,
                                scale: 0.96,
                                transition: { duration: 0.3 }
                              })
                            }}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="w-full"
                          >
                            {(() => {
                              const isCurrent = botDetail?.plan === p.id;
                              return (
                                <div className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-300 relative overflow-hidden bg-white
                                  ${isCurrent 
                                    ? 'border-indigo-600 bg-indigo-50/10 ring-2 ring-indigo-600/30' 
                                    : 'border-gray-200 shadow-sm hover:shadow-md'}`}
                                >
                                  {isCurrent && (
                                    <span className="absolute top-3 right-3 bg-indigo-600 text-white font-mono text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-xs">
                                      ✨ Active Plan
                                    </span>
                                  )}

                                  <div className="space-y-4 font-sans">
                                    <div>
                                      <span className="font-extrabold text-[10px] uppercase text-indigo-650 tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">{p.id} Plan</span>
                                      <h4 className="font-black text-xl text-gray-900 mt-2">{p.name}</h4>
                                      <p className="text-3xl font-black text-gray-950 font-mono mt-1.5 flex items-baseline">
                                        ₹{p.price}
                                        <span className="text-xs font-semibold text-gray-400 ml-1">/ Month</span>
                                      </p>
                                    </div>

                                    <div className="divide-y divide-gray-100 text-[11.5px] text-gray-650 space-y-0.5">
                                      <div className="py-2.5 flex justify-between">
                                        <span className="font-medium">Force Channel Subscriptions:</span>
                                        <span className="font-extrabold text-gray-900 font-mono">{p.maxChannels} channels</span>
                                      </div>
                                      <div className="py-2.5 flex justify-between">
                                        <span className="font-medium">Daily Target Broadcast Message Limits:</span>
                                        <span className="font-extrabold text-gray-900 font-mono">{p.broadcastLimit} users</span>
                                      </div>
                                      <div className="py-2.5 flex justify-between">
                                        <span className="font-medium">Monthly Integration Points:</span>
                                        <span className="font-extrabold text-indigo-600 font-mono">
                                          {p.id === 'silver' ? '50,000 / mo' : ''}
                                          {p.id === 'gold' ? '200,000 / mo' : ''}
                                          {p.id === 'max' ? '1,500,000 / mo' : ''}
                                          {!['silver', 'gold', 'max'].includes(p.id) ? '10,000 / mo' : ''}
                                        </span>
                                      </div>
                                      <div className="py-2.5 flex justify-between bg-emerald-50/45 px-2.5 rounded-lg border border-emerald-100/40 my-1 items-center">
                                        <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                                          <Coins className="w-3.5 h-3.5 text-emerald-600" /> Webshop Commission Share:
                                        </span>
                                        <span className="font-black text-emerald-700 text-xs font-mono">
                                          {p.id === 'silver' ? '35% Share' : ''}
                                          {p.id === 'gold' ? '50% Share' : ''}
                                          {p.id === 'max' ? '70% Share' : ''}
                                          {!['silver', 'gold', 'max'].includes(p.id) ? '20% Share' : ''}
                                        </span>
                                      </div>
                                      <div className="py-3 text-[10.5px] text-gray-500 leading-relaxed italic">
                                        💡 {p.desc || 'Premium privilege access parameter controls & automated multi-join force checkers.'}
                                      </div>
                                    </div>

                                    {p.editableCommands && p.editableCommands.length > 0 && (
                                      <div className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-3.5 space-y-1.5">
                                        <p className="text-[9.5px] uppercase font-black text-indigo-900 tracking-wider">Custom Limit Overrides</p>
                                        <div className="grid grid-cols-1 gap-1.5 font-mono text-[10px] text-gray-600">
                                          {p.editableCommands.map((ec: any) => (
                                            <div key={ec.command} className="flex justify-between items-center border-b border-dashed border-gray-100 pb-1">
                                              <span>{ec.command}</span>
                                              <span className="font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-100">Up to {ec.maxLimit} / day</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-6">
                                    <button
                                      onClick={() => {
                                        setCheckoutPlan(p);
                                        setPayError('');
                                        setPaySuccess('');
                                        setUtrInput('');
                                      }}
                                      className={`w-full font-extrabold py-2.5 px-4 rounded-xl text-xs cursor-pointer tracking-wider text-center transition shadow-xs select-none
                                        ${isCurrent 
                                          ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100' 
                                          : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md'}`}
                                    >
                                      {isCurrent ? '🔄 Extend Subscription Plan (30 Days)' : `🚀 Choose ${p.name}`}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      {/* Right Slide Button */}
                      <button
                        onClick={() => {
                          const newIdx = (planSlideIndex + 1) % availablePlans.length;
                          setSliderDirection(1);
                          setPlanSlideIndex(newIdx);
                        }}
                        className="p-2 border border-gray-100 rounded-full hover:bg-gray-100 text-gray-600 hover:text-indigo-650 cursor-pointer transition shrink-0 select-none hidden sm:block w-9 h-9 flex items-center justify-center font-bold"
                        title="Next Plan"
                      >
                        ▶
                      </button>
                    </div>
                  )}

                  {/* Dots Indicator */}
                  {availablePlans.length > 0 && (
                    <div className="flex justify-center gap-1.5 mt-2">
                      {availablePlans.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSliderDirection(idx > planSlideIndex ? 1 : -1);
                            setPlanSlideIndex(idx);
                          }}
                          className={`w-2 h-2 rounded-full transition cursor-pointer select-none
                            ${idx === planSlideIndex ? 'bg-indigo-600 scale-125' : 'bg-gray-200 hover:bg-gray-350'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* UPI Checkout Screen Portal Modal */}
                {checkoutPlan && (() => {
                  const upiUrl = `upi://pay?pa=alkhkumar@fam&pn=Encore%20Xosint&am=${checkoutPlan.price}&cu=INR&tn=${encodeURIComponent(`Upgrade to ${checkoutPlan.name} Tier`)}`;
                  return (
                    <div className="fixed inset-0 bg-indigo-950/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans animate-fade-in">
                      <div className="bg-white rounded-2xl max-w-sm w-full p-6 border shadow-2xl space-y-4 text-left max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start border-b pb-2">
                          <div>
                            <h4 className="font-extrabold text-sm text-gray-950">Secure UPI Checkout Terminal</h4>
                            <p className="text-[10px] text-gray-450 font-semibold uppercase tracking-wider">{checkoutPlan.name} Subscription Plan</p>
                            <div className="mt-1 bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5 text-[9px] font-black w-fit uppercase font-mono">
                              {checkoutPlan.id === 'silver' ? 'Contains 50,000 Points/mo' : ''}
                              {checkoutPlan.id === 'gold' ? 'Contains 200,000 Points/mo' : ''}
                              {checkoutPlan.id === 'max' ? 'Contains 1,500,000 Points/mo' : ''}
                              {!['silver', 'gold', 'max'].includes(checkoutPlan.id) ? 'Contains 10,000 Points/mo' : ''}
                            </div>
                          </div>
                          <button 
                            onClick={() => setCheckoutPlan(null)}
                            className="p-1 hover:bg-gray-100 rounded-full font-bold text-gray-400 hover:text-gray-700 text-xs cursor-pointer select-none"
                          >
                            ✕ Close
                          </button>
                        </div>

                        {/* QR Code Section */}
                        <div className="flex flex-col items-center justify-center space-y-2 border pb-4 bg-gray-50/50 rounded-xl p-4 border-gray-100">
                          <span className="text-[9px] uppercase font-black text-indigo-900 tracking-wider">Scan QR Code to Pay ₹{checkoutPlan.price}</span>
                          <div className="flex items-center justify-center bg-white p-2.5 rounded-2xl border border-gray-200/80 shadow-md relative w-44 h-44">
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(upiUrl)}`}
                              alt="UPI QR Code"
                              className="w-40 h-40 block"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <p className="text-[9px] text-gray-400 font-medium italic text-center px-2 leading-normal">
                            Scan with Google Pay, PhonePe, Paytm, FamPay, or any BHIM UPI Application.
                          </p>
                        </div>

                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 text-gray-700 space-y-2 text-xs text-center">
                          <p className="font-bold text-indigo-950 uppercase tracking-widest text-[8px]">Direct Payment Application Trigger</p>
                          <a 
                            href={upiUrl}
                            className="inline-block bg-indigo-650 text-white font-extrabold tracking-wide rounded-lg px-4 py-1.5 text-xs hover:bg-indigo-700 transition"
                          >
                            Pay ₹{checkoutPlan.price} instantly in UPI App
                          </a>

                          <p className="text-[10px] text-gray-400 font-medium pt-1">Or manual address transfer:</p>
                          <div className="bg-white border text-xs rounded px-3 py-1 font-mono text-center font-bold text-gray-800 w-full mx-auto max-w-[180px]">
                            alkhkumar@fam
                          </div>
                        </div>

                        <div className="space-y-3.5">
                          <div className="border border-amber-150 bg-amber-50 rounded-xl p-3 text-[10px] text-amber-900 leading-relaxed font-semibold">
                            ⚠️ DOUBLE-SPEND REACTION SYSTEM ACTIVE: Ensure you copy-paste the exact 12-digit transaction ID / UTR hash from your UPI application after successful transfer. Simulated transactions are automatically filtered.
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-indigo-950 block">UPI Transaction UTR / Ref (12-Digit ID)</label>
                            <input 
                              type="text"
                              placeholder="e.g. 614050212984"
                              value={utrInput}
                              onChange={(e) => setUtrInput(e.target.value.replace(/\D/g, '').substring(0, 12))}
                              className="w-full border rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <p className="text-[9px] text-gray-400">Must be exactly a 12-digit UPI number sequence.</p>
                          </div>

                          {payError && (
                            <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-[10px] rounded-lg font-bold">
                              ❌ {payError}
                            </div>
                          )}

                          {paySuccess && (
                            <div className="p-3 bg-green-50 border border-green-100 text-green-800 text-[10px] rounded-lg font-bold font-sans">
                              🎉 {paySuccess}
                            </div>
                          )}

                          <div className="flex gap-2 justify-end pt-2 border-t font-sans">
                            <button
                              onClick={() => setCheckoutPlan(null)}
                              disabled={paymentProcessing}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleVerifySubPayment(checkoutPlan.id, checkoutPlan.price)}
                              disabled={paymentProcessing}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1"
                            >
                              {paymentProcessing ? 'Verifying payment...' : 'Verify Transfer & Activate'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* TAB 7: Wallet & Earnings */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              
              {/* Wallet Summary Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="bg-white border rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-black text-gray-400">Withdrawable Balance</span>
                    <p className="text-2xl font-black text-gray-900 font-mono">₹{wallet?.balance ?? '0.00'}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">Min. withdrawal: ₹100</p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full">
                    <Wallet className="w-5 h-5 stroke-2" />
                  </div>
                </div>

                <div className="bg-white border rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-black text-gray-400">Total Commissions Earned</span>
                    <p className="text-2xl font-black text-indigo-700 font-mono">₹{wallet?.totalEarned ?? '0.00'}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">Based on your current plan</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-full">
                    <Coins className="w-5 h-5 stroke-2" />
                  </div>
                </div>

                <div className="bg-white border rounded-2xl p-5 shadow-xs flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-black text-gray-400">Total Settled (Withdrawn)</span>
                    <p className="text-2xl font-black text-gray-800 font-mono">₹{wallet?.totalWithdrawn ?? '0.00'}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">Transferred securely via UPI</p>
                  </div>
                  <div className="bg-slate-100 text-slate-700 p-3.5 rounded-full">
                    <Landmark className="w-5 h-5 stroke-2" />
                  </div>
                </div>

              </div>

              {/* Commission Details alert/guideline */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-xs text-indigo-900 leading-relaxed space-y-1 font-semibold">
                <p className="font-extrabold uppercase text-[10px] text-indigo-950 flex items-center gap-1.5 mb-1.5 animate-pulse">
                  <Award className="w-4 h-4 text-indigo-700 animate-spin" /> Mirror Commission Distribution Rules:
                </p>
                <p>As a mirror bot owner, you earn direct commission shares from any and all shop credit/package purchases processed within your cloned bot! Commission share percentages scale based on your subscription tier:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 font-mono text-[11px] text-center">
                  <div className="bg-white border rounded-lg p-2 shadow-xs">
                    <p className="text-gray-400 font-sans font-bold uppercase text-[9px]">Free Plan</p>
                    <p className="text-gray-800 font-extrabold text-sm">20% Share</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded-lg p-2 shadow-xs">
                    <p className="text-blue-500 font-sans font-bold uppercase text-[9px]">Silver Plan</p>
                    <p className="text-blue-700 font-extrabold text-sm">35% Share</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 text-amber-900 rounded-lg p-2 shadow-xs">
                    <p className="text-amber-500 font-sans font-bold uppercase text-[9px]">Gold Plan</p>
                    <p className="text-amber-700 font-extrabold text-sm">50% Share</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 text-purple-900 rounded-lg p-2 shadow-xs">
                    <p className="text-purple-500 font-sans font-bold uppercase text-[9px]">Max Plan</p>
                    <p className="text-purple-700 font-extrabold text-sm">70% Share</p>
                  </div>
                </div>
                <p className="text-[10px] text-indigo-650 italic font-medium pt-2">Upgrade your plan at any time to instantly trigger higher percentage payouts for subsequent sales!</p>
              </div>

              {/* Submit Withdrawal Request Form & Wallet history */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Request form */}
                <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4 md:col-span-1">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase">Submit Withdrawal</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">Submit your UPI ID to request a manual bank payout of your earnings.</p>
                  </div>

                  <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500">BHIM UPI Address (VPA)</label>
                      <input 
                        type="text"
                        required
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="e.g. yourname@ybl or upiid@upi"
                        className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500">Withdrawal Amount (₹)</label>
                      <input 
                        type="number"
                        required
                        min="100"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Min ₹100"
                        className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {withdrawError && (
                      <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-[10px] rounded-lg font-bold">
                        ❌ {withdrawError}
                      </div>
                    )}

                    {withdrawSuccess && (
                      <div className="p-3 bg-green-50 border border-green-100 text-green-800 text-[10px] rounded-lg font-bold font-sans">
                        🎉 {withdrawSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={withdrawLoading || !withdrawAmount || !upiId}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs p-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {withdrawLoading ? 'Submitting request...' : 'Submit Payout Request'}
                    </button>
                  </form>
                </div>

                {/* Wallet History */}
                <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4 md:col-span-2">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase">Wallet Ledger & History</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">Logs of earnings and withdrawal transactions.</p>
                  </div>

                  {walletLoading ? (
                    <div className="h-44 flex items-center justify-center font-bold text-gray-300 text-xs uppercase tracking-wider">
                      REFRESHING LEDGER ...
                    </div>
                  ) : !wallet || !wallet.history || wallet.history.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center border border-dashed rounded-xl bg-gray-50/50 text-gray-400">
                      <Clock className="w-7 h-7 text-gray-300 stroke-1 mb-1.5" />
                      <p className="text-xs font-semibold">No transactions recorded in wallet ledger yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto max-h-[300px] border rounded-xl divide-y">
                      {[...wallet.history].reverse().map((h: any, idx: number) => {
                        const isIncome = h.amount > 0;
                        return (
                          <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50 transition">
                            <div className="space-y-1 select-none pr-3">
                              <p className="font-semibold text-gray-800 leading-snug">{h.description || 'Earnings Commission Share'}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{new Date(h.date).toLocaleString()}</p>
                            </div>
                            
                            <div className="text-right shrink-0 space-y-1 font-mono">
                              <p className={`font-black text-xs ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isIncome ? '+' : ''}₹{h.amount}
                              </p>
                              {h.status !== 'N/A' && (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase
                                  ${h.status === 'Pending' ? 'bg-amber-100 text-amber-800' : ''}
                                  ${h.status === 'Paid' ? 'bg-green-100 text-green-800' : ''}
                                  ${h.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : ''}
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

        </div>
        {showPointsHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative overflow-hidden border border-gray-100">
              <h3 className="text-base font-black text-gray-900 border-b pb-3 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                About Integration Points
              </h3>

              <div className="text-xs text-gray-600 space-y-3 font-medium select-none">
                <p>
                  <strong>What are Integration Points?</strong><br />
                  Integration Points are monthly resource tokens used to scale and rate-limit cloned bots in the Mirror system. They keep the servers blazing fast for everyone!
                </p>
                <p>
                  <strong>How does consumption work?</strong><br />
                  Every successfully validated command (such as built-in lookups or custom-added API endpoints) processed by your cloned bot consumes exactly <strong>1 Integration point</strong>.
                </p>
                <p>
                  <strong>What are the Monthly Allowances?</strong>
                </p>
                <div className="space-y-1 bg-gray-50 p-3 rounded-lg border border-gray-100 font-mono text-[11px] text-gray-800">
                  <div className="flex justify-between">
                    <span>FREE PLAN:</span>
                    <span className="font-bold">10,000 / month</span>
                  </div>
                  <div className="flex justify-between text-indigo-600">
                    <span>SILVER PLAN:</span>
                    <span className="font-bold">50,000 / month</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>GOLD PLAN:</span>
                    <span className="font-bold font-sans font-medium">200,000 / month</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>MAX PLAN:</span>
                    <span className="font-bold">1,500,000 / month</span>
                  </div>
                </div>
                <p>
                  <strong>Auto-Stop & Reset Safeguards:</strong><br />
                  If your bot consumes 100% of its monthly allowance, it will <strong>auto-stop</strong> and remain suspended for the remainder of the calendar month to protect system resources. 
                  It will <strong>automatically resume</strong> at the beginning of the next month. Alternatively, you can upgrade your plan to immediately raise the cap!
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-2 text-xs font-bold font-sans">
                <button
                  type="button"
                  onClick={() => setShowPointsHelpModal(false)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition cursor-pointer select-none"
                >
                  Got it, thanks!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
