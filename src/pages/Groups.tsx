import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, ShieldAlert, ShieldCheck, Infinity, Check, X, Edit2 } from 'lucide-react';

export function Groups() {
  const [groups, setGroups] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState<number>(0);

  useEffect(() => { loadGroups(); }, []);

  const loadGroups = () => axios.get('/api/groups').then(res => setGroups(res.data));

  const toggleBan = async (id: string, current: boolean) => {
    await axios.put(`/api/groups/${id}`, { isBanned: !current });
    loadGroups();
  };

  const toggleUnlimited = async (id: string, current: boolean) => {
    await axios.put(`/api/groups/${id}`, { isUnlimited: !current });
    loadGroups();
  };

  const startEditLimit = (id: string, limit: number) => {
    setEditingId(id);
    setEditLimit(limit);
  };

  const saveEditLimit = async (id: string) => {
    await axios.put(`/api/groups/${id}`, { dailyLimit: editLimit });
    setEditingId(null);
    loadGroups();
  };

  const filteredGroups = groups.filter(g => 
    (g.title && String(g.title).toLowerCase().includes(searchQuery.toLowerCase())) ||
    (g.telegramId && String(g.telegramId).includes(searchQuery)) ||
    (searchQuery.trim() === '')
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">Bot Groups</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search groups..." 
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
              <th className="px-6 py-3">Group Title</th>
              <th className="px-6 py-3">Group ID</th>
              <th className="px-6 py-3 text-center">Interactions</th>
              <th className="px-6 py-3 text-center">Daily Quota</th>
              <th className="px-6 py-3 text-center">Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredGroups.map((g) => (
              <tr key={g._id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 font-medium text-gray-900">{g.title || 'Unknown Group'}</td>
                <td className="px-6 py-4 text-gray-500 font-mono">{g.telegramId}</td>
                <td className="px-6 py-4 text-center">{g.interactions}</td>
                <td className="px-6 py-4 text-center">
                   {g.isUnlimited ? (
                     <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-semibold">
                       <Infinity className="w-3 h-3" /> Unlimited
                     </span>
                   ) : (
                     <div className="flex items-center justify-center gap-2">
                       {editingId === g._id ? (
                         <>
                           <input type="number" className="w-16 px-2 py-1 text-xs border rounded" value={editLimit} onChange={(e) => setEditLimit(Number(e.target.value))} />
                           <button onClick={() => saveEditLimit(g._id)} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                           <button onClick={() => setEditingId(null)} className="text-red-600 hover:text-red-800"><X className="w-4 h-4" /></button>
                         </>
                       ) : (
                         <>
                           <span className="font-semibold text-gray-700">{g.dailyUsed || 0} / {g.dailyLimit || 50}</span>
                           <button onClick={() => startEditLimit(g._id, g.dailyLimit || 50)} className="text-gray-400 hover:text-indigo-600"><Edit2 className="w-3 h-3" /></button>
                         </>
                       )}
                     </div>
                   )}
                </td>
                <td className="px-6 py-4 text-center">
                  {g.isBanned ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs">Banned</span> : <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">Active</span>}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => toggleUnlimited(g._id, g.isUnlimited)}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors ${g.isUnlimited ? 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      title="Toggle Unlimited Quota"
                    >
                      {g.isUnlimited ? 'Revoke ∞' : 'Grant ∞'}
                    </button>
                    <button 
                      onClick={() => toggleBan(g._id, g.isBanned)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title={g.isBanned ? "Unban Group" : "Ban Group"}
                    >
                      {g.isBanned ? <ShieldCheck className="w-5 h-5 text-green-600" /> : <ShieldAlert className="w-5 h-5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
