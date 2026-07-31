import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Send, RefreshCw, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function Login() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if current IP is blocked
    axios.get('/api/admin/check-ip')
      .then(res => {
        if (res.data.blocked) {
          setIsBlocked(true);
          setBlockedMessage(res.data.message);
        }
      })
      .catch(err => {
        console.error("Error checking IP block status", err);
      });

    // Check active OTP cooldown status
    axios.get('/api/admin/otp-status')
      .then(res => {
        if (res.data.cooldownInSeconds > 0) {
          setCooldown(res.data.cooldownInSeconds);
        }
      })
      .catch(err => {
        console.error("Error checking OTP status", err);
      });
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const formatCooldownTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRequestOtp = async () => {
    setError('');
    setWarning('');
    setOtpSuccessMsg('');
    setIsSendingOtp(true);

    try {
      const res = await axios.post('/api/admin/request-otp');
      if (res.data.success) {
        setOtpSuccessMsg(res.data.message || 'OTP sent to Telegram admin accounts!');
        setCooldown(res.data.cooldownInSeconds || 300);
      }
    } catch (err: any) {
      if (err.response) {
        const { data, status } = err.response;
        if (status === 403 && data.blocked) {
          setIsBlocked(true);
          setBlockedMessage(data.message);
        } else if (data.cooldownActive) {
          setError(data.message);
          if (data.cooldownInSeconds) {
            setCooldown(data.cooldownInSeconds);
          }
        } else {
          setError(data.message || 'Failed to send OTP');
        }
      } else {
        setError('Connection error or server offline');
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setWarning('');
    setIsVerifying(true);

    try {
      const response = await axios.post('/api/admin/login', { otp: otp.trim() });
      if (response.data.success) {
        localStorage.setItem('admin_logged_in', 'true');
        navigate('/');
      }
    } catch (err: any) {
      if (err.response) {
        const { data, status } = err.response;
        if (status === 403 && data.blocked) {
          setIsBlocked(true);
          setBlockedMessage(data.message);
        } else if (data.warning) {
          setWarning(data.warning);
        } else {
          setError(data.message || 'Invalid OTP code');
        }
      } else {
        setError('Connection error or server offline');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 mb-3 shadow-sm">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">
            Admin OTP Verification
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            OTP is sent via Telegram to authorized admin IDs <br />
            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">8033206631</span> & <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">8241699347</span>
          </p>
        </div>

        {isBlocked ? (
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 text-red-600 mb-4 animate-pulse">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Access Blocked</h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-6">
              {blockedMessage || 'Your IP has been blocked due to too many incorrect attempts.'}
            </p>
            <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-900 py-2 rounded-lg font-medium">
              Duration: 24-hour temporary IP lockout.
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm text-center font-medium animate-shake">
                {error}
              </div>
            )}

            {warning && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm text-center font-medium">
                ⚠️ {warning}
              </div>
            )}

            {otpSuccessMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs text-center font-medium flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{otpSuccessMsg}</span>
              </div>
            )}

            <div className="mb-5 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Request Telegram OTP
                </span>
                {cooldown > 0 && (
                  <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                    Resend in {formatCooldownTime(cooldown)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={isSendingOtp || cooldown > 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSendingOtp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending OTP to Telegram...
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Resend OTP after {formatCooldownTime(cooldown)}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send OTP via Main Bot
                  </>
                )}
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="otpCode" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                  Enter 6-Digit OTP Code
                </label>
                <div className="relative">
                  <input
                    id="otpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none transition-all text-center tracking-[0.5em] font-mono text-xl font-bold placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:font-normal"
                    placeholder="Enter OTP..."
                    required
                  />
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 text-center">
                  OTP is valid for 5 minutes after request
                </p>
              </div>

              <button
                type="submit"
                disabled={isVerifying || !otp.trim()}
                className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying OTP...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Verify & Access Admin Panel
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
