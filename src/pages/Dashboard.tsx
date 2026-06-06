import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { Users, Code, Activity, Layers, ActivitySquare, Eye, X } from 'lucide-react';

export function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    axios.get('/api/stats/dashboard').then(res => setStats(res.data)).catch(console.error);
  }, []);

  if (!stats) return <div className="text-gray-500 animate-pulse">Loading dashboard statistics...</div>;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
  };

  const groupDisplay = stats.totalGroups + (stats.totalGroupMembers ? ` (${formatNumber(stats.totalGroupMembers)})` : ' (0)');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={stats.totalUsers} icon={<Users className="w-8 h-8 text-blue-500" />} />
        <StatCard title="Total Groups" value={groupDisplay} icon={<Layers className="w-8 h-8 text-purple-500" />} />
        <StatCard title="Total Commands" value={stats.totalCommands} icon={<Code className="w-8 h-8 text-emerald-500" />} />
        <StatCard title="Total Invocations" value={stats.totalCalls} icon={<Activity className="w-8 h-8 text-orange-500" />} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center bg-gray-50/50">
          <ActivitySquare className="w-5 h-5 text-gray-500 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Recent Command usages</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {stats.recentCommands && stats.recentCommands.length === 0 && (
             <div className="p-6 text-center text-gray-500">No recent activity detected.</div>
          )}
          {stats.recentCommands?.map((log: any, idx: number) => (
            <div key={idx} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between text-sm hover:bg-gray-50 transition-colors gap-4 sm:gap-0">
              <div>
                <span className="font-semibold text-indigo-600 font-mono tracking-tight">{log.commandName}</span> 
                <span className="text-gray-500 mx-2">invoked by</span>
                <span className="text-gray-800 font-medium">ID: {log.telegramId}</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-gray-400 capitalize bg-gray-100 px-3 py-1 rounded-full text-xs shrink-0 inline-flex">
                  {log.isGroup ? 'Group' : 'Private'}
                </div>
                <button 
                  onClick={() => setSelectedLog(log)}
                  className="inline-flex items-center px-3 py-1 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-full text-xs font-medium cursor-pointer transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="font-medium text-gray-900 flex items-center">
                <ActivitySquare className="w-4 h-4 mr-2 text-indigo-500" />
                Execution Details
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">Command</p>
                  <p className="font-mono text-sm font-medium text-indigo-600 bg-indigo-50 inline-block px-2 py-0.5 rounded">{selectedLog.commandName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">Invoked By ID</p>
                  <p className="font-mono text-sm text-gray-800">{selectedLog.telegramId}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">Parameter Value</p>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap">
                  {selectedLog.paramValue || <span className="text-gray-400 italic">No parameter provided</span>}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">API Response</p>
                <div className="bg-gray-900 border border-gray-800 rounded-md p-3 text-sm font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap max-h-64 shadow-inner">
                  {selectedLog.apiResponse || <span className="text-gray-500 italic">No response captured or not an API command</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
      <div>
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">{icon}</div>
    </div>
  );
}
