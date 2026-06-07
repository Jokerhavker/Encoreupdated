import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Info, CheckCircle2, XCircle, Tag, Trash2 } from 'lucide-react';

export function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTxn, setSelectedTxn] = useState<any>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/transactions');
      setTransactions(res.data);
    } catch (e) {
      console.error("Failed to load transactions", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = async (id: string, utrStr?: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete this transaction record from the master logs? This will also remove any double-spent keys and cannot be undone.`)) {
      return;
    }
    try {
      setLoading(true);
      const res = await axios.delete(`/api/transactions/${id}`);
      if (res.data?.success) {
        alert(res.data.message || 'Transaction deleted successfully.');
        fetchTransactions();
      }
    } catch (e: any) {
      console.error("Failed to delete transaction", e);
      alert(e.response?.data?.error || 'Failed to delete transaction.');
      setLoading(false);
    }
  };

  // Metrics
  const successTxns = transactions.filter(t => t.status?.toLowerCase() === 'success');
  const failedTxns = transactions.filter(t => t.status?.toLowerCase() === 'failed');
  const totalRevenue = successTxns.reduce((sum, t) => sum + (Number(t.price) || 0), 0);

  // Filter Transactions
  const filtered = transactions.filter(t => {
    const query = searchQuery.toLowerCase();
    const matchSearch = 
      String(t.telegramId || '').toLowerCase().includes(query) ||
      String(t.username || '').toLowerCase().includes(query) ||
      String(t.firstName || '').toLowerCase().includes(query) ||
      String(t.transactionId || '').toLowerCase().includes(query) ||
      String(t.utr || '').toLowerCase().includes(query) ||
      String(t.productName || '').toLowerCase().includes(query);

    const matchStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'success' && t.status?.toLowerCase() === 'success') ||
      (statusFilter === 'failed' && t.status?.toLowerCase() === 'failed');

    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Total Revenues</h3>
            <p className="text-3xl font-bold text-emerald-600 mt-1">₹{totalRevenue.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600 font-bold text-xl w-10 h-10 flex items-center justify-center">₹</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Success Purchases</h3>
            <p className="text-3xl font-bold text-green-600 mt-1">{successTxns.length}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">Failed Attempts</h3>
            <p className="text-3xl font-bold text-red-600 mt-1">{failedTxns.length}</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 font-sans">User Audit Transactions</h2>
            <p className="text-xs text-gray-500 mt-0.5">Auditing comprehensive payment checkout records and verify logs.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Status Select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search txn, UTR, user..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-indigo-500 w-64" 
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 animate-pulse">
            Loading master transactions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No transaction records match current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs border-b">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Product Information</th>
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Transaction ID / UTR</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center">Date</th>
                  <th className="px-6 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((txn, index) => {
                  const isSuccess = txn.status?.toLowerCase() === 'success';
                  const dateStr = new Date(txn.date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr key={index} className="hover:bg-gray-50/40">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          {txn.firstName || 'Unknown'} {txn.username ? `(@${txn.username})` : ''}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">ID: {txn.telegramId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-indigo-700">{txn.productName}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold font-mono mt-0.5">Item: {txn.productId}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-800">
                        ₹{txn.price}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-mono font-medium text-gray-700 select-all truncate max-w-[180px]">
                          Txn: {txn.transactionId || 'N/A'}
                        </div>
                        {txn.utr && txn.utr !== txn.transactionId && (
                          <div className="text-[10px] font-mono text-gray-400 select-all truncate max-w-[180px] mt-0.5">
                            UTR: {txn.utr}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center mr-0">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 select-none ${
                          isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {txn.status || 'Success'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs text-gray-500 whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="p-1.5 bg-gray-50 text-indigo-600 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-md cursor-pointer transition mr-0.5"
                          title="View Details"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(txn.purchaseHistoryId || txn.transactionId || txn.utr)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 hover:border-red-200 rounded-md cursor-pointer transition"
                          title="Delete Transaction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Dialog */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Tag className="w-5 h-5 text-indigo-500" />
                Audit Transaction Details
              </h3>
              <button onClick={() => setSelectedTxn(null)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">User</p>
                  <p className="font-medium text-gray-900 text-sm">{selectedTxn.firstName || 'Unknown User'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Telegram ID</p>
                  <p className="font-mono text-indigo-600 text-xs font-semibold">{selectedTxn.telegramId}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Product Description</p>
                <p className="text-sm font-semibold text-indigo-700 bg-indigo-50/80 px-3 py-2 rounded-lg">{selectedTxn.productName}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Price</p>
                  <p className="text-lg font-bold text-gray-800">₹{selectedTxn.price ? selectedTxn.price.toFixed(2) : '0.00'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Checkout Status</p>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedTxn.status?.toLowerCase() === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedTxn.status || 'Success'}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Transaction ID</p>
                  <input
                    type="text"
                    readOnly
                    value={selectedTxn.transactionId || 'None'}
                    className="w-full bg-gray-50 border border-gray-250 font-mono text-xs rounded p-2 text-gray-700 select-all focus:outline-none"
                  />
                </div>
                {selectedTxn.utr && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">UTR / Union Transaction Reference</p>
                    <input
                      type="text"
                      readOnly
                      value={selectedTxn.utr}
                      className="w-full bg-gray-50 border border-gray-250 font-mono text-xs rounded p-2 text-gray-700 select-all focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Logged Timestamp</p>
                  <p className="text-xs text-gray-600 font-mono">{new Date(selectedTxn.date).toString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
