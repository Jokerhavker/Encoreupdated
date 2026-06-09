import React from 'react';
import { Bot, Key, Users, CheckCircle2, XCircle, RefreshCw, Trash2, Zap, Shield, ExternalLink, ArrowRight, Activity, Terminal } from 'lucide-react';
import { motion } from 'motion/react';

interface ComponentProps {
  tempTokenInput: string;
  setTempTokenInput: (val: string) => void;
  tempUserIdInput: string;
  loading: boolean;
  errorMsg: string;
  successMsg: string;
  ownedBots: any[];
  onOnboardSubmit: (e: React.FormEvent) => void;
  onManageBot: (bot: any) => void;
  onToggleBotActive: (bot: any) => void;
  onDeleteBot: (bot: any) => void;
}

export const MirrorManagerOnboarding: React.FC<ComponentProps> = ({
  tempTokenInput,
  setTempTokenInput,
  tempUserIdInput,
  loading,
  errorMsg,
  successMsg,
  ownedBots,
  onOnboardSubmit,
  onManageBot,
  onToggleBotActive,
  onDeleteBot,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start font-sans">
      
      {/* LEFT COLUMN: Premium Futuristic Step Walkthrough (Frosted Timeline) */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-[#0b0f2a]/40 border border-white/5 backdrop-blur-xl rounded-2xl p-7 shadow-[0_12px_40px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute top-[-25%] left-[-25%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="flex items-center gap-3.5 mb-8 border-b border-white/5 pb-5">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Configuration Terminal</h3>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">Instantiate your custom bot ecosystem in 4 steps</p>
            </div>
          </div>

          <div className="relative border-l border-indigo-500/20 ml-4 pl-7 space-y-7 text-xs">
            {/* Timeline Item 1 */}
            <div className="relative group">
              <div className="absolute -left-[39px] top-0 w-6 h-6 rounded-full bg-[#0d1230] border-2 border-indigo-500/50 flex items-center justify-center font-mono text-[10px] font-black text-indigo-305 shadow-[0_0_10px_rgba(99,102,241,0.2)] group-hover:border-indigo-400 group-hover:text-indigo-200 transition-colors duration-300">
                1
              </div>
              <h4 className="font-extrabold text-white text-[13px] tracking-wide mb-1 transition-colors duration-300 group-hover:text-indigo-300">Connect to BotFather</h4>
              <p className="text-slate-400 leading-relaxed text-[11.5px]">
                Open a secure direct dialog with Telegram's certified core registrar <strong className="text-indigo-400 font-semibold">@BotFather</strong>.
              </p>
              <div className="mt-2">
                <a 
                  href="https://t.me/BotFather" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-black text-indigo-400 hover:text-indigo-300 hover:underline bg-indigo-500/5 px-2.5 py-1 rounded-lg border border-indigo-500/10 transition-all"
                >
                  Initiate Handshake <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Timeline Item 2 */}
            <div className="relative group">
              <div className="absolute -left-[39px] top-0 w-6 h-6 rounded-full bg-[#0d1230] border-2 border-indigo-500/50 flex items-center justify-center font-mono text-[10px] font-black text-indigo-305 shadow-[0_0_10px_rgba(99,102,241,0.2)] group-hover:border-indigo-400 group-hover:text-indigo-200 transition-colors duration-300">
                2
              </div>
              <h4 className="font-extrabold text-white text-[13px] tracking-wide mb-1 transition-colors duration-300 group-hover:text-indigo-300">Establish Clone Identity</h4>
              <p className="text-slate-400 leading-relaxed text-[11.5px]">
                Execute the instruction command <code className="text-indigo-300 bg-[#070914] px-1.5 py-0.5 rounded border border-white/5 font-mono text-[10.5px]">/newbot</code>. Set up a gorgeous user display name and define a username ending in <code className="text-purple-300 font-mono">bot</code>.
              </p>
            </div>

            {/* Timeline Item 3 */}
            <div className="relative group">
              <div className="absolute -left-[39px] top-0 w-6 h-6 rounded-full bg-[#0d1230] border-2 border-indigo-500/50 flex items-center justify-center font-mono text-[10px] font-black text-indigo-305 shadow-[0_0_10px_rgba(99,102,241,0.2)] group-hover:border-indigo-400 group-hover:text-indigo-200 transition-colors duration-300">
                3
              </div>
              <h4 className="font-extrabold text-white text-[13px] tracking-wide mb-1 transition-colors duration-300 group-hover:text-indigo-300">Expose Cryptographic Token</h4>
              <p className="text-slate-400 leading-relaxed text-[11.5px]">
                Copy the newly generated HTTP API passcode (the token). This credential authorizes our cloud platform to host your dedicated instance safely.
              </p>
            </div>

            {/* Timeline Item 4 */}
            <div className="relative group">
              <div className="absolute -left-[39px] top-0 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center font-mono text-[10px] font-black text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                4
              </div>
              <h4 className="font-extrabold text-indigo-400 text-[13px] tracking-wide mb-1">Synchronize Workspace</h4>
              <p className="text-slate-400 leading-relaxed text-[11.5px]">
                Feed the acquired API passcode into the deployment panel, finalize connection to your Telegram ID, and start the engine immediately!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Frosted Form and Existing Interactive Robots Lists */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* Onboarding Form Card with glass drop reflection */}
        <div className="bg-[#0b0f2a]/40 border border-white/5 backdrop-blur-xl rounded-2xl overflow-hidden shadow-[0_12px_45px_rgba(0,0,0,0.55)] relative">
          <div className="bg-gradient-to-r from-indigo-950/30 via-slate-900/40 to-indigo-950/20 p-6 md:p-7 border-b border-white/5 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/8 rounded-full blur-[45px] pointer-events-none" />
            <div className="flex items-center gap-3.5 mb-4">
              <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-550/20 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                <Bot className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-wider uppercase">Deploy Engine</h2>
                <p className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest mt-0.5">Instance Registration Console</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-sans max-w-lg mt-2">
              Transform your blank TG shell into an autonomous clone. Input your credentials below to inject the system logic and gain dynamic control points instantly.
            </p>
          </div>

          <form onSubmit={onOnboardSubmit} className="p-6 md:p-7 space-y-6">
            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="p-4 bg-rose-500/10 border border-rose-500/25 text-rose-200 rounded-xl text-xs flex items-start gap-3 shadow-lg"
              >
                <XCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <h5 className="font-extrabold uppercase text-[10px] tracking-wider text-rose-300">Deployment Error</h5>
                  <p className="mt-0.5 font-semibold text-rose-200/90 leading-normal">{errorMsg}</p>
                </div>
              </motion.div>
            )}

            {successMsg && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="p-4 bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 rounded-xl text-xs flex items-start gap-3 shadow-lg"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <h5 className="font-extrabold uppercase text-[10px] tracking-wider text-emerald-300">Deployment Success</h5>
                  <p className="mt-0.5 font-semibold text-emerald-100/90 leading-normal">{successMsg}</p>
                </div>
              </motion.div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-405 uppercase tracking-widest mb-2 flex items-center gap-2 font-mono">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  Bot Authentication Identifier (Token)
                </label>
                <input 
                  type="text" 
                  value={tempTokenInput}
                  onChange={(e) => setTempTokenInput(e.target.value)}
                  placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full bg-[#050715]/70 border border-white/5 hover:border-indigo-500/30 rounded-xl px-4 py-3.5 text-xs font-mono text-white placeholder-slate-700 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none focus:border-indigo-500/80 transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-405 uppercase tracking-widest mb-2 flex items-center gap-2 font-mono">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  Locked Root Owner Account ID
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={tempUserIdInput}
                    readOnly
                    placeholder="Locking identity credentials..."
                    className="w-full bg-[#050715]/40 border border-white/5 rounded-xl px-4 py-3.5 text-xs font-mono text-slate-400 cursor-not-allowed shadow-inner"
                  />
                  {tempUserIdInput && (
                    <span className="absolute right-3.5 top-3.5 bg-indigo-500/10 text-indigo-400 border border-indigo-400/20 font-mono text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                      VERIFIED
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-medium leading-relaxed">
                  {tempUserIdInput 
                    ? "✓ Lock Established: Session account ID was automatically mapped and encrypted for secure system-level authentication." 
                    : "⚠️ Lock Pending: Please initiate and open this platform from within your certified Telegram interface to fetch account details."}
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !tempTokenInput.trim()}
              className="w-full bg-indigo-650 hover:bg-indigo-600 disabled:opacity-30 disabled:hover:translate-y-0 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all squash-active flex items-center justify-center gap-2 border border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.25)] cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <span>Instantiate Bot Node</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Loaded Existing Bots list inside a premium glass widget */}
        {ownedBots.length > 0 && (
          <div className="bg-[#0b0f2a]/40 border border-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-[0_12px_45px_rgba(0,0,0,0.5)] space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Terminal className="w-4.5 h-4.5 text-indigo-400" />
                Active Registered Agents ({ownedBots.length})
              </h3>
              <span className="text-[9px] font-mono font-black text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/15">ONLINE DEPRECIATORS</span>
            </div>
            
            <div className="space-y-3.5">
              {ownedBots.map((b: any) => (
                <div 
                  key={b.token} 
                  className="p-4 bg-[#050715]/40 rounded-2xl border border-white/5 hover:border-indigo-500/20 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-sans group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/8 transition" />
                  
                  <div className="space-y-1.5 relative">
                    <div className="flex items-center gap-2">
                      <p className="font-extrabold text-white text-sm tracking-wide">
                        {b.customBotName || b.botName || 'System Bot'}
                      </p>
                      <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${b.isActive ? 'bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                    </div>
                    <p className="text-[11px] font-mono text-indigo-305 font-bold">@{b.botUsername || 'unregistered'}</p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[9.5px] font-mono bg-[#080b20] text-slate-405 border border-white/5 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        Subscription Level: <strong className="text-indigo-400 uppercase font-black ml-1 font-sans">{b.plan}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto relative">
                    <button
                      onClick={() => onManageBot(b)}
                      className="bg-indigo-650 hover:bg-indigo-600 border border-indigo-550/30 text-white font-black text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition duration-300 active:scale-95 cursor-pointer shadow-md select-none"
                    >
                      Workspace
                    </button>
                    
                    <button
                      onClick={() => onToggleBotActive(b)}
                      className={`font-black text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition duration-300 active:scale-95 cursor-pointer select-none border ${
                        b.isActive 
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20' 
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {b.isActive ? 'Suspend' : 'Resume'}
                    </button>
                    
                    <button
                      onClick={() => onDeleteBot(b)}
                      className="bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 border border-rose-500/15 font-black text-[10px] p-2.5 rounded-xl transition duration-300 active:scale-95 cursor-pointer select-none"
                      title="Decommission Agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
