import React, { useState, useEffect } from 'react';
import { Clock, Info, Shield, Zap, Award, Coins, AlertTriangle, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

// Elegant Pulse Plan Countdown
export const PlanCountdown = ({ expiresAt }: { expiresAt?: string }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const updateCountdown = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 65));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[10px] font-mono mt-1.5 w-fit animate-pulse">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Expires in: {timeLeft}</span>
    </div>
  );
};

// Glassmorphic Info Banner
export const InfoBanner = ({ title, children, icon: Icon = Info, variant = 'indigo' }: any) => {
  const themes: any = {
    indigo: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20 shadow-indigo-950/20',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-500/20 shadow-amber-950/20',
    emerald: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20 shadow-emerald-950/20',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border backdrop-blur-md shadow-lg ${themes[variant] || themes.indigo} space-y-1`}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4.5 h-4.5 text-current shrink-0" />
        <h4 className="font-bold text-xs uppercase tracking-wider">{title}</h4>
      </div>
      <div className="text-xs opacity-90 leading-relaxed font-sans">{children}</div>
    </motion.div>
  );
};

// Points Help Modal (Glassmorphism layout)
export const PointsHelpModal = ({ show, onClose }: { show: boolean, onClose: () => void }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900/90 border border-slate-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden text-slate-100"
      >
        <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none" />
        
        <h3 className="text-base font-black text-white border-b border-slate-800 pb-3 mb-4 flex items-center gap-2 relative">
          <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
          About Integration Points
        </h3>

        <div className="text-xs text-slate-350 space-y-3.5 relative font-medium">
          <p>
            <strong className="text-white">What are Integration Points?</strong><br />
            Integration Points are monthly resource tokens used to scale and rate-limit cloned bots in the Mirror system. They keep the servers blazing fast for everyone!
          </p>
          <p>
            <strong className="text-white">How does consumption work?</strong><br />
            Every successfully validated command (such as built-in lookups or custom-added API endpoints) processed by your cloned bot consumes exactly <strong className="text-indigo-400">1 Integration point</strong>.
          </p>
          <p>
            <strong className="text-white">What are the Monthly Allowances?</strong>
          </p>
          <div className="space-y-1.5 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80 font-mono text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>FREE PLAN:</span>
              <span className="font-bold">10,000 / month</span>
            </div>
            <div className="flex justify-between text-indigo-400">
              <span>SILVER PLAN:</span>
              <span className="font-bold">50,000 / month</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>GOLD PLAN:</span>
              <span className="font-bold">200,000 / month</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>MAX PLAN:</span>
              <span className="font-bold">1,500,000 / month</span>
            </div>
          </div>
          <p className="leading-relaxed">
            <strong className="text-white">Auto-Stop &amp; Reset Safeguards:</strong><br />
            If your bot consumes 100% of its monthly allowance, it will <span className="text-rose-400 font-bold">auto-stop</span> and remain suspended for the remainder of the calendar month to protect system resources. 
            It will <span className="text-emerald-400 font-bold">automatically resume</span> at the beginning of the next month. Alternatively, you can upgrade your plan to immediately raise the cap!
          </p>
        </div>

        <div className="mt-6 flex justify-end relative">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition cursor-pointer select-none border border-indigo-500/30"
          >
            Got it, thanks!
          </button>
        </div>
      </motion.div>
    </div>
  );
};
