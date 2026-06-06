import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Gift, Plus, Trash2, Save, Sparkles, Coins, ShoppingBag } from 'lucide-react';

export function RedeemStoreManagement() {
  const [redeemStore, setRedeemStore] = useState<{command: string, pricePerCredit: number, minRedeemAmount: number}[]>([]);
  const [availableCommands, setAvailableCommands] = useState<any[]>([]);
  const [newStoreItem, setNewStoreItem] = useState({ command: '', pricePerCredit: 10, minRedeemAmount: 5 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    // Fetch available commands
    axios.get('/api/commands')
      .then(cmdRes => {
        setAvailableCommands(cmdRes.data);
      })
      .catch(err => console.error("Error loading commands:", err));

    // Fetch existing settings
    axios.get('/api/settings')
      .then(res => {
        const redeemSetting = res.data.find((s: any) => s.key === 'redeemStore');
        if (redeemSetting) {
          setRedeemStore(redeemSetting.value || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading settings:", err);
        setLoading(false);
      });
  }, []);

  const saveRedeemStore = async (updatedStore: typeof redeemStore) => {
    setSaving(true);
    setFeedback(null);
    try {
      await axios.post('/api/settings', {
        settings: [
          { key: 'redeemStore', value: updatedStore }
        ]
      });
      setFeedback({ type: 'success', text: 'Redeem store configuration saved successfully!' });
      // Clear success feedback after some time
      setTimeout(() => setFeedback(null), 3000);
    } catch (e: any) {
      setFeedback({ type: 'error', text: e.response?.data?.error || 'Failed to save redeem store settings.' });
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    if (!newStoreItem.command) {
      alert("Please select a command trigger!");
      return;
    }
    if (redeemStore.some(item => item.command === newStoreItem.command)) {
      alert("This command is already configured in the Redeem Store.");
      return;
    }

    const updated = [
      ...redeemStore,
      {
        command: newStoreItem.command,
        pricePerCredit: Math.max(1, newStoreItem.pricePerCredit),
        minRedeemAmount: Math.max(1, newStoreItem.minRedeemAmount)
      }
    ];

    setRedeemStore(updated);
    saveRedeemStore(updated);
    // Reset selection/inputs
    setNewStoreItem({ command: '', pricePerCredit: 10, minRedeemAmount: 5 });
  };

  const removeItem = (cmd: string) => {
    const updated = redeemStore.filter(item => item.command !== cmd);
    setRedeemStore(updated);
    saveRedeemStore(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-sm text-gray-500">Loading store options...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-7 h-7" /> Redeem Store Management
          </h2>
          <p className="text-indigo-100 text-sm mt-1">
            Configure how group players can redeem their collected ENC coins for permanent command credits of specific triggers.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg text-xs font-medium border border-white/20">
          🔑 Admin Privileges Active
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-sm border font-medium ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configure/Add store item form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-700 pb-3">
            <Plus className="w-5 h-5 text-indigo-500" />
            Add Store Offer
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Command Trigger
              </label>
              <select 
                value={newStoreItem.command}
                onChange={e => setNewStoreItem({ ...newStoreItem, command: e.target.value })}
                className="w-full text-sm border dark:border-gray-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              >
                <option value="">-- Choose Command --</option>
                {availableCommands.map(c => (
                  <option key={c._id} value={c.command}>
                    {c.command} {c.isCreditBased ? '(Credit-based)' : '(Free)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Price Per Credit (Coins)
              </label>
              <input 
                type="number"
                min="1"
                value={newStoreItem.pricePerCredit}
                onChange={e => setNewStoreItem({ ...newStoreItem, pricePerCredit: Number(e.target.value) })}
                className="w-full text-sm border dark:border-gray-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                placeholder="10"
              />
              <span className="text-[10px] text-gray-400">Coins charged for each single credit.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                Min Redeemable Limit
              </label>
              <input 
                type="number"
                min="1"
                value={newStoreItem.minRedeemAmount}
                onChange={e => setNewStoreItem({ ...newStoreItem, minRedeemAmount: Number(e.target.value) })}
                className="w-full text-sm border dark:border-gray-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                placeholder="5"
              />
              <span className="text-[10px] text-gray-400">Minimum number of credits user must redeem at once.</span>
            </div>
          </div>

          <button 
            type="button"
            onClick={addItem}
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 disabled:opacity-50 mt-4 text-sm"
          >
            <Plus className="w-4 h-4" /> Add & Sync Option
          </button>
        </div>

        {/* Existing Store Offers */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3 mb-4">
            <Gift className="w-5 h-5 text-purple-500" />
            Active Store Items ({redeemStore.length})
          </h3>

          {redeemStore.length > 0 ? (
            <div className="space-y-3">
              {redeemStore.map((item, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-950 border border-slate-100 dark:border-gray-800 rounded-xl hover:shadow-sm transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold rounded-md">
                        {item.command}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-500" /> cost/credit: <strong className="text-slate-700 dark:text-slate-200">{item.pricePerCredit}</strong> coins
                      </span>
                      <span>
                        min exchange: <strong className="text-slate-700 dark:text-slate-200">{item.minRedeemAmount}</strong> credits
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => removeItem(item.command)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 p-2 rounded-xl transition"
                    title="Remove from Redeem Store"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500 space-y-2">
              <Sparkles className="w-8 h-8 text-indigo-300 mx-auto" />
              <p className="text-sm">No redeem options currently listed in the store.</p>
              <p className="text-xs">Add standard triggers in the left controller to enable exchange options.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
