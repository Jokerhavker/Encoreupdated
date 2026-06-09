import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Heart, QrCode, Clipboard, Check, AlertCircle, Sparkles, Shield, Coins } from 'lucide-react';

export default function Donate() {
  const [activeTab, setActiveTab] = useState<'upi' | 'crypto'>('upi');
  const [config, setConfig] = useState<any>({
    payeeUpi: 'alkhkumar@fam',
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

        <div className="p-6 space-y-6">
          {/* Status Banners */}
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'upi' ? (
            /* UPI TAB */
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-semibold text-slate-400 text-center mb-3">
                  Scan & pay any amount using FamPay/GPay/PhonePe to the given qr code!
                </p>
                <div className="bg-white p-3 rounded-xl shadow-inner mb-2 border border-slate-600/50">
                  <img 
                    src={upiQrImageUrl} 
                    alt="UPI QR Code" 
                    className="w-40 h-40 object-contain selection:bg-transparent"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-[10px] text-slate-500 italic mt-0.5 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-indigo-500" /> Instant verification powered by automated check logs
                </span>
              </div>

              <form onSubmit={handleUpiSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Your Name / Handle</label>
                  <input
                    type="text"
                    value={upiName}
                    onChange={(e) => setUpiName(e.target.value)}
                    placeholder="e.g. @ayushk, John Doe (Optional)"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none"
                    maxLength={30}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Amount (₹ INR)</label>
                    <input
                      type="number"
                      value={upiAmount}
                      onChange={(e) => setUpiAmount(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">UTR / Ref No.</label>
                    <input
                      type="text"
                      value={upiUtr}
                      onChange={(e) => setUpiUtr(e.target.value)}
                      placeholder="Enter 12-digit UPI UTR"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none font-mono"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying payment...' : 'Verify Donation & Add to Leaderboard'}
                </button>
              </form>
            </div>
          ) : (
            /* CRYPTO TAB */
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-semibold text-slate-400 text-center mb-3">
                  Send your donation in <span className="text-emerald-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded font-mono">{config.cryptoCurrencyName}</span>
                </p>

                {cryptoQrImageUrl && (
                  <div className="bg-white p-3 rounded-xl shadow-inner mb-3 border border-slate-600/50">
                    <img 
                      src={cryptoQrImageUrl} 
                      alt="Crypto QR Code" 
                      className="w-40 h-40 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                <div className="w-full flex items-center gap-2 bg-slate-900 p-2.5 rounded border border-slate-700">
                  <div className="flex-1 truncate font-mono text-[10px] text-slate-300 text-center select-all">
                    {config.cryptoWalletAddress}
                  </div>
                  <button
                    onClick={copyAddress}
                    type="button"
                    className="p-1 px-2.5 bg-slate-850 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-bold flex items-center gap-1 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <form onSubmit={handleCryptoSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Your Name / Handle</label>
                  <input
                    type="text"
                    value={cryptoName}
                    onChange={(e) => setCryptoName(e.target.value)}
                    placeholder="e.g. @ayushk (Optional)"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none"
                    maxLength={30}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Amount Paid ($ USD)</label>
                    <input
                      type="number"
                      value={cryptoAmount}
                      onChange={(e) => setCryptoAmount(e.target.value)}
                      placeholder="e.g. 15.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Transaction TXID / Hash</label>
                    <input
                      type="text"
                      value={cryptoUtr}
                      onChange={(e) => setCryptoUtr(e.target.value)}
                      placeholder="Enter Txn hash / Proof details"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:ring-1 focus:ring-indigo-550 outline-none font-mono"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Submitting details...' : 'Submit Donation Details for Validation'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
