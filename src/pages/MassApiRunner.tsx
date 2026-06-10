import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { 
  Sparkles, 
  Lock, 
  User, 
  Terminal, 
  Copy, 
  Check, 
  History, 
  AlertCircle, 
  Coins, 
  ExternalLink,
  Cpu, 
  Layers, 
  Activity,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  X,
  Play
} from 'lucide-react';

interface UserProfile {
  telegramId: string;
  username?: string;
  firstName?: string;
  isPremium: boolean;
  premiumTier?: string;
  membershipType: 'TRIAL' | 'BASIC' | 'GOLD' | 'MAX' | null;
  isAdmin: boolean;
}

interface ApiCommand {
  _id: string;
  command: string;
  description?: string;
  isCreditBased: boolean;
  defaultDailyCredits: number;
}

interface ExecutionResult {
  parameter: string;
  output: string;
  success: boolean;
}

interface HistoryItem {
  _id: string;
  commandName: string;
  paramValue: string;
  apiResponse: string;
  timestamp: string;
}

export function MassApiRunner() {
  const [searchParams] = useSearchParams();
  const [userId, setUserId] = useState<string>('');
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string>('');
  
  // Real database states
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [apiCommands, setApiCommands] = useState<ApiCommand[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  
  // Runner form states
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [parametersInput, setParametersInput] = useState<string>('');
  const [running, setRunning] = useState<boolean>(false);
  const [executionMessage, setExecutionMessage] = useState<string>('');
  const [results, setResults] = useState<ExecutionResult[]>([]);
  
  // Copy indicators
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [copiedHistoryIndex, setCopiedHistoryIndex] = useState<string | null>(null);

  // History modal states
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    // 1. Resolve telegram user id from query parameter or webapp context
    let uId = searchParams.get('userid');
    
    // 2. Fallback to Telegram WebApp context
    if (!uId) {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      if (tgUser?.id) {
        uId = String(tgUser.id);
      }
    }

    if (uId) {
      setUserId(uId);
      loadProfile(uId);
    } else {
      // Browser fallback (for preview/testing if needed)
      setUserId('714902844');
      loadProfile('714902844');
    }
  }, [searchParams]);

  const loadProfile = async (tgId: string) => {
    setLoadingProfile(true);
    setProfileError('');
    try {
      const res = await axios.get(`/api/mass-run/profile?telegramId=${tgId}`);
      if (res.data?.success) {
        if (res.data.exists) {
          setUserProfile(res.data.user);
          setApiCommands(res.data.apiCommands || []);
          setLimits(res.data.limits || {});
          if (res.data.apiCommands?.length > 0) {
            setSelectedCommand(res.data.apiCommands[0].command);
          }
        } else {
          setProfileError(res.data.error || 'User profile not found.');
        }
      } else {
        setProfileError(res.data?.error || 'Failed to initialize profile.');
      }
    } catch (err: any) {
      setProfileError(err.response?.data?.error || 'Network error loading profile.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadHistory = async () => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const res = await axios.get(`/api/mass-run/history?telegramId=${userId}`);
      if (res.data?.success) {
        setHistoryItems(res.data.history || []);
      }
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    loadHistory();
  };

  // Extract clean parameters array from the text input
  const getCleanParamsList = (): string[] => {
    return parametersInput
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedCommand) return;

    const paramsList = getCleanParamsList();
    if (paramsList.length === 0) {
      alert('Please enter at least one parameter line.');
      return;
    }

    setRunning(true);
    setExecutionMessage('Verifying credits & limits...');
    setResults([]);

    try {
      const res = await axios.post('/api/mass-run/execute', {
        telegramId: userId,
        command: selectedCommand,
        parameters: paramsList
      });

      if (res.data?.success) {
        setResults(res.data.results || []);
        // Refresh limits & credits dynamically after execution finishes
        loadProfile(userId);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Execution failed. Please check inputs and credits.';
      alert(errorMsg);
    } finally {
      setRunning(false);
      setExecutionMessage('');
    }
  };

  const handleCopyResult = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyHistory = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHistoryIndex(id);
    setTimeout(() => setCopiedHistoryIndex(null), 2000);
  };

  const handleCopyAllResults = () => {
    if (results.length === 0) return;
    const combined = results.map(r => `[${r.parameter}]\n${r.output}`).join('\n\n====================\n\n');
    navigator.clipboard.writeText(combined);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Helper limits for the badge
  const getTierLimitText = (tier: string) => {
    switch(tier) {
      case 'BASIC': return 'Max 10 Parameters';
      case 'GOLD': return 'Max 25 Parameters';
      case 'MAX': return 'Max 50 Parameters';
      default: return 'Max 0 Parameters';
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-6 font-sans">
        <div className="relative flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          <Cpu className="absolute w-5 h-5 text-indigo-400" />
        </div>
        <p className="mt-4 text-sm text-slate-400 font-mono tracking-wider animate-pulse">
          INITIALIZING SECURE TERMINAL...
        </p>
      </div>
    );
  }

  // Error: Profile does not exist 
  if (profileError || !userProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-red-500/10 via-red-500 to-red-500/10"></div>
          
          <div className="bg-red-500/10 p-3 rounded-full w-14 h-14 mx-auto mb-4 flex items-center justify-center border border-red-500/20">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>

          <h3 className="text-xl font-bold text-white mb-2">Security Handshake Failed</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {profileError || 'Unable to connect to your Telegram user credentials. Please ensure you interact with the bot privately first.'}
          </p>

          <div className="bg-slate-950 rounded-xl p-4 mb-6 border border-slate-800 text-left">
            <span className="text-[10px] text-indigo-400 font-mono block tracking-wider uppercase mb-1">Standard Resolution:</span>
            <p className="text-xs text-slate-300 leading-normal">
              1. Open your Telegram Messenger.<br/>
              2. Go to the <strong className="text-white">@TEMPENCOREXBOT</strong> Bot.<br/>
              3. Press the <strong className="text-white">Start / Restart</strong> button.<br/>
              4. Relaunch this workspace tool.
            </p>
          </div>

          <a 
            href="https://t.me/TEMPENCOREXBOT" 
            target="_blank" 
            referrerPolicy="no-referrer"
            className="w-full bg-indigo-600 hover:bg-indigo-700 transition font-bold py-3 px-4 rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/25"
          >
            <span>Open Telegram Bot</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  // Lock Screen: Purchased no membership status
  if (!userProfile.isPremium || !userProfile.membershipType) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle Ambient Background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
          
          <div className="text-center mb-6 relative">
            <div className="bg-indigo-500/10 p-3.5 rounded-2xl w-14 h-14 mx-auto mb-4 flex items-center justify-center border border-indigo-500/30">
              <Lock className="w-7 h-7 text-indigo-400 animate-bounce" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Premium Membership Required</h2>
            <p className="text-slate-400 text-xs mt-1 px-4">
              Unlock the Mass API runner by activating one of our high-limit memberships inside the Shop.
            </p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0 flex items-center justify-center h-9 w-9">
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Mass Sequential Execution</h4>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                  Bulk check and pull values for up to 50 parameters sequentially in a single click in seconds.
                </p>
              </div>
            </div>

            <div className="flex bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0 flex items-center justify-center h-9 w-9">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Advanced API Integration</h4>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                  Full custom parsing of output layout strings and secure proxy servers.
                </p>
              </div>
            </div>

            <div className="flex bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl gap-3">
              <div className="p-2 bg-pink-500/10 rounded-lg shrink-0 flex items-center justify-center h-9 w-9">
                <TrendingUp className="w-4 h-4 text-pink-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Scale Up Custom Limits</h4>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                  Tiers support elevated parallel runs. BASIC allows 10, GOLD allows 25, and MAX allows 50 concurrent paths.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center mb-6">
            <div className="flex items-center justify-center gap-1.5 text-amber-400 mb-0.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-wider">Plan Offline status</span>
            </div>
            <p className="text-[10px] text-slate-300 leading-normal">
              Your registered user profile status is currently: <strong className="text-white">Free Onboarding</strong>.
            </p>
          </div>

          <a 
            href={`https://t.me/TEMPENCOREXBOT?start=shop`}
            target="_blank"
            referrerPolicy="no-referrer"
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 transition font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 text-sm text-white"
          >
            <span>🛒 Open Bot Shop WebApp</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  // TRIAL limit screen
  if (userProfile.membershipType === 'TRIAL') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-amber-500/10 via-amber-500 to-amber-500/10"></div>
          
          <div className="bg-amber-500/10 p-3.5 rounded-full w-14 h-14 mx-auto mb-4 flex items-center justify-center border border-amber-500/20">
            <Sparkles className="w-7 h-7 text-amber-500 animate-pulse" />
          </div>

          <h3 className="text-xl font-bold text-white mb-2">Upgrade Membership Required</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Your current plan is <strong className="text-amber-400">TRIAL MEMBERSHIP</strong>. Trial members are limited to a maximum of <strong className="text-white">0 parameters</strong> inside bulk operations.
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left space-y-2 mb-6">
            <span className="text-[10px] text-indigo-400 font-mono block tracking-wider uppercase">High-Limit Membership tiers:</span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 border border-slate-800 bg-slate-900/50 rounded-lg">
                <strong className="text-white block font-black">Basic</strong>
                <span className="text-[10px] text-slate-400">10 parameters</span>
              </div>
              <div className="p-2 border border-indigo-500/30 bg-indigo-950/20 rounded-lg">
                <strong className="text-indigo-300 block font-black">Gold</strong>
                <span className="text-[10px] text-indigo-200">25 parameters</span>
              </div>
              <div className="p-2 border border-purple-500/30 bg-purple-950/20 rounded-lg">
                <strong className="text-purple-300 block font-black">Max</strong>
                <span className="text-[10px] text-purple-200">50 parameters</span>
              </div>
            </div>
          </div>

          <a 
            href={`https://t.me/TEMPENCOREXBOT?start=shop`}
            target="_blank"
            referrerPolicy="no-referrer"
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 transition font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 text-sm text-white"
          >
            <span>🛒 Upgrade inside Bot Shop</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  // Active Runner screen
  const cleanParamsList = getCleanParamsList();
  const rawParamsCount = cleanParamsList.length;
  
  let membershipLimit = 0;
  if (userProfile.membershipType === 'BASIC') membershipLimit = 10;
  else if (userProfile.membershipType === 'GOLD') membershipLimit = 25;
  else if (userProfile.membershipType === 'MAX') membershipLimit = 50;

  const currentCommandLimit = limits[selectedCommand] !== undefined ? limits[selectedCommand] : 0;
  const isSufficientCredits = currentCommandLimit >= rawParamsCount;
  const isLimitExceeded = rawParamsCount > membershipLimit;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* HEADER CO-ORDINATES */}
      <header className="bg-slate-900 border-b border-slate-800/80 sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600/10 border border-indigo-500/30 p-2 rounded-xl flex items-center justify-center h-10 w-10">
            <Cpu className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white uppercase font-mono">Mass Run Workspace</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border ${
                userProfile.membershipType === 'BASIC' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                userProfile.membershipType === 'GOLD' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse' :
                'bg-purple-500/10 border-purple-500/20 text-purple-400'
              }`}>
                {userProfile.membershipType} MEMBER
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Ref: {userProfile.firstName || userProfile.username || userProfile.telegramId} ({userProfile.telegramId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Coins Display */}
          <div className="bg-slate-950 border border-slate-800 rounded-full py-1 px-2.5 flex items-center gap-1.5 text-xs text-amber-400 font-bold">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono">{limits[selectedCommand] !== undefined ? limits[selectedCommand] : 0} Available Runs</span>
          </div>

          <button
            onClick={handleOpenHistory}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition text-slate-200 hover:text-white flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none"
            title="Command Runs logs history"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Recent Activity</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COMPILER PANEL: INPUT & SETTINGS FORM */}
        <section className="col-span-1 lg:col-span-5 h-fit">
          <form onSubmit={handleExecute} className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl relative overflow-hidden flex flex-col space-y-4">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500/10 via-indigo-500 to-indigo-500/10"></div>
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm tracking-wide text-white uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span>Compiler Configuration</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-mono tracking-wide">
                LIMIT: {membershipLimit} lines / click
              </span>
            </div>

            {/* Choose Command */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">
                1. Select Command Target
              </label>
              {apiCommands.length === 0 ? (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>No configured API commands found.</span>
                </div>
              ) : (
                <select
                  value={selectedCommand}
                  onChange={(e) => setSelectedCommand(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 transition cursor-pointer font-mono"
                >
                  {apiCommands.map((api) => (
                    <option key={api._id} value={api.command}>
                      {api.command} {api.description ? `- ${api.description}` : ''} {api.isCreditBased ? '⚡️' : '🟢'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Input Param text lines */}
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">
                  2. Input Parameters
                </label>
                <button
                  type="button"
                  onClick={() => setParametersInput('')}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition underline cursor-pointer"
                >
                  Clear all lines
                </button>
              </div>

              <textarea
                value={parametersInput}
                onChange={(e) => setParametersInput(e.target.value)}
                placeholder={`Enter parameters (one per line). Examples:\n127.0.0.1\ngoogle.com\n8.8.8.8`}
                className="w-full h-56 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs text-indigo-300 outline-none focus:border-indigo-500 transition resize-none font-mono placeholder:text-slate-700 leading-relaxed"
                disabled={running}
              />
            </div>

            {/* Dynamic Status Counter Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Line Counter:</span>
                <span className={`font-black ${isLimitExceeded ? 'text-red-500' : 'text-emerald-400'}`}>
                  {rawParamsCount} / {membershipLimit} {getTierLimitText(userProfile.membershipType)}
                </span>
              </div>

              {/* Loader Warnings */}
              {rawParamsCount > 0 && (
                <div className="pt-1.5 border-t border-slate-800">
                  {isLimitExceeded ? (
                    <div className="flex items-start gap-1.5 text-[10px] text-red-400 leading-normal">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Your plan limits runs to {membershipLimit} parameters. Please trim/remove some lines or upgrade to process more.
                      </span>
                    </div>
                  ) : !isSufficientCredits ? (
                    <div className="flex items-start gap-1.5 text-[10px] text-amber-400 leading-normal">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-pulse" />
                      <span>
                        Insufficient Credits/Runs! You only have {currentCommandLimit} runs available, but entered {rawParamsCount} parameters.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 text-[10px] text-emerald-400 leading-normal">
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Inputs and credit logs verified successfully. Ready for sequential pipeline.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Process Submission */}
            <button
              type="submit"
              disabled={running || isLimitExceeded || !isSufficientCredits || rawParamsCount === 0}
              className={`w-full font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition ${
                running 
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : isLimitExceeded || !isSufficientCredits || rawParamsCount === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/15'
              }`}
            >
              {running ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-slate-400"></div>
                  <span className="font-mono text-xs uppercase tracking-widest">{executionMessage || 'PROCESSING Sequential PIPELINE...'}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-white" />
                  <span>RUN MASS API SEQUENTIAL COMMANDS</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* RIGHT WORKSPACE OUTPOST: ACTIVE DATA RESULT BOXES */}
        <section className="col-span-1 lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl min-h-[500px] flex flex-col relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-500/10 via-emerald-500 to-emerald-500/10"></div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-sm tracking-wide text-white uppercase flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Compiler output Feed</span>
              </h3>

              {results.length > 0 && (
                <button
                  onClick={handleCopyAllResults}
                  className="text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-200 transition inline-flex items-center gap-1.5 cursor-pointer selection:bg-transparent"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAll ? 'Copied bundle!' : 'Copy Bundle output'}</span>
                </button>
              )}
            </div>

            {/* Main outputs timeline container */}
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[550px] pr-1 scrollbar-thin">
              {results.length === 0 ? (
                <div className="h-[400px] flex flex-col justify-center items-center text-center p-6 text-slate-400">
                  <div className="bg-slate-950 p-4 rounded-full border border-slate-800 mb-4 animate-pulse">
                    <Terminal className="w-8 h-8 text-indigo-500/60" />
                  </div>
                  <h4 className="text-slate-300 font-extrabold text-sm uppercase tracking-wide">Output Grid is Clean</h4>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                    Set your target parameters on the left and dispatch the commands. Processed JSON output feeds will materialize sequentially here line-by-line.
                  </p>
                </div>
              ) : (
                results.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden shadow-inner transition-all hover:border-slate-750 flex flex-col relative"
                  >
                    {/* Header bar of output box */}
                    <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800/80 px-4 py-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <strong className="text-xs text-slate-200 font-mono">
                          Param: <span className="text-indigo-400">{item.parameter}</span>
                        </strong>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider border shrink-0 ${
                          item.success 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                          {item.success ? 'Success' : 'Error response'}
                        </span>

                        <button
                          onClick={() => handleCopyResult(item.output, idx)}
                          className="p-1 bg-slate-950 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer select-none"
                          title="Copy block text"
                        >
                          {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Content area */}
                    <div className="p-4 overflow-x-auto">
                      <pre className="text-xs font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap font-normal select-text">
                        {item.output || 'No API Output payload captured.'}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="py-6 border-t border-slate-900 bg-slate-950 text-center text-[10px] text-slate-500 font-mono tracking-wider">
        DEVELOPED BY SECURE INTEGRATOR • PLATFORM 2026 UTC
      </footer>

      {/* HISTORY MODAL DIALOG */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500/10 via-indigo-500 to-indigo-500/10"></div>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <h3 className="font-extrabold text-sm uppercase text-white tracking-wider">Execution Log history</h3>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content logs list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingHistory ? (
                <div className="h-[250px] flex flex-col justify-center items-center text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
                  <p className="mt-3 text-xs font-mono tracking-wide">PULLING ACTIVITY LOGS...</p>
                </div>
              ) : historyItems.length === 0 ? (
                <div className="h-[250px] flex flex-col justify-center items-center text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
                  <h4 className="text-slate-300 font-bold text-xs uppercase">No historical runs recorded</h4>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                    Logs generated from bulk and single executions on your user ID will populate and load here dynamically.
                  </p>
                </div>
              ) : (
                historyItems.map((item) => (
                  <div key={item._id} className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden text-xs">
                    {/* Header bar */}
                    <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-400 font-extrabold">{item.commandName}</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-300">Param: {item.paramValue}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-slate-500">
                          {new Date(item.timestamp).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <button
                          onClick={() => handleCopyHistory(item.apiResponse, item._id)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                          title="Copy past output"
                        >
                          {copiedHistoryIndex === item._id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    {/* Collapsible pre block */}
                    <div className="p-3 overflow-x-auto max-h-36 scrollbar-thin">
                      <pre className="text-[11px] font-mono text-slate-400 leading-normal whitespace-pre-wrap">
                        {item.apiResponse || 'Empty logs payload'}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer bar */}
            <div className="border-t border-slate-800/80 px-5 py-3.5 bg-slate-950/40 text-right">
              <button
                onClick={() => setShowHistory(false)}
                className="bg-indigo-600 hover:bg-indigo-500 transition font-bold text-xs text-white px-4 py-2 rounded-xl cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
