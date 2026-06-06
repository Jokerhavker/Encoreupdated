import { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Plus, Trash2, Webhook, CheckCircle2, XCircle } from 'lucide-react';

export function Settings() {
  const [channels, setChannels] = useState<{id: string, link: string}[]>([]);
  const [defaultGroupCredits, setDefaultGroupCredits] = useState<number>(50);
  const [monetagEnabled, setMonetagEnabled] = useState<boolean>(true);
  const [adGapMinutes, setAdGapMinutes] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [webhookStatus, setWebhookStatus] = useState<{loading: boolean, result: any}>({ loading: false, result: null });

  useEffect(() => {
    axios.get('/api/settings').then(res => {
      const forceSetting = res.data.find((s: any) => s.key === 'forceChannels');
      // Migrate old format (string[]) to new format ({id, link}[]) if necessary
      if (forceSetting && Array.isArray(forceSetting.value)) {
        setChannels(forceSetting.value.map((v: any) => typeof v === 'string' ? { id: v, link: `https://t.me/${v.replace('@','')}` } : v));
      }
      
      const grpCreditsSetting = res.data.find((s: any) => s.key === 'defaultGroupCredits');
      if (grpCreditsSetting) {
          setDefaultGroupCredits(Number(grpCreditsSetting.value));
      }

      const rewardSetting = res.data.find((s: any) => s.key === 'rewardSettings');
      if (rewardSetting) {
          setMonetagEnabled(rewardSetting.value?.Monetag !== false);
      }

      const adGapSetting = res.data.find((s: any) => s.key === 'adGapMinutes');
      if (adGapSetting) {
          setAdGapMinutes(Number(adGapSetting.value));
      }
      
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    try {
      await axios.post('/api/settings', {
        settings: [
          { key: 'forceChannels', value: channels },
          { key: 'defaultGroupCredits', value: defaultGroupCredits },
          { key: 'rewardSettings', value: { Monetag: monetagEnabled } },
          { key: 'adGapMinutes', value: adGapMinutes }
        ]
      });
      alert('Settings saved successfully!');
    } catch(e) {
      alert('Failed to save settings');
    }
  };

  const triggerWebhookSetup = async () => {
    setWebhookStatus({ loading: true, result: null });
    try {
      // Use standard window origin to try and map the webhook
      const res = await axios.post('/api/telegram/manual-setup', { url: window.location.origin });
      setWebhookStatus({ loading: false, result: res.data });
    } catch (e: any) {
      setWebhookStatus({ loading: false, result: { success: false, error: e.message } });
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-2xl">
      <h2 className="text-xl font-medium mb-6 text-gray-900 border-b pb-4">Global Bot Settings</h2>
      
      <div className="space-y-6">
        {/* WEBOOK SETUPS */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center mb-2">
            <Webhook className="w-4 h-4 mr-1.5" /> Telegram Webhook Configuration
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            If your bot is not responding to messages, you may need to manually sync your application's URL to Telegram. Click below to securely connect your webhook now.
          </p>

          <button 
            onClick={triggerWebhookSetup}
            disabled={webhookStatus.loading}
            className="flex items-center text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {webhookStatus.loading ? 'Syncing...' : 'Sync Webhook Now'}
          </button>

          {webhookStatus.result && (
            <div className={`mt-3 p-3 rounded-md text-sm border flex items-start ${webhookStatus.result.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {webhookStatus.result.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 mr-2 shrink-0 text-emerald-600" /> : <XCircle className="w-4 h-4 mt-0.5 mr-2 shrink-0 text-red-600" />}
              <div>
                <p className="font-medium">{webhookStatus.result.success ? 'Webhook Successfully Synced!' : 'Sync Failed'}</p>
                <p className="text-xs mt-1 font-mono break-all">{webhookStatus.result.success ? webhookStatus.result.url : webhookStatus.result.error}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ad Cooldown Gap (Minutes)</h3>
          <input 
             type="number"
             value={adGapMinutes}
             onChange={e => setAdGapMinutes(Number(e.target.value))}
             className="w-full max-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
             placeholder="10"
          />
        </div>

        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Default Group Credits (Globally)</h3>
          <p className="text-xs text-gray-500 mb-4">
            Total number of group commands an Owner can execute across all of their groups COMBINED per day. This prevents users from adding the bot to 100 groups to bypass the limits.
          </p>
          <input 
             type="number"
             value={defaultGroupCredits}
             onChange={e => setDefaultGroupCredits(Number(e.target.value))}
             className="w-full max-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
             placeholder="50"
          />
        </div>

        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Force Subscribe Channels</h3>
          <p className="text-xs text-gray-500 mb-4">
            If added, users must join these channels to use the bot. Ensure the bot is added/admin in the channel/group. Add the Username/ID to verify membership, and the exact Invite Link the user should join.
          </p>
          
          <div className="space-y-3">
            {channels.map((ch, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <input 
                  type="text" 
                  value={ch.id}
                  onChange={(e) => {
                    const newCh = [...channels];
                    newCh[idx].id = e.target.value;
                    setChannels(newCh);
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Channel ID or @username"
                />
                <input 
                  type="text" 
                  value={ch.link}
                  onChange={(e) => {
                    const newCh = [...channels];
                    newCh[idx].link = e.target.value;
                    setChannels(newCh);
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Full Invite Link (Trackable)"
                />
                <button 
                  onClick={() => setChannels(channels.filter((_, i) => i !== idx))}
                  className="flex items-center text-red-500 text-xs hover:text-red-700"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Remove Channel
                </button>
              </div>
            ))}
            <button 
              onClick={() => setChannels([...channels, {id: '', link: ''}])}
              className="flex items-center text-sm text-indigo-600 font-medium hover:text-indigo-800"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Channel
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Manage Monetag Rewards</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div>
              <span className="text-sm font-medium text-gray-850">Monetag Ad Rewards</span>
              <p className="text-xs text-gray-400 mt-0.5">Toggle Monetag ad networks. Users get 10 ENC coins per reward ad video completed.</p>
            </div>
            <button
              type="button"
              onClick={() => setMonetagEnabled(!monetagEnabled)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all ${
                monetagEnabled 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-250' 
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {monetagEnabled ? 'Active (Enabled)' : 'Inactive (Disabled)'}
            </button>
          </div>
        </div>
        
        <button 
          onClick={saveSettings}
          className="mt-6 flex items-center bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition"
        >
          <Save className="w-4 h-4 mr-2" /> Save Settings
        </button>
      </div>
    </div>
  );
}
