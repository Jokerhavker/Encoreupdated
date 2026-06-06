import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, X, PlusCircle, Network, Lock } from 'lucide-react';

export function Commands() {
  const [commands, setCommands] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { loadCommands(); }, []);

  const loadCommands = () => axios.get('/api/commands').then(res => setCommands(res.data));

  const deleteCommand = async (id: string) => {
    if(confirm('Delete this command?')) {
      await axios.delete(`/api/commands/${id}`);
      loadCommands();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Bot Commands</h2>
        <button 
          onClick={() => setEditing({ command: '', isApi: false, isPremium: false, isCreditBased: false, defaultDailyCredits: 0, buyCreditsUrl: '', inlineButtons: [], autoDeleteMs: 0 })}
          className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Command
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {commands.map(cmd => (
          <div key={cmd._id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-indigo-700">{cmd.command}</span>
                  {cmd.isPremium && <Lock className="w-4 h-4 text-amber-500" title="Premium / Paid Command" />}
                  {cmd.isCreditBased && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase" title="Credit Based Command">Credit</span>}
                  {cmd.isApi && <Network className="w-4 h-4 text-emerald-500" title="API Backend" />}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(cmd)} className="p-1.5 text-gray-400 hover:text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => deleteCommand(cmd._id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">{cmd.description || 'No description'}</p>
              
              <div className="space-y-2 mt-4 pt-4 border-t border-gray-50 flex flex-col text-xs text-gray-500">
                <div className="flex justify-between"><span>Auto-delete:</span> <span>{cmd.autoDeleteMs ? `${cmd.autoDeleteMs}s` : 'Off'}</span></div>
                <div className="flex justify-between">
                  <span>Logic:</span> 
                  <span className="font-medium text-gray-700 flex gap-2">
                    {cmd.isPremium ? <span className="text-amber-600">Paid</span> : <span className="text-gray-500">Free</span>}
                    {cmd.isCreditBased && <span className="text-blue-600 text-[10px] bg-blue-50 px-1 rounded-sm border border-blue-100">{cmd.defaultDailyCredits || 0} / day</span>}
                  </span>
                </div>
                {cmd.isApi && <div className="truncate mt-1 text-emerald-600 font-mono" title={cmd.apiUrl}>{cmd.apiUrl}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <CommandModal cmd={editing} onClose={() => setEditing(null)} onSave={loadCommands} />}
    </div>
  );
}

function CommandModal({ cmd, onClose, onSave }: any) {
  const [form, setForm] = useState({ ...cmd });

  const save = async () => {
    try {
      const payload = { ...form };
      if (!payload._id) { delete payload._id; }
      
      await axios.post('/api/commands', payload);
      onSave();
      onClose();
    } catch(e: any) {
      console.error(e);
      alert('Error saving command: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h3 className="text-lg font-medium">{form._id ? 'Edit Command' : 'New Command'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Command Trigger</label>
              <input type="text" value={form.command} onChange={e => setForm({...form, command: e.target.value})} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="/test" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Auto Delete (Seconds)</label>
              <input type="number" value={form.autoDeleteMs || 0} onChange={e => setForm({...form, autoDeleteMs: Number(e.target.value)})} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input type="text" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="What does this do?" />
          </div>

          <div className="flex flex-wrap gap-4 border border-gray-200 p-4 rounded-lg bg-gray-50/50">
            <div className="flex items-center gap-2 w-full md:w-auto break-words">
              <input type="checkbox" id="isPremium" checked={form.isPremium} onChange={e => setForm({...form, isPremium: e.target.checked})} className="rounded text-amber-600 border-gray-300" />
              <label htmlFor="isPremium" className="text-sm font-medium text-amber-800">Paid Command? (Admins & Paid Users Only)</label>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto break-words">
              <input type="checkbox" id="isCreditBased" checked={form.isCreditBased} onChange={e => setForm({...form, isCreditBased: e.target.checked})} className="rounded text-blue-600 border-gray-300" />
              <label htmlFor="isCreditBased" className="text-sm font-medium text-blue-800">Credit Based? (Limited Daily Uses)</label>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto break-words">
              <input type="checkbox" id="isApi" checked={form.isApi} onChange={e => setForm({...form, isApi: e.target.checked})} className="rounded text-indigo-600 border-gray-300" />
              <label htmlFor="isApi" className="text-sm font-medium text-gray-700">Fetch dynamic data from API?</label>
            </div>
          </div>

          {form.isCreditBased && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-blue-100 rounded-lg p-4 bg-blue-50/30">
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-800">Default Daily Credits</label>
                <input type="number" value={form.defaultDailyCredits || 0} onChange={e => setForm({...form, defaultDailyCredits: Number(e.target.value)})} className="w-full border border-blue-200 rounded-md px-3 py-2 text-sm" />
                <p className="text-xs text-blue-600 mt-1">Number of times a standard user can use this per day.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-800">"Buy Paid Credits" Button URL</label>
                <input type="url" value={form.buyCreditsUrl || ''} onChange={e => setForm({...form, buyCreditsUrl: e.target.value})} className="w-full border border-blue-200 rounded-md px-3 py-2 text-sm" placeholder="https://t.me/admin_username" />
                <p className="text-xs text-blue-600 mt-1">URL opened when user clicks to buy more credits.</p>
              </div>
            </div>
          )}

          {form.isApi && (
            <div>
              <label className="block text-sm font-medium mb-1 text-emerald-700">API endpoint URL</label>
              <input type="text" value={form.apiUrl || ''} onChange={e => setForm({...form, apiUrl: e.target.value})} className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm" placeholder="https://api.example.com?query={param}" />
              <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{"{param}"}</code> where the user input should be inserted.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Response Message Template</label>
            <textarea value={form.decoratedMessage || ''} onChange={e => setForm({...form, decoratedMessage: e.target.value})} rows={5} className="w-full border rounded-md px-3 py-2 text-sm font-mono" placeholder="Here is the result:\n```\n{{api.response}}\n```"></textarea>
            <p className="text-xs text-gray-400 mt-1">Use Markdown. If using API, <code className="bg-gray-100 px-1 rounded">{"{{api.response}}"}</code> will be replaced with API output.</p>
          </div>

          <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium">Inline Buttons</label>
              <button className="text-xs flex items-center text-indigo-600 font-medium" onClick={() => setForm({...form, inlineButtons: [...(form.inlineButtons||[]), {label: '', url: ''}]})}>
                <PlusCircle className="w-3 h-3 mr-1" /> Add Button
              </button>
            </div>
            <div className="space-y-2">
              {(form.inlineButtons||[]).map((btn: any, idx: number) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input type="text" placeholder="Label" value={btn.label} onChange={e => { const nm = [...form.inlineButtons]; nm[idx].label = e.target.value; setForm({...form, inlineButtons: nm}); }} className="w-1/3 border rounded px-2 py-1.5 text-sm" />
                  <input type="url" placeholder="https://" value={btn.url} onChange={e => { const nm = [...form.inlineButtons]; nm[idx].url = e.target.value; setForm({...form, inlineButtons: nm}); }} className="flex-1 border rounded px-2 py-1.5 text-sm" />
                  <button onClick={() => { const nm = form.inlineButtons.filter((_,i) => i!==idx); setForm({...form, inlineButtons: nm}); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))}
              {(!form.inlineButtons || form.inlineButtons.length === 0) && <div className="text-xs text-gray-400 italic">No buttons added</div>}
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-white border border-gray-300 rounded-md">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Save Command</button>
        </div>
      </div>
    </div>
  );
}
