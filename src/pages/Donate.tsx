import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Heart, QrCode, Clipboard, Check, AlertCircle, Sparkles, Shield, Coins } from 'lucide-react';

export default function Donate() {
  const [activeTab, setActiveTab] = useState<'upi' | 'crypto'>('upi');
  const [config, setConfig] = useState<any>({
    payeeUpi: 'ionfwarush@slc',
    cryptoCurrencyName: 'USDT (TRC-20)',
    cryptoWalletAddress: '',
    showCrypto: false
  });

  // UPI Form States
  const [upiName, setUpiName] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [upiUtr, setUpiUtr] = useState('');

  // Crypto Form States
  const [cryptoName, setCryptoName] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoUtr, setCryptoUtr] = useState('');

  // Status/Messages
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/donations/config');
      if (res.data) {
        setConfig(res.data);
        if (!res.data.showCrypto) {
          setActiveTab('upi');
        }
      }
    } catch (err) {
      console.error('Failed to load donation config', err);
    }
  };

  const copyAddress = () => {
    if (!config.cryptoWalletAddress) return;
    navigator.clipboard.writeText(config.cryptoWalletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiAmount || isNaN(Number(upiAmount)) || Number(upiAmount) <= 0) {
      setErrorMsg('Please specify a valid subscription/donation amount.');
      return;
    }
    if (!upiUtr.trim()) {
      setErrorMsg('Transaction Ref/UTR is required for instant Fampay tracking.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await axios.post('/api/donations/verify-upi', {
        name: upiName.trim() || 'Anonymous',
        amount: Number(upiAmount),
        utr: upiUtr.trim()
      });

      if (res.data?.success) {
        setSuccessMsg(`🎉 Success! Your donation of ₹${upiAmount} was auto-tracked successfully. Channel leaderboard has been updated!`);
        setUpiName('');
        setUpiAmount('');
        setUpiUtr('');
      } else {
        setErrorMsg('Fampay tracking failed to confirm transaction.');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Tracking verification error. Check UTR ID/Amount again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCryptoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cryptoAmount || isNaN(Number(cryptoAmount)) || Number(cryptoAmount) <= 0) {
      setErrorMsg('Please specify a valid numeric dollar amount.');
      return;
    }
    if (!cryptoUtr.trim()) {
      setErrorMsg('Transaction hash is required for manual confirmation.');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await axios.post('/api/donations/submit-crypto', {
        name: cryptoName.trim() || 'Anonymous',
        amount: Number(cryptoAmount),
        utr: cryptoUtr.trim(),
        cryptoCurrency: config.cryptoCurrencyName
      });

      if (res.data?.success) {
        setSuccessMsg(`✨ Received! Your crypto donation of $${cryptoAmount} (${config.cryptoCurrencyName}) has been logged for admin verification. Once verified, it will update the channel!`);
        setCryptoName('');
        setCryptoAmount('');
        setCryptoUtr('');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const upiUrl = `upi://pay?pa=${config.payeeUpi}&pn=EncoreX%20Donations&cu=INR`;
  const upiQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUrl)}`;
  const cryptoQrImageUrl = config.cryptoWalletAddress 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(config.cryptoWalletAddress)}` 
    : '';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg bg-slate-800 rounded-2xl shadow-xl border border-slate-700/80 overflow-hidden">
        {/* Top Branding Header */}
        <div className="p-6 bg-gradient-to-r from-indigo-600 to-indigo-800 text-center relative">
          <div className="absolute top-2 right-4 flex items-center gap-1.5 text-[10px] uppercase font-bold text-indigo-200 select-none bg-indigo-900/40 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" /> Community Portal
          </div>
          <div className="mx-auto w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-3">
            <Heart className="w-7 h-7 text-rose-400 fill-rose-400" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Support @encorexosint</h2>
          <p className="text-xs text-indigo-100 mt-1">Thank you for keeping our OSINT services alive and free for all!</p>
        </div>

        {/* Tab Selection */}
        {config.showCrypto && config.cryptoWalletAddress && (
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => { setActiveTab('upi'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition ${
                activeTab === 'upi' ? 'border-indigo-500 text-indigo-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" /> UPI / Fampay
            </button>
            <button
              onClick={() => { setActiveTab('crypto'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition ${
                activeTab === 'crypto' ? 'border-indigo-500 text-indigo-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <Coins className="w-3.5 h-3.5" /> Crypto Native
            </button>
          </div>
        )}

        <div className="p-6 space-y-4">
          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3.5 rounded-xl text-xs font-bold text-center">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3.5 rounded-xl text-xs font-bold text-center">
              ⚠️ {errorMsg}
            </div>
          )}

          {activeTab === 'upi' ? (
            <form onSubmit={handleUpiSubmit} className="space-y-4 text-left">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col items-center">
                <img 
                  src={upiQrImageUrl} 
                  alt="Donation UPI QR" 
                  className="w-44 h-44 rounded-lg bg-white p-1 border shadow-md"
                />
                <div className="mt-3 flex items-center justify-center gap-2 bg-indigo-900/40 border border-indigo-700/50 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-indigo-200">
                  <span>{config.payeeUpi || 'ionfwarush@slc'}</span>
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(config.payeeUpi || 'ionfwarush@slc');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="text-indigo-400 hover:text-indigo-200"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Scan QR or copy Slice UPI address to contribute</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Your Name / Alias (Optional)</label>
                <input 
                  type="text" 
                  value={upiName}
                  onChange={(e) => setUpiName(e.target.value)}
                  placeholder="e.g. John / Anonymous" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Contribution Amount (₹ INR)</label>
                <input 
                  type="number" 
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                  placeholder="e.g. 50" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Transaction UTR / Ref ID (12 Digits)</label>
                <input 
                  type="text" 
                  value={upiUtr}
                  onChange={(e) => setUpiUtr(e.target.value)}
                  placeholder="e.g. 627546785553" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-extrabold py-3 rounded-xl text-xs transition cursor-pointer"
              >
                {loading ? 'Verifying with Slice Gateway...' : 'VERIFY & SUBMIT DONATION'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCryptoSubmit} className="space-y-4 text-left">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col items-center">
                {cryptoQrImageUrl && (
                  <img src={cryptoQrImageUrl} alt="Crypto Wallet QR" className="w-40 h-40 rounded-lg bg-white p-1 border shadow-md mb-2" />
                )}
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-mono text-slate-200 max-w-full overflow-hidden">
                  <span className="truncate">{config.cryptoWalletAddress}</span>
                  <button type="button" onClick={copyAddress} className="text-indigo-400 hover:text-indigo-200">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1">{config.cryptoCurrencyName} Wallet Address</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Your Name / Alias</label>
                <input 
                  type="text" 
                  value={cryptoName}
                  onChange={(e) => setCryptoName(e.target.value)}
                  placeholder="e.g. Satoshi" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Amount ($ USD)</label>
                <input 
                  type="number" 
                  value={cryptoAmount}
                  onChange={(e) => setCryptoAmount(e.target.value)}
                  placeholder="e.g. 10" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Transaction Hash / TxID</label>
                <input 
                  type="text" 
                  value={cryptoUtr}
                  onChange={(e) => setCryptoUtr(e.target.value)}
                  placeholder="Paste transaction hash here..." 
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-extrabold py-3 rounded-xl text-xs transition cursor-pointer"
              >
                {loading ? 'Submitting...' : 'LOG CRYPTO DONATION'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
