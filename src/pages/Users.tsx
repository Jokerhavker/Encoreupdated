import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, ShieldAlert, ShieldCheck, Shield, UserCog, Star, Coins, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCreditsUser, setEditingCreditsUser] = useState<any>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = () => axios.get('/api/users').then(res => setUsers(res.data));

  const toggleBan = async (id: string, current: boolean) => {
    await axios.put(`/api/users/${id}`, { isBanned: !current });
    loadUsers();
  };

  const toggleAdmin = async (id: string, current: boolean) => {
    await axios.put(`/api/users/${id}`, { isAdmin: !current });
    loadUsers();
  };
  
  const togglePremium = async (id: string, current: boolean) => {
    await axios.put(`/api/users/${id}`, { isPremium: !current });
    loadUsers();
  };

  const filteredUsers = users.filter(u => 
    (u.firstName && String(u.firstName).toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.username && String(u.username).toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.telegramId && String(u.telegramId).includes(searchQuery)) ||
    (searchQuery.trim() === '')
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Bot Users</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-indigo-500 w-64" 
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs border-b">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Telegram ID</th>
                <th className="px-6 py-3 text-center">Interactions</th>
                <th className="px-6 py-3 text-center">Role & Access</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <div className="flex items-center">
                      {u.firstName || 'Unknown'} {u.username ? `(@${u.username})` : ''}
                      {u.isPremium && <Star className="w-3.5 h-3.5 text-amber-500 ml-2" />}
                    </div>
                    {u.hasStartedBot ? <p className="text-[10px] text-green-600 mt-0.5">Started Bot in PM</p> : <p className="text-[10px] text-gray-400 mt-0.5">Hasn't PM'ed bot</p>}
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-mono">{u.telegramId}</td>
                  <td className="px-6 py-4 text-center">{u.interactions}</td>
                  <td className="px-6 py-4 text-center space-y-1">
                    <div>{u.isAdmin ? <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">Admin</span> : <span className="text-gray-400 text-xs">User</span>}</div>
                    <div>{u.isPremium ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide">PAID MEMBER</span> : null}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {u.isBanned ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs">Banned</span> : <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">Active</span>}
                  </td>
                  <td className="px-6 py-4 text-right space-x-1">
                    <button 
                      onClick={() => setEditingCreditsUser(u)}
                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors" title="Manage Credits"
                    >
                      <Coins className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => togglePremium(u._id, u.isPremium)}
                      className={`p-1.5 rounded transition-colors ${u.isPremium ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`} title={u.isPremium ? "Revoke Paid Access" : "Grant Paid Access"}
                    >
                      <Star className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => toggleAdmin(u._id, u.isAdmin)}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title={u.isAdmin ? "Remove Admin" : "Make Admin"}
                    >
                      {u.isAdmin ? <UserCog className="w-5 h-5 text-indigo-600" /> : <Shield className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => toggleBan(u._id, u.isBanned)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title={u.isBanned ? "Unban User" : "Ban User"}
                    >
                      {u.isBanned ? <ShieldCheck className="w-5 h-5 text-green-600" /> : <ShieldAlert className="w-5 h-5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {editingCreditsUser && (
        <UserCreditsModal 
          user={editingCreditsUser} 
          onClose={() => setEditingCreditsUser(null)} 
          onSave={loadUsers} 
        />
      )}
    </div>
  );
}

function UserCreditsModal({ user, onClose, onSave }: any) {
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<Record<string, {dailyLimit: number, isUnlimited: boolean}>>({});
  const [userGroups, setUserGroups] = useState<any[]>([]);

  const [groupCreditOverride, setGroupCreditOverride] = useState<{ enabled: boolean, limit: number, isUnlimited: boolean }>({ enabled: false, limit: 50, isUnlimited: false });
  const [commonCredits, setCommonCredits] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      axios.get('/api/commands'),
      axios.get('/api/groups')
    ]).then(([cmdRes, grpRes]) => {
      const creditCmds = cmdRes.data.filter((c: any) => c.isCreditBased);
      setCommands(creditCmds);
      
      const myGroups = grpRes.data.filter((g: any) => g.ownerId === user.telegramId);
      setUserGroups(myGroups);
      
      const initialCredits: any = {};
      const overrides = user.commandCredits || [];
      
      creditCmds.forEach((cmd: any) => {
        const exist = overrides.find((o: any) => o.command === cmd.command);
        if (exist) {
          initialCredits[cmd.command] = { dailyLimit: exist.dailyLimit || 0, isUnlimited: exist.isUnlimited || false };
        } else {
          initialCredits[cmd.command] = undefined;
        }
      });
      setCredits(initialCredits);
      
      setCommonCredits(user.commonCredits || {});
      
      setGroupCreditOverride({
          enabled: user.groupCreditsLimit !== undefined && user.groupCreditsLimit !== null,
          limit: user.groupCreditsLimit || 50,
          isUnlimited: user.isGroupUnlimited || false
      });
      
      setLoading(false);
    });
  }, [user]);

  const handleOverrideSave = async () => {
    const updatedCredits = Object.keys(credits)
      .filter(cmdName => credits[cmdName] !== undefined)
      .map(cmdName => ({
        command: cmdName,
        dailyLimit: credits[cmdName].dailyLimit,
        isUnlimited: credits[cmdName].isUnlimited
      }));
      
    try {
      await axios.put(`/api/users/${user._id}`, { 
          commandCredits: updatedCredits,
          commonCredits: commonCredits,
          groupCreditsLimit: groupCreditOverride.enabled ? groupCreditOverride.limit : null,
          isGroupUnlimited: groupCreditOverride.isUnlimited
      });
      onSave();
      onClose();
    } catch (e: any) {
      alert("Failed to save: " + e.message);
    }
  };

  const getUsageToday = (cmdName: string) => {
    const today = new Date().toISOString().split('T')[0];
    const useRecord = (user.commandUsage || []).find((u: any) => u.command === cmdName);
    if (!useRecord || useRecord.lastResetDate !== today) return 0;
    return useRecord.used || 0;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-medium text-blue-900 flex items-center gap-2"><Coins className="w-5 h-5" /> Override Credits</h3>
            <p className="text-xs text-gray-500 mt-1">For {user.firstName} ({user.telegramId})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-gray-50">
          {loading ? (
             <div className="text-sm text-gray-500 text-center py-4">Loading commands...</div>
          ) : commands.length === 0 ? (
             <div className="text-sm text-gray-500 text-center py-4 bg-white rounded-lg p-6 border border-gray-200">
                You haven't created any "Credit Based" commands yet.
             </div>
          ) : (
            <div className="space-y-6">
              
              {userGroups.length > 0 && (
              <div className="bg-white border rounded-lg p-5 mb-6">
                 <h4 className="font-bold text-gray-800 mb-4">Group Usage Breakdown</h4>
                 <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={userGroups}>
                        <XAxis dataKey="title" hide={true} />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} calls`, 'Daily Usage']} labelFormatter={(label: any, payload: any[]) => {
                             return payload.length > 0 ? payload[0].payload.title || 'Unknown Group' : label;
                        }} />
                        <Bar dataKey="dailyUsed" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                           {userGroups.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                           ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>
              )}

              <div className="bg-white border rounded-lg p-5">
                 <div className="flex justify-between items-center pb-3 border-b border-gray-100 mb-4">
                     <div>
                         <h4 className="font-bold text-gray-800">Group Limits Override</h4>
                         <p className="text-xs text-gray-500">Limits combined usage across all groups owned by this user.</p>
                     </div>
                     <div className="text-right">
                         <span className="text-xs font-medium text-gray-500 block">Usage Today</span>
                         <span className="font-bold text-blue-600">{user.groupCreditsUsed || 0} calls</span>
                     </div>
                 </div>

                 <div className="flex items-center gap-4">
                     <div className="flex items-center text-sm gap-2 whitespace-nowrap">
                       <input 
                         type="checkbox" 
                         id="override-grp"
                         checked={groupCreditOverride.enabled}
                         onChange={(e) => setGroupCreditOverride({...groupCreditOverride, enabled: e.target.checked})}
                       />
                       <label htmlFor="override-grp" className={groupCreditOverride.enabled ? "font-medium text-blue-800":"text-gray-500"}>Override global default?</label>
                     </div>

                     {groupCreditOverride.enabled && (
                        <div className="flex-1 flex items-center gap-3 bg-blue-50/50 p-2 rounded-md border border-blue-100">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id="unlim-grp" checked={groupCreditOverride.isUnlimited} onChange={e => setGroupCreditOverride({...groupCreditOverride, isUnlimited: e.target.checked})} />
                            <label htmlFor="unlim-grp" className="text-xs font-semibold text-emerald-700 uppercase">Unlimited</label>
                          </div>
                          {!groupCreditOverride.isUnlimited && (
                            <div className="flex items-center gap-2 border-l border-blue-200 pl-3">
                              <span className="text-sm">Daily Limit:</span>
                              <input type="number" className="border border-blue-300 w-20 px-2 py-1 rounded text-center text-sm" value={groupCreditOverride.limit} onChange={e => setGroupCreditOverride({...groupCreditOverride, limit: Number(e.target.value)})} />
                            </div>
                          )}
                        </div>
                     )}
                 </div>
              </div>
            
              <div className="space-y-4">
                {commands.map(cmd => {
                const isOverridden = credits[cmd.command] !== undefined;
                const state = credits[cmd.command] || { dailyLimit: cmd.defaultDailyCredits, isUnlimited: false };
                
                return (
                  <div key={cmd._id} className="bg-white border text-sm rounded-lg p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <div>
                        <span className="font-mono font-bold text-indigo-700 block">{cmd.command}</span>
                        <span className="text-xs text-gray-500">Global Default: {cmd.defaultDailyCredits || 0}/day</span>
                      </div>
                      <div className="text-right">
                         <span className="text-xs font-medium text-gray-500 block">Usage Today</span>
                         <span className="font-bold text-blue-600">{getUsageToday(cmd.command)} calls</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex items-center text-sm gap-2 whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          id={`over-${cmd.command}`} 
                          checked={isOverridden}
                          onChange={(e) => {
                            if (e.target.checked) setCredits({...credits, [cmd.command]: { dailyLimit: cmd.defaultDailyCredits, isUnlimited: false }});
                            else setCredits({...credits, [cmd.command]: undefined});
                          }}
                        /> 
                        <label htmlFor={`over-${cmd.command}`} className={isOverridden?"font-medium text-blue-800":"text-gray-500"}>Override global default?</label>
                      </div>
                      
                      {isOverridden && (
                         <div className="flex-1 flex items-center gap-3 bg-blue-50/50 p-2 rounded-md border border-blue-100">
                           <div className="flex items-center gap-2">
                             <input type="checkbox" id={`unlim-${cmd.command}`} checked={state.isUnlimited} onChange={e => setCredits({...credits, [cmd.command]: {...state, isUnlimited: e.target.checked}})} />
                             <label htmlFor={`unlim-${cmd.command}`} className="text-xs font-semibold text-emerald-700 uppercase">Unlimited</label>
                           </div>
                           {!state.isUnlimited && (
                             <div className="flex items-center gap-2 border-l border-blue-200 pl-3">
                               <span>Daily Limit:</span>
                               <input type="number" className="border border-blue-300 w-20 px-2 py-1 rounded text-center" value={state.dailyLimit} onChange={e => setCredits({...credits, [cmd.command]: {...state, dailyLimit: Number(e.target.value)}})} />
                             </div>
                           )}
                           <div className="flex items-center gap-2 border-l border-blue-200 pl-3">
                             <span>Common Credits:</span>
                             <input type="number" className="border border-blue-300 w-20 px-2 py-1 rounded text-center" value={commonCredits[cmd.command] || 0} onChange={e => setCommonCredits({...commonCredits, [cmd.command]: Number(e.target.value)})} />
                           </div>
                         </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-md text-sm font-medium border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleOverrideSave} disabled={loading} className="px-5 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50">Save Overrides</button>
        </div>
      </div>
    </div>
  );
}
