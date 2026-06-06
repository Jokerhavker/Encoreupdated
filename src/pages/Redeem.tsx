import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Gift, Coins, AlertTriangle, ShieldCheck } from 'lucide-react';

export function Redeem() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [playerId, setPlayerId] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [selectedCommand, setSelectedCommand] = useState('');
    const [amount, setAmount] = useState(0);
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        // 1. Try URL parameter
        let pId = searchParams.get('userid');
        
        // 2. Fallback to Telegram WebApp context
        if (!pId) {
            const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
            if (tgUser?.id) {
                pId = String(tgUser.id);
            }
        }

        if (pId) {
            setPlayerId(pId);
        } else {
            // For testing/mocking in browser previews if nothing else is present
            setPlayerId('714902844');
        }
        
        axios.get('/api/redeem-store').then(res => setItems(res.data)).catch(err => console.error(err));
    }, [searchParams]);

    useEffect(() => {
        if (playerId) {
            axios.get(`/api/users/telegram/${playerId}`)
                .then(res => setUser(res.data))
                .catch(err => console.error("Error fetching user data:", err));
        }
    }, [playerId]);

    const activeItem = items.find(i => i.command === selectedCommand);
    const totalCost = activeItem ? amount * activeItem.pricePerCredit : 0;
    const canRedeem = activeItem && amount >= activeItem.minRedeemAmount && (user?.encCoins || 0) >= totalCost;

    const handleRedeem = async () => {
        if (!selectedCommand || amount <= 0) return;
        if (!activeItem) return;
        
        if (amount < activeItem.minRedeemAmount) {
            setStatusMessage({ type: 'error', text: `Minimum redeem amount for ${selectedCommand} is ${activeItem.minRedeemAmount} credits.` });
            return;
        }

        if ((user?.encCoins || 0) < totalCost) {
            setStatusMessage({ type: 'error', text: `Insufficient coins. You need ${totalCost} coins but you only have ${user?.encCoins || 0}.` });
            return;
        }

        setLoading(true);
        setStatusMessage(null);
        try {
            const res = await axios.post(`/api/users/telegram/${playerId}/redeem`, { 
                command: selectedCommand, 
                credits: amount 
            });
            if (res.data.success) {
                setStatusMessage({ 
                    type: 'success', 
                    text: `Successfully redeemed ${amount} credits for ${selectedCommand}! ${totalCost} coins deducted.` 
                });
                setUser((prev: any) => ({ ...prev, encCoins: res.data.newBalance }));
                setAmount(0);
            }
        } catch (e: any) {
            setStatusMessage({ 
                type: 'error', 
                text: e.response?.data?.error || 'Redeem failed. Please try again.' 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-gray-950 dark:to-gray-905 p-4 sm:p-6 flex flex-col items-center">
            <div className="w-full max-w-md">
                <button 
                    onClick={() => navigate(-1)} 
                    className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Go Back
                </button>

                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-indigo-100/50 dark:border-gray-800 p-6 space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 dark:border-gray-800 pb-4">
                        <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            <Gift className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Redeem Command Credits</h1>
                            <p className="text-xs text-slate-400 dark:text-slate-500">Convert your ENC coins into lifetime credits</p>
                        </div>
                    </div>

                    {user && (
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-yellow-950/20 dark:to-amber-950/20 p-4 rounded-xl border border-amber-100 dark:border-yellow-900/30 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Coins className="w-5 h-5 text-amber-500" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Your Coin Balance</span>
                            </div>
                            <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{user.encCoins || 0} ENC</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                                Select Command
                            </label>
                            <select 
                                value={selectedCommand}
                                onChange={e => {
                                    setSelectedCommand(e.target.value);
                                    setStatusMessage(null);
                                }}
                                className="w-full p-3 rounded-xl border border-slate-200 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 text-slate-800 dark:text-slate-100 text-sm"
                            >
                                <option value="">-- Choose Command --</option>
                                {items.map(i => (
                                    <option key={i.command} value={i.command}>
                                        {i.command} ({i.pricePerCredit} coins/credit, min {i.minRedeemAmount})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {activeItem && (
                            <div className="bg-slate-50 dark:bg-gray-950 p-4 rounded-xl space-y-2 text-xs text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-gray-800">
                                <div className="flex justify-between">
                                    <span>Rate per credit:</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{activeItem.pricePerCredit} coins</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Minimum redeem requirement:</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{activeItem.minRedeemAmount} credits</span>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                                Credits to Redeem
                            </label>
                            <input 
                                type="number" 
                                placeholder={activeItem ? `Min ${activeItem.minRedeemAmount}` : "Enter amount"} 
                                value={amount || ''}
                                onChange={e => {
                                    setAmount(Math.max(0, Number(e.target.value)));
                                    setStatusMessage(null);
                                }}
                                className="w-full p-3 rounded-xl border border-slate-200 dark:border-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 text-slate-800 dark:text-slate-100 text-sm"
                            />
                        </div>

                        {activeItem && amount > 0 && (
                            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100/30 dark:border-indigo-900/10 space-y-2 text-sm">
                                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                    <span>Total Amount:</span>
                                    <span className="font-bold">{amount} Additional Common Credits</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                    <span>Total Cost:</span>
                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{totalCost} ENC Coins</span>
                                </div>
                                {amount < activeItem.minRedeemAmount && (
                                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        Below minimum requirement of {activeItem.minRedeemAmount} credits.
                                    </p>
                                )}
                                {user && user.encCoins < totalCost && (
                                    <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        Not enough coins. Need {totalCost - user.encCoins} more!
                                    </p>
                                )}
                            </div>
                        )}

                        {statusMessage && (
                            <div className={`p-4 rounded-xl text-xs border flex items-start gap-2 ${
                                statusMessage.type === 'success' 
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250 text-emerald-800 dark:text-emerald-300' 
                                    : 'bg-red-50 dark:bg-red-955/20 border-red-200 text-red-800 dark:text-red-300'
                            }`}>
                                {statusMessage.type === 'success' ? (
                                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
                                )}
                                <span>{statusMessage.text}</span>
                            </div>
                        )}

                        <button 
                            onClick={handleRedeem} 
                            disabled={loading || !canRedeem || amount <= 0}
                            className={`w-full p-4 rounded-xl font-bold shadow-lg transition-all text-sm flex justify-center items-center gap-2 ${
                                canRedeem && amount > 0 && !loading
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 active:scale-95'
                                : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                            }`}
                        >
                            {loading ? 'Processing...' : 'Confirm Redemption'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
