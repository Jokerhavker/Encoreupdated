import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Bot, Key, Shield, Radio, Plus, Trash2, Edit3, 
  CheckCircle2, Ban, Users, Settings, Award, 
  AlertTriangle, Zap, ExternalLink, RefreshCw, XCircle, ListFilter
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'commands' | 'bans' | 'broadcast'>('overview');

  // Loading & Messages
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
        setCustomBotName(res.data.bot.customBotName || '');
        setDefaultGroupCredits(res.data.bot.defaultGroupCredits || 50);
        setIsAuthenticated(true);
        localStorage.setItem('mirror_bot_token', botToken);
        if (res.data.bot.ownerTelegramId) {
          localStorage.setItem('mirror_owner_id', res.data.bot.ownerTelegramId);
          setOwnerTelegramId(res.data.bot.ownerTelegramId);
          fetchOwnedBots(res.data.bot.ownerTelegramId);
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

  // Change tier (mock pricing experience so users can fully test Silver, Gold and Max features!)
  const switchExperiencePlan = async (planTier: 'free' | 'silver' | 'gold' | 'max') => {
    if (!botDetail) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      // Directly update plan on mirror-bots configuration using post endpoint
      const res = await axios.post('/api/mirror-bots', {
        token: botDetail.token,
        ownerTelegramId: botDetail.ownerTelegramId,
        plan: planTier
      });
      if (res.data?.success) {
        setSuccessMsg(`Plan tier upgraded successfully to ${planTier.toUpperCase()}! Try experiencing all limited features.`);
        await loadBotProfile(botDetail.token);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Could not upgrade experience tier.');
    }
    setLoading(false);
  };

  // Toggle dynamic active bot poller state
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
        setSuccessMsg(nextState ? "Mirrored Bot Poller started and online!" : "Mirrored bot poller stopped and offline.");
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

  // Ban management
  const handleBanManage = async (isBanned: boolean) => {
    if (!botDetail) return;
    if (!banId.trim()) {
      setErrorMsg('Please specify some Telegram User or Group ID.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await axios.post('/api/mirror-bots/ban', {
        token: botDetail.token,
        id: banId.trim(),
        type: banType,
        isBanned
      });

      if (res.data?.success) {
        setSuccessMsg(isBanned ? `ID ${banId} banned successfully from your bot!` : `ID ${banId} has been unbanned.`);
        setBotDetail({
          ...botDetail,
          bannedUsers: res.data.bannedUsers,
          bannedGroups: res.data.bannedGroups
        });
        setBanId('');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Ban state failed.');
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
    <div className="max-w-5xl mx-auto space-y-6 pt-4 pb-8">
      
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
            {botDetail?.isActive ? "Poller : Active" : "Poller : Paused"}
          </button>

          <button
            onClick={handleExitBotSession}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Disconnect Bot
          </button>
        </div>
      </div>

      {/* Experience Plan Simulator Ribbon */}
      <div className="bg-indigo-900 text-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 font-medium">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> Experience Plan Simulator
          </p>
          <p className="text-[11px] text-indigo-100 font-light pr-2">
            Pricing mock toggle: easily switch plan tiers to test and evaluate features/limitations of each subscription tier!
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(['free', 'silver', 'gold', 'max'] as const).map((p) => (
            <button
              key={p}
              onClick={() => switchExperiencePlan(p)}
              disabled={loading}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md tracking-wider transition cursor-pointer border
                ${activePlan === p 
                  ? 'bg-white text-indigo-950 border-white font-extrabold scale-105' 
                  : 'bg-indigo-800 text-indigo-200 border-indigo-700 hover:bg-indigo-700'}`}
            >
              {p}
            </button>
          ))}
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
            <Bot className="w-4 h-4 shrink-0" /> Status Overview
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-4 h-4 shrink-0" /> Branding & Force-Join
          </button>

          <button
            onClick={() => setActiveTab('commands')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'commands' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Zap className="w-4 h-4 shrink-0" /> Commands Console
          </button>

          <button
            onClick={() => setActiveTab('bans')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'bans' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Ban className="w-4 h-4 shrink-0" /> Ban ID Terminal
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2.5 cursor-pointer
              ${activeTab === 'broadcast' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Radio className="w-4 h-4 shrink-0" /> Local Broadcast
          </button>
        </div>

        {/* Tab Canvas Content */}
        <div className="lg:col-span-3 space-y-6">

          {/* TAB 1: Status Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Stats highlights */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-500" /> Bot Private Users
                  </p>
                  <p className="text-2xl font-black text-gray-800 font-mono">{botStats.totalUsers || 0}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Interacted private channels</p>
                </div>

                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                     <Settings className="w-3.5 h-3.5 text-indigo-500" /> Bot Group Chats
                  </p>
                  <p className="text-2xl font-black text-gray-800 font-mono">{botStats.totalGroups || 0}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">Groups actively tracked</p>
                </div>
              </div>

              {/* Core Limits list bento style */}
              <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b pb-3 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-indigo-600" />
                  Subscription Plan Features Allocation Check:
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
                      New Groups Initial Gift Credits
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
                        <button onClick={() => switchExperiencePlan('silver')} className="text-indigo-600 font-extrabold hover:underline ml-1 block mt-1">
                          ⚡ Experience SILVER instantly for free!
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
                    <ListFilter className="w-4 h-4 text-indigo-600" /> Default Commands Exclusion Panel
                  </h3>
                  <span className="text-[10px] text-gray-500 font-bold uppercase select-none">
                    Core commands list
                  </span>
                </div>

                <p className="text-[11.5px] text-gray-500 leading-relaxed leading-normal">
                  Toggle switch to temporarily exclude specific core commands on your bot clone. All user credits deduction systems remain fully synchronized to prevent double balances.
                </p>

                {activePlan === 'free' ? (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 leading-relaxed">
                    <strong>Free Tier restrictions:</strong> In commands, free plan users can see Command Name and Global Credits. Excluding commands or custom limit overriding requires upgrade!
                    <button onClick={() => switchExperiencePlan('silver')} className="text-indigo-600 font-extrabold hover:underline block mt-1">
                      ⚡ Quick experience upgrade to SILVER
                    </button>
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  {defaultCommands.map((cmd) => {
                    const isEx = !!(botDetail?.excludedCommands || []).includes(cmd.command);
                    return (
                      <div key={cmd.command} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border text-xs">
                        <div>
                          <p className={`font-mono font-bold ${isEx ? 'text-gray-400 line-through' : 'text-gray-950'}`}>
                            {cmd.command}
                          </p>
                          <p className="text-[10px] text-gray-400 font-medium">Credits Cost: *{cmd.defaultDailyCredits || 0}* credits</p>
                        </div>

                        {activePlan !== 'free' && (
                          <button
                            onClick={() => handleToggleCommandActive(cmd.command, isEx)}
                            disabled={loading}
                            className={`px-3 py-1 rounded text-[10px] font-bold border transition cursor-pointer
                              ${isEx 
                                ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                                : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                          >
                            {isEx ? 'In-Active (Clonal Excluded)' : 'Active (Online)'}
                          </button>
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

          {/* TAB 4: Bans Terminal */}
          {activeTab === 'bans' && (
            <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-4">
              <div className="border-b pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Ban className="w-5 h-5 text-indigo-600" /> Banned Users & groups configuration
                </h3>
                <p className="text-[10px] text-gray-400 font-medium mt-1">Enforce customized bans specifically on your mirrored bot clone without affecting main server global parameters.</p>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3.5 border text-xs">
                  <div className="flex flex-wrap gap-4">
                    <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">🛡️ Active Banned lists:</p>
                    <span className="font-mono bg-white border border-gray-200 px-2 py-0.5 rounded text-[10px]">
                      👤 Users: <strong>{(botDetail?.bannedUsers || []).length}</strong>
                    </span>
                    <span className="font-mono bg-white border border-gray-200 px-2 py-0.5 rounded text-[10px]">
                      👥 Groups: <strong>{(botDetail?.bannedGroups || []).length}</strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-750 mb-1">Target ID (User Telegram Numeric ID or Chat ID)</label>
                    <input 
                      type="text" 
                      value={banId}
                      onChange={(e) => setBanId(e.target.value)}
                      placeholder="e.g. 52930219"
                      className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-750 mb-1">Target Chat Type</label>
                    <select 
                      value={banType}
                      onChange={(e) => setBanType(e.target.value as any)}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none"
                    >
                      <option value="user">User Chat ID (Private)</option>
                      <option value="group">Group Broadcast ID</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => handleBanManage(true)}
                    disabled={loading}
                    className="bg-red-600 text-white font-bold py-1.5 px-4 rounded text-xs hover:bg-red-700 cursor-pointer transition"
                  >
                    🚫 Block ID
                  </button>

                  <button
                    onClick={() => handleBanManage(false)}
                    disabled={loading}
                    className="bg-indigo-50 text-indigo-700 font-bold py-1.5 px-4 rounded text-xs border border-indigo-100 hover:bg-slate-100 cursor-pointer transition"
                  >
                    🔓 Lift Ban (Permit ID)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Broadcast Tab */}
          {activeTab === 'broadcast' && (
            <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-4">
              <div className="border-b pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Radio className="w-5 h-5 text-indigo-600" /> Draft Mirror Broadcast campaign
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

        </div>
      </div>
    </div>
  );
}
