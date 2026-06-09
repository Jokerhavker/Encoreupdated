import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Heart, Coins, QrCode, ToggleLeft, ToggleRight, Save, Send, ShieldAlert, CheckCircle, XCircle, Search, Sparkles, Trash2 } from 'lucide-react';

export function Donations() {
  const [donations, setDonations] = useState<any[]>([]);
  const [config, setConfig] = useState({
    payeeUpi: 'alkhkumar@fam',
    cryptoCurrencyName: 'USDT (TRC-20)',
    cryptoWalletAddress: '',
    showCrypto: false
  });

  // Loading and feedback states
  const [fetching, setFetching] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filter, setFilter] = useState<'all' | 'upi' | 'crypto' | 'pending' | 'approved'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setFetching(true);
    setErrorMsg('');
    try {
      const [donationsRes, configRes] = await Promise.all([
        axios.get('/api/donations'),
        axios.get('/api/donations/config')
      ]);
      setDonations(donationsRes.data || []);
      if (configRes.data) {
        setConfig(configRes.data);
      }
    } catch (err: any) {
      setErrorMsg('Failed to fetch donations data: ' + (err.response?.data?.error || err.message));
    } finally {
      setFetching(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await axios.post('/api/donations/config', config);
      if (res.data?.success) {
        setSuccessMsg('Donation settings configuration saved successfully!');
        setConfig(res.data.config);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to update donation configuration settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendTelegramMessage = async () => {
    setSendingMsg(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await axios.post('/api/donations/send-message');
      if (res.data?.success) {
        setSuccessMsg('🎉 Donation main leaderboard post message has been sent to the channel successfully!');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Could not send telegram message. Make sure the main bot is an admin in @encorexosint!');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleModerate = async (donationId: string, action: 'Approve' | 'Reject') => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await axios.post('/api/donations/moderate', { donationId, action });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Donation check processed successfully!');
        // Refresh
        const upRes = await axios.get('/api/donations');
        setDonations(upRes.data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Moderation check failed.');
    }
  };

  // Compute Stats
  const upiTotalInr = donations
    .filter(d => d.method === 'upi' && d.status === 'Approved')
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const cryptoTotalUsd = donations
    .filter(d => d.method === 'crypto' && d.status === 'Approved')
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const pendingCryptoCount = donations.filter(d => d.method === 'crypto' && d.status === 'Pending').length;

  const filteredDonations = donations.filter(d => {
    if (filter === 'all') return true;
    if (filter === 'upi') return d.method === 'upi';
    if (filter === 'crypto') return d.method === 'crypto';
    if (filter === 'pending') return d.status === 'Pending';
    if (filter === 'approved') return d.status === 'Approved';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Messages Banner */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md text-sm text-red-700 flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-md text-sm text-emerald-700 flex items-start gap-2 animate-feed">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Total UPI Raised</p>
            <h3 className="text-2xl font-black text-gray-800 mt-1">₹{upiTotalInr.toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <QrCode className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Total Crypto Raised</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">${cryptoTotalUsd.toLocaleString()}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Coins className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider">Pending Validations</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCryptoCount}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-500 rounded-lg animate-pulse">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 rounded-xl text-white shadow-md flex flex-col justify-between">
          <div>
            <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-wider">Donations Leaderboard Post</p>
            <p className="text-xs text-indigo-100 mt-1">Sends or recreates top donations message in @encorexosint.</p>
          </div>
          <button
            onClick={handleSendTelegramMessage}
            disabled={sendingMsg}
            className="w-full bg-white text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-50 transition flex items-center justify-center gap-1.5 mt-3 select-none cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {sendingMsg ? 'Broadcasting...' : 'Send Donation Message'}
          </button>
        </div>
      </div>

      {/* Main Configurations & List Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration settings form panel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y">
          <div className="p-4 bg-gray-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-500" /> Donation Settings
            </h3>
            <span className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Configuration</span>
          </div>

          <form onSubmit={handleSaveConfig} className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Payee Fampay UPI ID</label>
              <input
                type="text"
                value={config.payeeUpi}
                onChange={e => setConfig({ ...config, payeeUpi: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="e.g. alkhkumar@fam"
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Users will see a dynamically generated QR linking to this UPI payee handle.</p>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase font-bold text-gray-500">Enable Crypto on Webapp</span>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, showCrypto: !config.showCrypto })}
                  className="text-indigo-600 focus:outline-none"
                >
                  {config.showCrypto ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                </button>
              </div>

              {config.showCrypto && (
                <div className="space-y-3 animate-feed">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Crypto Name & Network</label>
                    <input
                      type="text"
                      value={config.cryptoCurrencyName}
                      onChange={e => setConfig({ ...config, cryptoCurrencyName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g. USDT (TRC-20)"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Crypto Wallet Address</label>
                    <input
                      type="text"
                      value={config.cryptoWalletAddress}
                      onChange={e => setConfig({ ...config, cryptoWalletAddress: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="e.g. USDT TRC20 wallet address"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {savingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        </div>

        {/* Donations details list tab */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm lg:col-span-2 flex flex-col overflow-hidden">
          {/* Header & Filter Controls */}
          <div className="p-4 bg-gray-50/50 border-b flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" /> Donation Logs
            </h3>
            
            <div className="flex gap-1 overflow-x-auto">
              {(['all', 'upi', 'crypto', 'pending', 'approved'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded transition whitespace-nowrap cursor-pointer ${
                    filter === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-150 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Donations records table list */}
          <div className="flex-1 overflow-x-auto">
            {fetching ? (
              <div className="p-12 text-center text-xs text-gray-400 font-bold animate-pulse">
                Fetching donation records...
              </div>
            ) : filteredDonations.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400 select-none">
                No matching donation records found in logs.
              </div>
            ) : (
              <table className="w-full text-left text-xs divide-y divide-gray-100">
                <thead className="bg-gray-50/80 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Payer & Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Transaction ID / UTR / Hash</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDonations.map((d: any) => (
                    <tr key={d._id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-800">{d.name}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                          {d.method === 'upi' ? (
                            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded uppercase font-bold text-[8px] tracking-wide">UPI</span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded uppercase font-bold text-[8px] tracking-wide">Crypto ({d.cryptoCurrency})</span>
                          )}
                          <span>•</span>
                          <span>{new Date(d.createdAt).toLocaleString()}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-extrabold text-gray-900">
                        {d.method === 'crypto' ? `$${d.amount}` : `₹${d.amount}`}
                      </td>

                      <td className="px-4 py-3 font-mono text-[10px] text-gray-500 break-all truncate max-w-[150px]">
                        {d.utr}
                      </td>

                      <td className="px-4 py-3">
                        {d.status === 'Approved' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Approved
                          </span>
                        )}
                        {d.status === 'Pending' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">
                            Pending
                          </span>
                        )}
                        {d.status === 'Rejected' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            Rejected
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        {d.status === 'Pending' && (
                          <>
                            <button
                              onClick={() => handleModerate(d._id, 'Approve')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px] font-bold transition select-none cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleModerate(d._id, 'Reject')}
                              className="bg-red-50 text-red-650 hover:bg-red-100 px-2 py-1 rounded text-[10px] font-bold transition select-none cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
