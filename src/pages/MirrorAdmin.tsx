import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Bot, Users, Layers, ToggleLeft, ToggleRight, Search, 
  Trash, Save, Edit, RefreshCw, DollarSign, Radio, Settings2, CheckCircle, AlertCircle, Calendar, ShieldCheck, Mail
} from 'lucide-react';

interface MirrorBotStats {
  totalUsers: number;
  totalGroups: number;
}

interface MirrorBot {
  _id: string;
  token: string;
  botUsername?: string;
  botName?: string;
  ownerTelegramId: string;
  plan: 'free' | 'silver' | 'gold' | 'max';
  isActive: boolean;
  customBotName?: string;
  forceChannels?: any[];
  defaultGroupCredits?: number;
  expiresAt?: string;
  createdAt: string;
  stats: MirrorBotStats;
}

interface TierConfig {
  id: 'free' | 'silver' | 'gold' | 'max';
  name: string;
  price: number;
  maxChannels: number;
  broadcastLimit: number;
  desc?: string;
  editableCommands?: { command: string; maxLimit: number }[];
}

export function MirrorAdmin() {
  const [bots, setBots] = useState<MirrorBot[]>([]);
  const [tierConfig, setTierConfig] = useState<TierConfig[]>([]);
  const [allCommands, setAllCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editing Tier state
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierName, setEditTierName] = useState('');
  const [editTierPrice, setEditTierPrice] = useState(0);
  const [editTierChannels, setEditTierChannels] = useState(0);
  const [editTierBroadcast, setEditTierBroadcast] = useState(0);
  const [editTierDesc, setEditTierDesc] = useState('');
  const [editTierEditableCommands, setEditTierEditableCommands] = useState<{ command: string; maxLimit: number }[]>([]);

  // Editing Bot Details Modal/Form State
  const [editingBot, setEditingBot] = useState<MirrorBot | null>(null);
  const [editBotPlan, setEditBotPlan] = useState<'free' | 'silver' | 'gold' | 'max'>('free');
  const [editBotIsActive, setEditBotIsActive] = useState(true);
  const [editBotCustomName, setEditBotCustomName] = useState('');
  const [editBotExpiryStr, setEditBotExpiryStr] = useState('');
  const [editBotGroupCredits, setEditBotGroupCredits] = useState(50);
  const [editBotOwnerId, setEditBotOwnerId] = useState('');

  // Broadcaster State
  const [bcMessage, setBcMessage] = useState('');
  const [bcTargetPlan, setBcTargetPlan] = useState('all');
  const [bcStatus, setBcStatus] = useState({ sending: false, success: 0, failed: 0 });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await axios.get('/api/admin/mirror-bots');
      if (res.data.success) {
        setBots(res.data.bots || []);
        setTierConfig(res.data.tierConfig || []);
      } else {
        setErrorMsg('Failed loading data from server');
      }

      const cmdRes = await axios.get('/api/commands');
      setAllCommands(cmdRes.data || []);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Error occurred connecting to administration API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStartEditTier = (tier: TierConfig) => {
    setEditingTierId(tier.id);
    setEditTierName(tier.name);
    setEditTierPrice(tier.price);
    setEditTierChannels(tier.maxChannels);
    setEditTierBroadcast(tier.broadcastLimit);
    setEditTierDesc(tier.desc || '');
    setEditTierEditableCommands(tier.editableCommands || []);
  };

  const handleSaveTier = async (tierId: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updatedList = tierConfig.map(t => {
        if (t.id === tierId) {
          return {
            ...t,
            name: editTierName,
            price: Number(editTierPrice),
            maxChannels: Number(editTierChannels),
            broadcastLimit: Number(editTierBroadcast),
            desc: editTierDesc,
            editableCommands: editTierEditableCommands
          };
        }
        return t;
      });

      const res = await axios.post('/api/admin/mirror-bots/tier-config', {
        tierConfig: updatedList
      });

      if (res.data.success) {
        setTierConfig(updatedList);
        setEditingTierId(null);
        setSuccessMsg(`Sucessfully updated subscription tier definitions for ${tierId.toUpperCase()}!`);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not save tier configurations.');
    }
  };

  const handleToggleBotActive = async (bot: MirrorBot) => {
    const nextState = !bot.isActive;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await axios.post('/api/admin/mirror-bots/update', {
        token: bot.token,
        isActive: nextState
      });
      if (res.data.success) {
        setBots(bots.map(b => b.token === bot.token ? { ...b, isActive: nextState } : b));
        setSuccessMsg(`Clonal poller for @${bot.botUsername || 'MirrorBot'} was ${nextState ? 'Activated/Started' : 'Deactivated/Stopped'}!`);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Error toggling mirror state.');
    }
  };

  const handleDeleteBot = async (token: string, username?: string) => {
    if (!window.confirm(`Are you absolutely sure you want to COMPLETELY REMOVE the mirrored bot @${username || 'Clone'} and stop its event listener? This action is irreversible!`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await axios.post('/api/admin/mirror-bots/delete', { token });
      if (res.data.success) {
        setBots(bots.filter(b => b.token !== token));
        setSuccessMsg(`Mirrored bot @${username || 'Clone'} has been successfully removed.`);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed deleting mirror bot clone.');
    }
  };

  const handleOpenEditBot = (bot: MirrorBot) => {
    setEditingBot(bot);
    setEditBotPlan(bot.plan);
    setEditBotIsActive(bot.isActive);
    setEditBotCustomName(bot.customBotName || '');
    setEditBotGroupCredits(bot.defaultGroupCredits || 50);
    setEditBotOwnerId(bot.ownerTelegramId || '');
    if (bot.expiresAt) {
      setEditBotExpiryStr(new Date(bot.expiresAt).toISOString().split('T')[0]);
    } else {
      setEditBotExpiryStr('');
    }
  };

  const handleSaveBotEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const p = {
        token: editingBot.token,
        plan: editBotPlan,
        isActive: editBotIsActive,
        customBotName: editBotCustomName,
        defaultGroupCredits: Number(editBotGroupCredits),
        ownerTelegramId: editBotOwnerId,
        expiresAt: editBotExpiryStr ? new Date(editBotExpiryStr).toISOString() : null
      };

      const res = await axios.post('/api/admin/mirror-bots/update', p);
      if (res.data.success) {
        setBots(bots.map(b => b.token === editingBot.token ? { 
          ...b, 
          plan: editBotPlan,
          isActive: editBotIsActive,
          customBotName: editBotCustomName,
          defaultGroupCredits: editBotGroupCredits,
          ownerTelegramId: editBotOwnerId,
          expiresAt: editBotExpiryStr || undefined
        } : b));
        setEditingBot(null);
        setSuccessMsg(`Successfully updated database configuration and polling client properties for @${editingBot.botUsername || 'MirrorBot'}!`);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Error saving custom bot changes');
    }
  };

  // Broadcast campaign to mirror owners
  const handleBroadcastToOwners = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bcMessage.trim()) return;
    if (!window.confirm("Confirm sending system administration broadcast to your clone owners?")) return;

    setBcStatus({ sending: true, success: 0, failed: 0 });
    setErrorMsg('');
    setSuccessMsg('');

    // Fetch matching owners and tokens
    const targets = bots.filter(b => {
      if (bcTargetPlan !== 'all' && b.plan !== bcTargetPlan) return false;
      return true;
    });

    if (targets.length === 0) {
      setErrorMsg("No mirror bot targets found matching current criteria.");
      setBcStatus({ sending: false, success: 0, failed: 0 });
      return;
    }

    let successes = 0;
    let failures = 0;

    // Send messages directly using Telegram Admin proxy
    for (const target of targets) {
      try {
        // Post message directly to the owner through API
        await axios.post('/api/mirror-bots/broadcast', {
          token: target.token,
          target: 'users',
          message: `📢 *[SYSTEM ADMIN ANNOUNCEMENT]*\n\n${bcMessage}`
        });
        successes++;
      } catch (err) {
        failures++;
      }
    }

    setBcStatus({ sending: false, success: successes, failed: failures });
    setSuccessMsg(`Successfully processed local announcements! Sent to ${successes} clone networks (${failures} skipped).`);
    setBcMessage('');
  };

  // Process filters
  const filteredBots = bots.filter((b) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (b.botName || '').toLowerCase().includes(query) ||
      (b.botUsername || '').toLowerCase().includes(query) ||
      (b.customBotName || '').toLowerCase().includes(query) ||
      (b.ownerTelegramId || '').includes(query) ||
      (b.token || '').includes(query);

    const matchesPlan = selectedPlanFilter === 'all' || b.plan === selectedPlanFilter;
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && b.isActive) || 
      (statusFilter === 'inactive' && !b.isActive);

    return matchesSearch && matchesPlan && matchesStatus;
  });

  // Calculate high-performance aggregate metrics
  const activeCount = bots.filter(b => b.isActive).length;
  const totalUsersInClones = bots.reduce((acc, b) => acc + (b.stats?.totalUsers || 0), 0);
  const totalGroupsInClones = bots.reduce((acc, b) => acc + (b.stats?.totalGroups || 0), 0);

  // Approximate pricing projected revenue
  const projectedMonthlyRevenue = bots.reduce((acc, b) => {
    const configPrice = tierConfig.find(tc => tc.id === b.plan)?.price || 0;
    return acc + configPrice;
  }, 0);

  return (
    <div className="space-y-8" id="mirror_admin_panel">
      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-semibold animate-pulse">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl text-xs font-semibold">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <p>{successMsg}</p>
        </div>
      )}

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Clones</p>
            <h3 className="text-xl font-black text-gray-950 font-mono">
              {loading ? '...' : bots.length} <span className="text-xs text-gray-400 font-semibold font-sans">bots</span>
            </h3>
            <p className="text-[10px] text-green-600 font-semibold mt-0.5">● {activeCount} instances online</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-xl text-green-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Clone Audiences</p>
            <h3 className="text-xl font-black text-gray-950 font-mono">
              {loading ? '...' : totalUsersInClones} <span className="text-xs text-gray-400 font-semibold font-sans">users</span>
            </h3>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Across cloned ecosystems</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-yellow-50 rounded-xl text-yellow-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Clone Groups</p>
            <h3 className="text-xl font-black text-gray-950 font-mono">
              {loading ? '...' : totalGroupsInClones} <span className="text-xs text-gray-400 font-semibold font-sans">groups</span>
            </h3>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Tracking group channels</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-150 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Monthly Potential Run-rate</p>
            <h3 className="text-xl font-black text-emerald-700 font-mono">
              {loading ? '...' : `₹${projectedMonthlyRevenue}`}
            </h3>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Based on active subscription tiers</p>
          </div>
        </div>
      </div>

      {/* Subscription Tiers Management Grid */}
      <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 gap-2">
          <div>
            <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5 uppercase">
              <Settings2 className="w-4 h-4 text-indigo-600" /> Manage Mirror Subscription Tiers
            </h2>
            <p className="text-[11px] text-gray-500 mt-1">Configure limits, quotas, monthly rental prices, and channel verification scopes per subscription level.</p>
          </div>
          <button onClick={loadData} className="sm:self-center p-1.5 px-3 bg-gray-50 border rounded-lg hover:bg-gray-100 font-bold text-[10px] flex items-center gap-1 cursor-pointer">
            <RefreshCw className="w-3 h-3" /> Sync Tiers
          </button>
        </div>

        {loading ? (
          <div className="h-28 flex items-center justify-center text-xs text-gray-400 font-bold tracking-widest uppercase">
            Loading subscription configurations ...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tierConfig.map((tier) => {
              const isEditing = editingTierId === tier.id;
              const badgeColors: any = {
                free: 'bg-gray-100 text-gray-800 border-gray-200',
                silver: 'bg-blue-50 text-blue-800 border-blue-200',
                gold: 'bg-amber-50 text-amber-800 border-amber-200',
                max: 'bg-purple-50 text-purple-800 border-purple-200'
              };

              return (
                <div key={tier.id} className="border rounded-xl p-4 bg-gray-50/50 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColors[tier.id] || 'bg-gray-100'}`}>
                        {tier.id.toUpperCase()}
                      </span>
                      {!isEditing && (
                        <button 
                          onClick={() => handleStartEditTier(tier)}
                          className="text-[10px] text-indigo-600 font-extrabold hover:underline"
                        >
                          Modify Parameters
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2.5 text-xs">
                        <div>
                          <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Tier Plan Name</label>
                          <input 
                            type="text" 
                            value={editTierName}
                            onChange={(e) => setEditTierName(e.target.value)}
                            className="bg-white border rounded px-1.5 py-1 w-full font-sans font-semibold text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Monthly Price (₹)</label>
                          <input 
                            type="number" 
                            value={editTierPrice}
                            onChange={(e) => setEditTierPrice(Number(e.target.value))}
                            className="bg-white border rounded px-1.5 py-1 w-full font-mono text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Forced Channels</label>
                            <input 
                              type="number" 
                              value={editTierChannels}
                              onChange={(e) => setEditTierChannels(Number(e.target.value))}
                              className="bg-white border rounded px-1.5 py-1 w-full font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Day Broadcasts</label>
                            <input 
                              type="number" 
                              value={editTierBroadcast}
                              onChange={(e) => setEditTierBroadcast(Number(e.target.value))}
                              className="bg-white border rounded px-1.5 py-1 w-full font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Description Summary</label>
                          <input 
                            type="text" 
                            value={editTierDesc}
                            onChange={(e) => setEditTierDesc(e.target.value)}
                            className="bg-white border rounded px-1.5 py-1 w-full text-xs"
                          />
                        </div>

                        <div className="border border-indigo-100 bg-indigo-50/20 rounded-lg p-2 mt-1 space-y-1">
                          <p className="text-[9px] font-bold text-indigo-950 uppercase tracking-wider">Editable Command Credits</p>
                          <p className="text-[8px] text-gray-500">Pick which commands this tier can override and upto what limit.</p>
                          <div className="max-h-24 overflow-y-auto space-y-1 pr-1 divide-y divide-gray-100">
                            {allCommands.length === 0 && <p className="text-[8px] italic text-gray-400">No commands registered.</p>}
                            {allCommands.map(c => {
                              const isSelected = editTierEditableCommands?.some(ec => ec.command === c.command);
                              const currentLimit = editTierEditableCommands?.find(ec => ec.command === c.command)?.maxLimit || 0;
                              
                              return (
                                <div key={c.command} className="flex items-center justify-between pt-1 pb-1 gap-1">
                                  <label className="flex items-center gap-1 cursor-pointer select-none">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setEditTierEditableCommands([...editTierEditableCommands, { command: c.command, maxLimit: c.defaultDailyCredits || 100 }]);
                                        } else {
                                          setEditTierEditableCommands(editTierEditableCommands.filter(ec => ec.command !== c.command));
                                        }
                                      }}
                                      className="rounded text-indigo-600 focus:ring-indigo-0 w-2.5 h-2.5"
                                    />
                                    <span className="text-[9px] font-mono font-bold text-gray-700">{c.command}</span>
                                  </label>
                                  {isSelected && (
                                    <div className="flex items-center gap-0.5">
                                      <span className="text-[8px] text-gray-400 uppercase">Max:</span>
                                      <input 
                                        type="number"
                                        value={currentLimit}
                                        onChange={(e) => {
                                          const val = Number(e.target.value);
                                          setEditTierEditableCommands(editTierEditableCommands.map(ec => ec.command === c.command ? { ...ec, maxLimit: val } : ec));
                                        }}
                                        className="bg-white border text-[9px] rounded font-mono w-12 px-0.5 py-0 text-center"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-sm text-gray-900">{tier.name}</h4>
                          <p className="font-mono text-emerald-700 font-black text-base">₹{tier.price}/mo</p>
                          <p className="text-[10px] text-gray-400 leading-tight">{tier.desc || 'No tier descriptions saved yet'}</p>
                        </div>
                        
                        {/* Summary of editable commands */}
                        <div className="bg-white border rounded-lg p-2 text-[10px] text-gray-600 space-y-1">
                          <p className="font-bold text-gray-700 border-b pb-0.5 text-[9px] uppercase tracking-wide">🔧 Editable Daily Credits Limits:</p>
                          {tier.editableCommands && tier.editableCommands.length > 0 ? (
                            <div className="space-y-0.5 max-h-20 overflow-y-auto">
                              {tier.editableCommands.map((ec: any) => (
                                <div key={ec.command} className="flex justify-between font-mono text-[9px]">
                                  <span className="text-gray-600">{ec.command}</span>
                                  <span className="text-indigo-700 font-bold bg-indigo-50 px-1 rounded">Upto {ec.maxLimit}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[8px] italic text-gray-400">None are editable in this plan.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-2 space-y-1.5 text-[10px] text-gray-700">
                    {!isEditing && (
                      <>
                        <div className="flex justify-between">
                          <span>Max Force Channels Allowed:</span>
                          <span className="font-bold text-gray-900 font-mono">{tier.maxChannels}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Broadcast limits / day:</span>
                          <span className="font-bold text-gray-900 font-mono">{tier.broadcastLimit}</span>
                        </div>
                      </>
                    )}

                    {isEditing && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleSaveTier(tier.id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-1 px-3.5 rounded text-[10px] cursor-pointer"
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => setEditingTierId(null)}
                          className="bg-white border hover:bg-gray-100 text-gray-600 font-bold p-1 px-2 rounded text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clones Core Management Database Container */}
      <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 gap-4">
          <div>
            <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5 uppercase">
              <Bot className="w-5 h-5 text-indigo-600" /> Active Clones Global Control Console ({filteredBots.length})
            </h2>
            <p className="text-[11px] text-gray-500 mt-1">Supervise, promote plans, verify credentials, modify expiration timetables, and toggle hosting statuses for all live clones.</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {/* Search */}
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2" />
              <input 
                type="text" 
                placeholder="Search clones, owners, tokens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 font-sans font-medium"
              />
            </div>

            {/* Filter Plan */}
            <select
              value={selectedPlanFilter}
              onChange={(e) => setSelectedPlanFilter(e.target.value)}
              className="border rounded-lg p-1.5 text-xs bg-white focus:outline-none"
            >
              <option value="all">All Plan Tiers</option>
              <option value="free">Free</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
              <option value="max">Max / White-label</option>
            </select>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg p-1.5 text-xs bg-white focus:outline-none"
            >
              <option value="all">All States</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* List of registered mirror bots */}
        {loading ? (
          <div className="h-44 flex items-center justify-center text-xs font-bold text-gray-400 uppercase tracking-widest">
            Fetching active master databases ...
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-gray-50/50 text-gray-400">
            <Bot className="w-8 h-8 text-gray-300 stroke-1 mb-1.5" />
            <p className="text-xs font-semibold">No registered mirror bot clones found matching query criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-150 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  <th className="p-3">CLONAL BOT DETAIL</th>
                  <th className="p-3">OWNER TELEGRAM ID</th>
                  <th className="p-3">TIER PLAN</th>
                  <th className="p-3 text-center">TRAFFIC AUDIENCE</th>
                  <th className="p-3 text-center">GATEWAY STATE</th>
                  <th className="p-3">EXPIRATION TIMELINE</th>
                  <th className="p-3 text-center">HOST ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {filteredBots.map((bot) => {
                  const planBadges: any = {
                    free: 'bg-gray-100 text-gray-800 border-gray-200',
                    silver: 'bg-blue-50 text-blue-800 border-blue-200',
                    gold: 'bg-amber-50 text-amber-800 border-amber-200',
                    max: 'bg-purple-50 text-purple-800 border-purple-200'
                  };

                  return (
                    <tr key={bot.token} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-900 text-sm">
                            {bot.customBotName || bot.botName || 'Mirrored Clone'}
                          </span>
                          {bot.botUsername && (
                            <a 
                              href={`https://t.me/${bot.botUsername}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-[10px] text-indigo-500 font-bold hover:underline"
                            >
                              @{bot.botUsername}
                            </a>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono truncate max-w-xs" title={bot.token}>
                          Token: {bot.token.slice(0, 15)}...
                        </p>
                      </td>

                      <td className="p-3 font-mono font-semibold text-gray-700">
                        {bot.ownerTelegramId || 'Anonymous'}
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${planBadges[bot.plan] || 'bg-gray-100'}`}>
                          {bot.plan}
                        </span>
                      </td>

                      <td className="p-3 text-center space-y-0.5">
                        <div className="flex items-center justify-center gap-2 font-mono font-medium text-gray-800 text-[11px]">
                          <span title="Subscribed users count" className="flex items-center gap-0.5 text-teal-800">
                            👤 {bot.stats?.totalUsers || 0}
                          </span>
                          <span title="Linked Group channels tracking count" className="flex items-center gap-0.5 text-indigo-800">
                            👥 {bot.stats?.totalGroups || 0}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleToggleBotActive(bot)}
                          className="inline-flex items-center justify-center"
                          title="Click to quickly toggle active status poller"
                        >
                          {bot.isActive ? (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2.5 py-0.5 rounded-full text-[10px] flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span> ONLINE
                            </span>
                          ) : (
                            <span className="bg-rose-50 text-rose-800 border border-rose-200 font-bold px-2.5 py-0.5 rounded-full text-[10px] flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> OFFLINE
                            </span>
                          )}
                        </button>
                      </td>

                      <td className="p-3">
                        {bot.expiresAt ? (
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-800 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" /> 
                              {new Date(bot.expiresAt).toLocaleDateString()}
                            </p>
                            <p className="text-[9px] text-gray-400 font-mono">
                              {new Date(bot.expiresAt).getTime() < Date.now() ? (
                                <span className="text-red-600 font-semibold uppercase">Expired Subscription</span>
                              ) : (
                                <span className="text-emerald-600 font-semibold">
                                  {Math.ceil((new Date(bot.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left
                                </span>
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">Lifetime free tier</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleOpenEditBot(bot)}
                            className="p-1 text-slate-600 hover:text-indigo-650 hover:bg-slate-100 rounded border border-gray-200 cursor-pointer text-[10px] font-bold"
                            title="Edit database info & quotas"
                          >
                            Edit Quota
                          </button>
                          
                          <button
                            onClick={() => handleDeleteBot(bot.token, bot.botUsername)}
                            className="p-1 px-1.5 bg-red-50 text-red-600 border border-red-100 rounded hover:bg-red-100 cursor-pointer text-[10px] font-bold"
                            title="Complete clonal extraction deletion"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingBot && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-gray-150 p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-black text-gray-950 flex items-center gap-1.5 uppercase">
                <Edit className="w-4 h-4 text-indigo-600" /> Modify Clone DB Quotas
              </h3>
              <button 
                onClick={() => setEditingBot(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xs"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveBotEdits} className="space-y-4 text-xs font-semibold">
              <p className="p-2.5 bg-indigo-50 border border-indigo-100 text-[11px] rounded-lg text-indigo-900 leading-relaxed font-normal">
                Modifying properties for <strong className="font-extrabold text-gray-950">@{editingBot.botUsername || 'MirrorBot'}</strong>. Changes are loaded instantly after restarting poller.
              </p>

              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Mirror Subscription Promotion Tier</label>
                <select 
                  value={editBotPlan}
                  onChange={(e: any) => setEditBotPlan(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 bg-white text-xs"
                >
                  <option value="free">Free - Lifetime Base Clone</option>
                  <option value="silver">Silver - Command exclusion unlocked</option>
                  <option value="gold">Gold - High command balance override, dual force channels</option>
                  <option value="max">Max - Custom API-based commands + Unlimited channels</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">State Hosting</label>
                  <select
                    value={editBotIsActive ? 'active' : 'inactive'}
                    onChange={(e) => setEditBotIsActive(e.target.value === 'active')}
                    className="w-full border rounded-lg px-2.5 py-1.5 bg-white text-xs"
                  >
                    <option value="active">Active (Started)</option>
                    <option value="inactive">Paused (Offline)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Group Standard credits</label>
                  <input 
                    type="number" 
                    value={editBotGroupCredits}
                    onChange={(e) => setEditBotGroupCredits(Number(e.target.value))}
                    className="w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Owner Telegram User Numeric ID</label>
                <input 
                  type="text" 
                  value={editBotOwnerId}
                  onChange={(e) => setEditBotOwnerId(e.target.value)}
                  placeholder="e.g. 52910392"
                  className="w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Branded Custom Name Allocation</label>
                <input 
                  type="text" 
                  value={editBotCustomName}
                  onChange={(e) => setEditBotCustomName(e.target.value)}
                  placeholder="Leave empty for telegram native default first_name"
                  className="w-full border rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-[10px] uppercase font-bold mb-1">Expiration Timeline (Expires At)</label>
                <input 
                  type="date" 
                  value={editBotExpiryStr}
                  onChange={(e) => setEditBotExpiryStr(e.target.value)}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                />
                <p className="text-[9px] text-gray-400 mt-1">Leave blank to make it a perpetual lifetime package.</p>
              </div>

              <div className="flex gap-2 pt-2 justify-end border-t">
                <button
                  type="button"
                  onClick={() => setEditingBot(null)}
                  className="p-1.5 px-4 bg-white border hover:bg-slate-100 font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="p-1.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Apply Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Broadcast messages specifically to your Mirror Bot clone owner subnetworks */}
      <div className="bg-white rounded-2xl border border-gray-150 shadow-xs p-6 space-y-6">
        <div>
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5 uppercase">
            <Radio className="w-5 h-5 text-indigo-600" /> Broadcast System Announcements to Clone Owners
          </h2>
          <p className="text-[11px] text-gray-500 mt-1">Dispenses notifications right to bot creators to warn about firmware enhancements, subscription renewal requirements, or custom billing structures.</p>
        </div>

        <form onSubmit={handleBroadcastToOwners} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4 md:col-span-1">
            <div className="text-xs font-semibold">
              <label className="block text-gray-400 text-[10px] uppercase font-bold mb-1">Target Subscriber Plan Filtration</label>
              <select 
                value={bcTargetPlan}
                onChange={(e) => setBcTargetPlan(e.target.value)}
                className="w-full border rounded-lg p-2.5 bg-white font-medium"
              >
                <option value="all">Complete Network Owners (All Tiers)</option>
                <option value="free">Free Tier Owners Only</option>
                <option value="silver">Silver Tier Owners Only</option>
                <option value="gold">Gold Tier Pro Owners Only</option>
                <option value="max">Max Whitelabel Owners Only</option>
              </select>
            </div>

            <div className="p-3.5 bg-gray-50 border rounded-xl text-xs space-y-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Target Estimate Count</p>
              <p className="text-base font-black text-gray-900">
                {bots.filter(b => bcTargetPlan === 'all' || b.plan === bcTargetPlan).length} registered bot owners
              </p>
              {bcStatus.sending && (
                <div className="text-[10px] text-indigo-600 font-bold animate-pulse pt-1">
                  📡 Broadcasting in progress! Please wait...
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 md:col-span-2">
            <div className="text-xs font-semibold">
              <label className="block text-gray-400 text-[10px] uppercase font-bold mb-1">Markdown Message Composition</label>
              <textarea 
                rows={5}
                required
                value={bcMessage}
                onChange={(e) => setBcMessage(e.target.value)}
                placeholder="Compose announcements. System header will be automatically prepended..."
                className="w-full border rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs font-medium leading-relaxed"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={bcStatus.sending || !bcMessage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2 px-5 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <Mail className="w-4 h-4" /> Dispatch System Broadcast Announcement
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
