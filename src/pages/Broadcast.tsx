import { useState, useEffect } from 'react';
import axios from 'axios';
import { Send, AlertCircle, Plus, Trash2, Layers, RefreshCw, Globe, CheckCircle2 } from 'lucide-react';

export function Broadcast() {
  const [target, setTarget] = useState('all');
  const [message, setMessage] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [buttonEnabled, setButtonEnabled] = useState(false);
  const [buttonText, setButtonText] = useState('');
  const [buttonAction, setButtonAction] = useState('url');
  const [buttonValue, setButtonValue] = useState('');
  const [buttonStyle, setButtonStyle] = useState('primary');

  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = async () => {
    try {
      const res = await axios.get('/api/broadcast');
      setHistory(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Poll progress if there is an active 'sending' broadcast
  useEffect(() => {
    const hasOngoing = history.some(item => item.status === 'sending');
    if (hasOngoing) {
      const t = setTimeout(() => {
        fetchHistory();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [history]);

  const handleBroadcast = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setResult(null);

    let button = undefined;
    if (buttonEnabled && buttonText.trim() && buttonValue.trim()) {
      button = {
        text: buttonText,
        action: buttonAction,
        value: buttonValue,
        style: buttonStyle
      };
    }

    try {
      const res = await axios.post('/api/broadcast', { 
        target, 
        message, 
        button,
        isGlobal 
      });
      setResult({ success: true, count: 0, ongoing: true });
      setMessage('');
      setButtonText('');
      setButtonValue('');
      setButtonEnabled(false);
      setIsGlobal(false);
      fetchHistory();
    } catch (e: any) {
      setResult({ success: false, error: e.response?.data?.error || e.message });
    }
    setLoading(false);
  };

  const handleCancelBroadcast = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this ongoing broadcast?")) return;
    try {
      await axios.post('/api/broadcast/cancel', { id });
      fetchHistory();
    } catch (e: any) {
      alert("Error cancelling broadcast: " + (e.response?.data?.error || e.message));
    }
  };

  const ongoingBroadcasts = history.filter(item => item.status === 'sending');
  const completedBroadcasts = history.filter(item => item.status !== 'sending');

  return (
    <div className="space-y-8 max-w-4xl">
      {/* 1. Ongoing Box section */}
      {ongoingBroadcasts.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-6 shadow-sm animate-pulse-slow">
          <div className="flex items-center justify-between border-b border-amber-200 pb-3 mb-4">
            <h3 className="text-amber-900 font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              Ongoing Broadcast Processing...
            </h3>
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase">
              Live updates
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ongoingBroadcasts.map((item) => (
              <div key={item._id} className="bg-white p-4 rounded-lg border border-amber-200/60 shadow-xs space-y-3">
                <div className="text-xs text-gray-500 font-mono truncate bg-gray-50 p-2 rounded">
                  <span className="font-bold text-amber-800">Targeting:</span> {item.target.toUpperCase()} {item.isGlobal && "GLOBALLY"}
                </div>
                <div className="text-xs text-gray-700 font-sans truncate">
                  <span className="font-semibold">Text preview:</span> "{item.message}"
                </div>

                {/* Progress Indicators */}
                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                      <span>👤 Target Users:</span>
                      <span className="font-mono text-amber-700 font-bold">
                        {item.successUsers}/{item.totalUsers} sent
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className="bg-amber-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${item.totalUsers > 0 ? (item.successUsers / item.totalUsers) * 100 : 0}%` }}
                      />
                    </div>
                    {item.failedUsers > 0 && (
                      <p className="text-[10px] text-red-600 font-mono mt-0.5">⚠️ {item.failedUsers} users failed to deliver</p>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                      <span>👥 Target Groups:</span>
                      <span className="font-mono text-amber-700 font-bold">
                        {item.successGroups}/{item.totalGroups} sent
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className="bg-amber-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${item.totalGroups > 0 ? (item.successGroups / item.totalGroups) * 100 : 0}%` }}
                      />
                    </div>
                    {item.failedGroups > 0 && (
                      <p className="text-[10px] text-red-600 font-mono mt-0.5">⚠️ {item.failedGroups} groups failed to deliver</p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-amber-100 flex justify-end">
                  <button
                    onClick={() => handleCancelBroadcast(item._id)}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 font-bold text-xs py-1.5 px-3 rounded-lg border border-red-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    🛑 Cancel Broadcast
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Broadcast input card */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-medium mb-6 text-gray-900 border-b pb-4">Broadcast Message</h2>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
              <select 
                value={target} 
                onChange={e => setTarget(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white h-[38px]"
              >
                <option value="all">All Users & Groups</option>
                <option value="users">Private Chat Users Only</option>
                <option value="groups">Groups Only</option>
              </select>
            </div>

            <div className="flex items-end pb-[2px]">
              <div className="flex items-center gap-2 border border-indigo-100 rounded-lg p-2.5 bg-indigo-50/40 w-full h-[38px]">
                <input 
                  type="checkbox" 
                  id="isGlobal" 
                  checked={isGlobal} 
                  onChange={(e) => setIsGlobal(e.target.checked)} 
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="isGlobal" className="text-xs font-semibold text-indigo-950 cursor-pointer select-none flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  GLOBAL BROADCAST (Include Mirror Bots)
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message (Markdown Supported)</label>
            <textarea 
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              placeholder="Type your broadcast message here...\n*Bold text*, _Italic_, [Link](https://google.com)"
            />
          </div>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <label className="font-medium text-gray-950 text-sm flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={buttonEnabled} 
                  onChange={(e) => setButtonEnabled(e.target.checked)}
                  className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                Include Inline Buttons Keyword Option
              </label>
            </div>

            {buttonEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Button Text</label>
                  <input 
                    type="text" 
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="e.g. Click Here"
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Button Style</label>
                  <select 
                    value={buttonStyle}
                    onChange={(e) => setButtonStyle(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="primary">Primary (Default)</option>
                    <option value="success">Success (Green)</option>
                    <option value="danger">Danger (Red)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Action Type</label>
                  <select 
                    value={buttonAction}
                    onChange={(e) => setButtonAction(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="url">URL Link</option>
                    <option value="callback_data">Bot Command (Callback)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Action Value</label>
                  <input 
                    type="text" 
                    value={buttonValue}
                    onChange={(e) => setButtonValue(e.target.value)}
                    placeholder={buttonAction === 'url' ? 'https://...' : 'command_name'}
                    className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className={`p-4 rounded-md flex items-start gap-3 ${result.success ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
               {result.success ? <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
               <div>
                 {result.success 
                   ? (result.ongoing 
                       ? "Broadcast launched successfully! Track its real-time updates in the Ongoing Broadcast Box above." 
                       : "Broadcast complete!") 
                   : `Failure error: ${result.error}`}
               </div>
            </div>
          )}

          <button 
            onClick={handleBroadcast}
            disabled={loading || !message.trim()}
            className="flex items-center bg-indigo-600 text-white px-6 py-2.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition font-medium text-sm cursor-pointer"
          >
            {loading ? 'Processing...' : <><Send className="w-4 h-4 mr-2" /> Send Broadcast</>}
          </button>
        </div>
      </div>

      {/* 3. History section */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center gap-2 border-b pb-4">
          <Layers className="w-5 h-5 text-indigo-600" />
          Past Broadcast History
        </h3>

        {completedBroadcasts.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400 border border-gray-100">
            No broadcast history found.
          </div>
        ) : (
          <div className="space-y-6">
            {completedBroadcasts.map((item) => {
              const dateStr = new Date(item.createdAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const durationSec = (item.timeTakenMs / 1000).toFixed(2);

              return (
                <div key={item._id} className="bg-white border border-gray-100 rounded-xl p-6 shadow-xs hover:shadow-sm transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full capitalize select-none">
                        {item.target === 'all' ? 'All' : item.target === 'users' ? 'Users' : item.target === 'groups' ? 'Groups' : item.target}
                      </span>
                      {item.isGlobal && (
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 rounded">
                          🌐 Global
                        </span>
                      )}
                      <span className="text-xs text-gray-400 font-medium">{dateStr}</span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono font-medium bg-gray-50 px-2.5 py-1 rounded">
                      ⏱️ Duration: <span className="font-bold text-gray-800">{durationSec}s</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-1 select-none">Message</p>
                    <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg p-3 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto border border-gray-100">
                      {item.message}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50/50 p-3 rounded-lg border border-dashed border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">👤 Private Users Target Stats</p>
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-gray-400 font-sans uppercase">Total</p>
                          <p className="text-xs font-bold text-gray-700">{item.totalUsers || 0}</p>
                        </div>
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-green-500 font-sans uppercase">Success</p>
                          <p className="text-xs font-bold text-green-600">{item.successUsers || 0}</p>
                        </div>
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-red-500 font-sans uppercase">Failed</p>
                          <p className="text-xs font-bold text-red-600">{item.failedUsers || 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50/50 p-3 rounded-lg border border-dashed border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">👥 Group Target Stats</p>
                      <div className="grid grid-cols-3 gap-2 text-center font-mono">
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-gray-400 font-sans uppercase">Total</p>
                          <p className="text-xs font-bold text-gray-700">{item.totalGroups || 0}</p>
                        </div>
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-green-500 font-sans uppercase">Success</p>
                          <p className="text-xs font-bold text-green-600">{item.successGroups || 0}</p>
                        </div>
                        <div className="bg-white p-1 rounded border border-gray-200/60">
                          <p className="text-[9px] text-red-500 font-sans uppercase">Failed</p>
                          <p className="text-xs font-bold text-red-600">{item.failedGroups || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
