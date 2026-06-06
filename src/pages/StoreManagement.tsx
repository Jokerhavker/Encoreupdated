import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Store, 
  Sparkles, 
  Check, 
  AlertCircle, 
  Ticket, 
  Trash2, 
  Plus, 
  Info, 
  Percent, 
  Layers,
  Pencil
} from 'lucide-react';

export function StoreManagement() {
  const [commands, setCommands] = useState<any[]>([]);
  const [shopSettings, setShopSettings] = useState<any>({ 
    premiumMonthlyPrice: 80, 
    premiumDailyBonus: 15,
    premiumDiscountPercent: 10,
    premiumCommandBonuses: []
  });
  
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // State for adding new premium command daily bonus rule
  const [newBonusCommand, setNewBonusCommand] = useState('');
  const [newBonusCredits, setNewBonusCredits] = useState('15');

  // Subscription Tiers states
  const [subscriptionTiers, setSubscriptionTiers] = useState<any[]>([]);
  const [newTierName, setNewTierName] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('100');
  const [newTierDiscount, setNewTierDiscount] = useState('15');
  const [newTierCommands, setNewTierCommands] = useState<any[]>([]);
  const [selectedTierCmd, setSelectedTierCmd] = useState('');
  const [selectedTierCmdBonus, setSelectedTierCmdBonus] = useState('50');
  const [editingTierId, setEditingTierId] = useState<string | null>(null);

  // Coupons states
  const [coupons, setCoupons] = useState<any[]>([]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState('20');
  const [newCouponTierId, setNewCouponTierId] = useState('all');
  const [newCouponMaxUses, setNewCouponMaxUses] = useState('5');

  // Local editing states for command store configurations
  const [editingPricePerCredit, setEditingPricePerCredit] = useState<{ [key: string]: string }>({});
  const [editingMinPurchase, setEditingMinPurchase] = useState<{ [key: string]: string }>({});
  const [editingIsForSale, setEditingIsForSale] = useState<{ [key: string]: boolean }>({});

  const fetchSubscriptionTiers = async () => {
    try {
      const res = await axios.get('/api/subscription-tiers');
      if (Array.isArray(res.data)) {
        setSubscriptionTiers(res.data);
      }
    } catch (e) {
      console.error("Error loading subscription tiers:", e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch shop global settings
      const settingsRes = await axios.get('/api/shop/settings');
      if (settingsRes.data) {
        setShopSettings({
          premiumMonthlyPrice: settingsRes.data.premiumMonthlyPrice || 80,
          premiumDailyBonus: settingsRes.data.premiumDailyBonus || 15,
          premiumDiscountPercent: settingsRes.data.premiumDiscountPercent ?? 10,
          premiumCommandBonuses: settingsRes.data.premiumCommandBonuses || []
        });
      }

      // Fetch commands list
      const commandsRes = await axios.get('/api/commands');
      setCommands(commandsRes.data);

      // Initialize editing fields
      const editsPricePer: { [key: string]: string } = {};
      const editsMinPur: { [key: string]: string } = {};
      const editsSale: { [key: string]: boolean } = {};

      commandsRes.data.forEach((c: any) => {
        editsPricePer[c._id] = String(c.pricePerCredit ?? 0.5);
        editsMinPur[c._id] = String(c.minPurchaseCredits ?? 20);
        editsSale[c._id] = !!c.isForSale;
      });

      setEditingPricePerCredit(editsPricePer);
      setEditingMinPurchase(editsMinPur);
      setEditingIsForSale(editsSale);

      // Set default selected command for dropdown if available
      if (commandsRes.data.length > 0) {
        setNewBonusCommand(commandsRes.data[0].command);
        setSelectedTierCmd(commandsRes.data[0].command);
      }
      
      // Load subscription tiers as well
      await fetchSubscriptionTiers();

      // Load coupons as well
      try {
        const couponsRes = await axios.get('/api/coupons');
        if (Array.isArray(couponsRes.data)) {
          setCoupons(couponsRes.data);
        }
      } catch (couponErr) {
        console.error("Error loading coupons:", couponErr);
      }
    } catch (err) {
      console.error("Error loading data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Coupon management action handlers
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) {
      alert("Please enter a valid coupon code.");
      return;
    }
    const discount = Number(newCouponDiscount);
    const maxUses = Number(newCouponMaxUses);

    if (isNaN(discount) || discount < 0 || discount > 100) {
      alert("Discount must be a number between 0 and 100.");
      return;
    }
    if (isNaN(maxUses) || maxUses <= 0) {
      alert("Max uses must be a positive integer.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post('/api/coupons', {
        code: newCouponCode.trim().toUpperCase(),
        discountPercent: discount,
        tierId: newCouponTierId,
        maxUses: maxUses,
        isActive: true
      });
      if (res.data.success) {
        setNewCouponCode('');
        // reload coupons
        const couponsRes = await axios.get('/api/coupons');
        if (Array.isArray(couponsRes.data)) {
          setCoupons(couponsRes.data);
        }
        alert("Coupon successfully generated/modified!");
      }
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to create coupon.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!window.confirm("Are you sure you want to delete this coupon code?")) {
      return;
    }
    try {
      setLoading(true);
      const res = await axios.post('/api/coupons/delete', { id: couponId });
      if (res.data.success) {
        setCoupons(prev => prev.filter(c => c._id !== couponId));
      }
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete coupon.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCouponActive = async (coupon: any) => {
    try {
      setLoading(true);
      const res = await axios.post('/api/coupons', {
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        tierId: coupon.tierId,
        maxUses: coupon.maxUses,
        isActive: !coupon.isActive
      });
      if (res.data.success) {
        setCoupons(prev => prev.map(c => c._id === coupon._id ? res.data.coupon : c));
      }
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to toggle coupon state.");
    } finally {
      setLoading(false);
    }
  };

  // Save Shop Global Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus(null);
    try {
      const res = await axios.post('/api/shop/settings', {
        premiumMonthlyPrice: Number(shopSettings.premiumMonthlyPrice),
        premiumDailyBonus: Number(shopSettings.premiumDailyBonus),
        premiumDiscountPercent: Number(shopSettings.premiumDiscountPercent),
        premiumCommandBonuses: shopSettings.premiumCommandBonuses
      });
      if (res.data.success) {
        setSaveStatus({ type: 'success', text: 'Shop configurations successfully synchronized!' });
        setTimeout(() => setSaveStatus(null), 3500);
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', text: err.response?.data?.error || 'Failed saving shop configurations' });
    }
  };

  // Subscription Tiers crud functions
  const handleAddCommandToNewTier = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTierCmd) return;
    const bCredits = Number(selectedTierCmdBonus);
    if (isNaN(bCredits) || bCredits < 0) {
      alert("Please enter a valid positive credit bonus.");
      return;
    }

    const currentList = [...newTierCommands];
    const existsIdx = currentList.findIndex(tc => tc.command === selectedTierCmd);
    if (existsIdx > -1) {
      currentList[existsIdx].bonusCommonCredits = bCredits;
    } else {
      currentList.push({ command: selectedTierCmd, bonusCommonCredits: bCredits });
    }
    setNewTierCommands(currentList);
  };

  const handleRemoveCommandFromNewTier = (cmdName: string) => {
    setNewTierCommands(prev => prev.filter(tc => tc.command !== cmdName));
  };

  const autoSaveTiers = async (tiersList: any[]) => {
    setSaveStatus(null);
    setLoading(true);
    try {
      const res = await axios.post('/api/subscription-tiers', tiersList);
      if (res.data.success) {
        setSaveStatus({ type: 'success', text: 'Subscription tiers successfully saved and synchronized in real-time!' });
        setTimeout(() => setSaveStatus(null), 4000);
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', text: err.response?.data?.error || 'Failed to save subscription tiers.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTier = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTierName.trim()) {
      alert("Please enter a valid tier name (e.g. Platinum).");
      return;
    }
    const price = Number(newTierPrice);
    const discount = Number(newTierDiscount);
    if (isNaN(price) || price < 0) {
      alert("Please enter a valid subscription price.");
      return;
    }
    if (isNaN(discount) || discount < 0 || discount > 100) {
      alert("Discount must be a number between 0% and 100%.");
      return;
    }

    const slug = `tier_${newTierName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const exists = subscriptionTiers.some(t => t.id === slug);
    if (exists) {
      alert(`A subscription tier with ID '${slug}' already exists. Please choose a different name.`);
      return;
    }

    const tierObj = {
      id: slug,
      name: newTierName.trim(),
      price,
      discountPercent: discount,
      commands: newTierCommands
    };

    const updatedTiers = [...subscriptionTiers, tierObj];
    setSubscriptionTiers(updatedTiers);

    // Reset creator fields
    setNewTierName('');
    setNewTierPrice('100');
    setNewTierDiscount('15');
    setNewTierCommands([]);

    // Auto-save immediately to database
    await autoSaveTiers(updatedTiers);
  };

  const handleDeleteTier = async (tierId: string) => {
    const updatedTiers = subscriptionTiers.filter(t => t.id !== tierId);
    setSubscriptionTiers(updatedTiers);
    if (editingTierId === tierId) {
      handleCancelEditTier();
    }
    // Auto-save immediately to database
    await autoSaveTiers(updatedTiers);
  };

  const handleStartEditTier = (tier: any) => {
    setEditingTierId(tier.id);
    setNewTierName(tier.name);
    setNewTierPrice(String(tier.price));
    setNewTierDiscount(String(tier.discountPercent));
    setNewTierCommands(tier.commands || []);
  };

  const handleCancelEditTier = () => {
    setEditingTierId(null);
    setNewTierName('');
    setNewTierPrice('100');
    setNewTierDiscount('15');
    setNewTierCommands([]);
  };

  const handleUpdateTier = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingTierId) return;
    if (!newTierName.trim()) {
      alert("Please enter a valid tier name.");
      return;
    }
    const price = Number(newTierPrice);
    const discount = Number(newTierDiscount);
    if (isNaN(price) || price < 0) {
      alert("Please enter a valid subscription price.");
      return;
    }
    if (isNaN(discount) || discount < 0 || discount > 100) {
      alert("Discount must be a number between 0% and 100%.");
      return;
    }

    const updatedTiers = subscriptionTiers.map(t => {
      if (t.id === editingTierId) {
        return {
          ...t,
          name: newTierName.trim(),
          price,
          discountPercent: discount,
          commands: newTierCommands
        };
      }
      return t;
    });

    setSubscriptionTiers(updatedTiers);
    handleCancelEditTier();

    // Auto-save immediately to database
    await autoSaveTiers(updatedTiers);
  };

  const handleSaveSubscriptionTiers = async () => {
    await autoSaveTiers(subscriptionTiers);
  };

  // Add a specific command bonus rule local collection
  const handleAddBonusRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBonusCommand) return;
    
    const credits = Number(newBonusCredits);
    if (isNaN(credits) || credits < 0) {
      alert("Please enter a valid positive number for bonus credits.");
      return;
    }

    const currentList = [...(shopSettings.premiumCommandBonuses || [])];
    const existsIdx = currentList.findIndex(b => b.command === newBonusCommand);
    
    if (existsIdx > -1) {
      currentList[existsIdx].extraCredits = credits;
    } else {
      currentList.push({ command: newBonusCommand, extraCredits: credits });
    }

    setShopSettings((prev: any) => ({
      ...prev,
      premiumCommandBonuses: currentList
    }));
  };

  // Remove command bonus rule locally
  const handleRemoveBonusRule = (cmdName: string) => {
    const filtered = (shopSettings.premiumCommandBonuses || []).filter((b: any) => b.command !== cmdName);
    setShopSettings((prev: any) => ({
      ...prev,
      premiumCommandBonuses: filtered
    }));
  };

  // Save specific command marketplace settings
  const handleSaveCommandSaleSettings = async (cmdId: string) => {
    setSaveStatus(null);
    const forSale = !!editingIsForSale[cmdId];
    const pricePer = Number(editingPricePerCredit[cmdId]);
    const minPur = Number(editingMinPurchase[cmdId]);

    if (isNaN(pricePer) || pricePer < 0) {
      setSaveStatus({ type: 'error', text: 'Please enter a valid price per 1 credit.' });
      return;
    }
    if (isNaN(minPur) || minPur < 1) {
      setSaveStatus({ type: 'error', text: 'Please choose a minimum purchase limit of 1 or more.' });
      return;
    }

    const targetCmd = commands.find(c => c._id === cmdId);
    if (!targetCmd) return;

    try {
      const res = await axios.post('/api/commands', {
        ...targetCmd,
        isForSale: forSale,
        pricePerCredit: pricePer,
        minPurchaseCredits: minPur
      });
      if (res.data) {
        setCommands(prev => prev.map(c => c._id === cmdId ? res.data : c));
        setSaveStatus({ type: 'success', text: `Shop settings for "${targetCmd.command}" updated to: ₹${pricePer}/credit (Min limit: ${minPur}).` });
        setTimeout(() => setSaveStatus(null), 3500);
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', text: err.response?.data?.error || 'Failed saving command shop configurations' });
    }
  };

  // Quick toggle isCreditBased
  const handleToggleCreditBased = async (cmd: any) => {
    setSaveStatus(null);
    try {
      const res = await axios.post('/api/commands', {
        ...cmd,
        isCreditBased: !cmd.isCreditBased
      });
      if (res.data) {
        setCommands(prev => prev.map(c => c._id === cmd._id ? res.data : c));
        setSaveStatus({ type: 'success', text: `Updated ${cmd.command} credit-based toggle.` });
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', text: err.response?.data?.error || 'Toggle failed' });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Description header card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-gradient-to-tr from-indigo-500 to-violet-600 text-white rounded-lg shrink-0 shadow-md">
          <Store className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Advanced Store & Marketplace configuration</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Customize subscription perks, premium discounts, and specific credit reward metrics. 
            Configure precise individual command credit prices per active currency unit, and set dynamic minimum transaction levels.
          </p>
        </div>
      </div>

      {saveStatus && (
        <div className={`p-4 rounded-lg flex items-start gap-3 border transition-all ${saveStatus.type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-red-50 border-red-250 text-red-800'}`} id="save_status_notification">
          {saveStatus.type === 'success' ? <Check className="w-5 h-5 mt-0.5" /> : <AlertCircle className="w-5 h-5 mt-0.5" />}
          <p className="text-xs font-semibold leading-relaxed">{saveStatus.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Full-width column: individual command list with customizable credits price */}
        <div className="xl:col-span-3 border border-gray-200 bg-white p-5 rounded-lg shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-1.5">
              <Ticket className="w-4 h-4 text-slate-500" />
              <span>Configure Credits Marketplace (Custom Purchases)</span>
            </h3>
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {commands.filter(c => c.isCreditBased).length} Credit-Based Entries
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-normal">
            For each credit-based api command, configure whether it is for sale inside the consumer marketplace. 
            Define the rate unit <strong>price per 1 credit</strong>, and set the mandatory <strong>minimum purchase volume limit</strong>. 
            Users can slide or input custom credits to buy!
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-2.5">Command Info</th>
                  <th className="py-2.5">Credit-Based?</th>
                  <th className="py-2.5">Market Status</th>
                  <th className="py-2.5">Price Per 1 Credit (₹)</th>
                  <th className="py-2.5">Min Purchase credits</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {commands.map((cmd) => {
                  const forSale = !!editingIsForSale[cmd._id];
                  const pricePer = editingPricePerCredit[cmd._id] || '0.5';
                  const minPur = editingMinPurchase[cmd._id] || '20';

                  return (
                    <tr key={cmd._id} className="hover:bg-slate-50/50">
                      
                      {/* Name */}
                      <td className="py-3 pr-2 min-w-[130px]">
                        <span className="font-extrabold text-slate-800 text-sm block">
                          {cmd.command}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[160px] block mt-0.5" title={cmd.description}>
                          {cmd.description || 'No description'}
                        </span>
                      </td>

                      {/* Credit-based */}
                      <td className="py-3">
                        <button 
                          onClick={() => handleToggleCreditBased(cmd)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${cmd.isCreditBased ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}
                        >
                          {cmd.isCreditBased ? '✓ Active' : '✕ Disabled'}
                        </button>
                      </td>

                      {/* For Sale marketplace toggle */}
                      <td className="py-3">
                        <button 
                          onClick={() => {
                            if (!cmd.isCreditBased) return;
                            setEditingIsForSale(prev => ({
                              ...prev,
                              [cmd._id]: !prev[cmd._id]
                            }));
                          }}
                          disabled={!cmd.isCreditBased}
                          className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-black border transition-colors ${!cmd.isCreditBased ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : forSale ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}
                        >
                          {forSale ? '🛒 FOR SALE' : '🚫 SUSPENDED'}
                        </button>
                      </td>

                      {/* Price per credit */}
                      <td className="py-3 pr-2">
                        <div className="relative inline-block w-20">
                          <span className="absolute left-2 top-1.5 text-slate-400 font-extrabold text-[11px]">₹</span>
                          <input 
                            type="number" 
                            step="0.05"
                            value={pricePer}
                            onChange={(e) => setEditingPricePerCredit(prev => ({ ...prev, [cmd._id]: e.target.value }))}
                            className={`w-full bg-white border rounded p-1 pl-4.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${forSale && cmd.isCreditBased ? '' : 'text-slate-400 border-slate-200 bg-slate-50'}`}
                            placeholder="0.5"
                            disabled={!cmd.isCreditBased || !forSale}
                          />
                        </div>
                      </td>

                      {/* Minimum Purchase Credits */}
                      <td className="py-3">
                        <input 
                          type="number" 
                          value={minPur}
                          onChange={(e) => setEditingMinPurchase(prev => ({ ...prev, [cmd._id]: e.target.value }))}
                          className={`w-16 bg-white border rounded p-1 text-center text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${forSale && cmd.isCreditBased ? '' : 'text-slate-400 border-slate-200 bg-slate-50'}`}
                          placeholder="20"
                          disabled={!cmd.isCreditBased || !forSale}
                        />
                      </td>

                      {/* Save Action */}
                      <td className="py-3 text-right">
                        <button 
                          onClick={() => handleSaveCommandSaleSettings(cmd._id)}
                          className={`font-black text-[10px] uppercase py-1.5 px-3 rounded-md transition-colors ${cmd.isCreditBased ? 'bg-slate-900 hover:bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                          disabled={!cmd.isCreditBased}
                        >
                          Save
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SECTION: SUBSCRIPTION TIERS CONFIGURATOR */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-6" id="subscription_tiers_config_section">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-3 gap-3 sm:gap-0">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
              Subscription Tiers Configurator
            </h3>
          </div>
          <button
            onClick={handleSaveSubscriptionTiers}
            disabled={loading}
            className="w-full sm:w-auto bg-indigo-650 hover:bg-indigo-750 text-white font-extrabold text-xs py-2 px-5 rounded-md transition-colors shadow-sm tracking-wide uppercase"
          >
            {loading ? 'Saving Changes...' : 'Save All Subscription Tiers'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Creator panel */}
          <div className="lg:col-span-1 bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
              <span>{editingTierId ? `✏️ Edit Custom Tier: ${editingTierId.replace('tier_', '')}` : '➕ Add New Custom Tier'}</span>
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Tier Name</label>
                <input
                  type="text"
                  value={newTierName}
                  onChange={e => setNewTierName(e.target.value)}
                  className="w-full text-xs text-slate-800 bg-white border border-gray-200 focus:ring-1 focus:ring-indigo-500 rounded p-2.5 mt-1"
                  placeholder="e.g. Bronze, Gold, VIP Platinum"
                />
                {editingTierId && (
                  <span className="text-[9px] text-slate-400 font-medium mt-1 block leading-tight">
                    ID reference identifier is bound to <code className="font-mono bg-slate-200 border border-slate-300 text-slate-800 px-1 rounded text-[8px]">{editingTierId}</code>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Monthly Price (₹)</label>
                  <input
                    type="number"
                    value={newTierPrice}
                    onChange={e => setNewTierPrice(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-gray-200 focus:ring-1 focus:ring-indigo-500 rounded p-2.5 mt-1 font-extrabold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newTierDiscount}
                    onChange={e => setNewTierDiscount(e.target.value)}
                    className="w-full text-xs text-slate-800 bg-white border border-gray-200 focus:ring-1 focus:ring-indigo-500 rounded p-2.5 mt-1 font-extrabold"
                  />
                </div>
              </div>

              {/* Sub list: Included Commands Limits */}
              <div className="bg-white border border-gray-200 p-3.5 rounded-lg space-y-3 shadow-inner">
                <span className="block text-[10px] font-black text-slate-600 uppercase border-b border-gray-100 pb-1">
                  🎯 Included Command Perks & Credit Quotas
                </span>

                {newTierCommands.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic text-center py-2">No command perks allocated to this tier yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {newTierCommands.map((tc, idx) => (
                      <div key={idx} className="flex flex-col gap-1 text-[11px] bg-slate-50 border border-slate-200 p-2 rounded relative">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                          <span className="font-extrabold text-slate-850 font-mono">{tc.command}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCommandFromNewTier(tc.command)}
                            className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Subscription Instant Bonus: <strong className="font-black text-emerald-600">+{tc.bonusCommonCredits || 0} credits</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline adder */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">API Command</label>
                    <select
                      value={selectedTierCmd}
                      onChange={e => setSelectedTierCmd(e.target.value)}
                      className="w-full text-[10px] bg-slate-50 border border-gray-200 rounded p-1.5 font-bold text-slate-700"
                    >
                      <option value="">-- Choose command --</option>
                      {commands.map(c => (
                        <option key={c._id} value={c.command}>{c.command}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-wider mb-0.5">Instant Credits Bonus</label>
                    <input
                      type="number"
                      value={selectedTierCmdBonus}
                      onChange={e => setSelectedTierCmdBonus(e.target.value)}
                      className="w-full text-[10px] border border-gray-200 rounded p-1.5 text-center font-extrabold text-slate-800"
                      placeholder="Credits"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCommandToNewTier}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded font-bold text-[10px] py-2 flex items-center justify-center gap-1 transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add {selectedTierCmd ? `Bonus Credits for ${selectedTierCmd}` : 'Bonus Credits perk'}</span>
                  </button>
                </div>
              </div>

              {editingTierId ? (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleUpdateTier}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black tracking-wider py-2.5 uppercase rounded-lg shadow-sm transition-colors cursor-pointer text-center"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditTier}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black tracking-wider py-2.5 px-3 uppercase rounded-lg shadow-sm transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateTier}
                  className="w-full bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-black tracking-wider py-2.5 uppercase rounded-lg shadow-sm transition-colors mt-2 cursor-pointer"
                >
                  Assemble & Add Tier
                </button>
              )}
            </div>
          </div>

          {/* Active Tiers List */}
          <div className="lg:col-span-2 space-y-3 bg-slate-50/20 border border-slate-100 p-5 rounded-xl">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest px-0.5 flex items-center gap-1.5 border-b border-gray-100 pb-2">
              📋 Configured Subscription Tiers ({subscriptionTiers.length})
            </h4>

            {subscriptionTiers.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 text-center rounded-lg text-slate-400 text-xs">
                No custom subscription tiers defined. Dynamic limits will fall back to general defaults.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subscriptionTiers.map((tier) => (
                  <div key={tier.id} className="border border-slate-200 bg-white hover:bg-slate-50 leading-relaxed rounded-xl p-4.5 flex flex-col justify-between hover:shadow shadow-sm transition-all">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-extrabold text-slate-800 text-sm leading-tight">{tier.name}</h5>
                          <code className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-black font-mono uppercase tracking-wider inline-block mt-1">{tier.id}</code>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStartEditTier(tier)}
                            className={`p-1.5 rounded transition-colors shadow-sm cursor-pointer border ${
                              editingTierId === tier.id
                                ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-800'
                            }`}
                            title="Edit tier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTier(tier.id)}
                            className="bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors shadow-sm cursor-pointer animate-none"
                            title="Delete tier"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-105">
                          <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Price</span>
                          <span className="font-black text-slate-800 text-base">₹{tier.price} <span className="font-normal text-[10px] text-slate-400">/ mo</span></span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-105">
                          <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider flex items-center gap-0.5"><Percent className="w-2.5 h-2.5 text-indigo-500" /> Discount</span>
                          <span className="font-black text-slate-800 text-base">{tier.discountPercent}% OFF</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-slate-100">
                        <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-0.5">Subscription Credit Perks:</span>
                        {(!tier.commands || tier.commands.length === 0) ? (
                          <span className="text-[10px] text-slate-400 italic px-0.5">No subscription credit bonuses defined.</span>
                        ) : (
                          <div className="grid grid-cols-1 gap-1.5">
                            {tier.commands.map((tc: any, index: number) => (
                              <div key={index} className="bg-slate-50 text-slate-700 text-[10px] border border-slate-200 rounded p-2.5 flex justify-between items-center">
                                <span className="font-extrabold text-slate-900 font-mono">{tc.command}</span>
                                {tc.bonusCommonCredits > 0 && (
                                  <span className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black text-[9px] px-2.5 py-0.5 rounded border border-emerald-200">
                                    +{tc.bonusCommonCredits} Credits
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION: COUPONS & DISCOUNTS CONFIGURATOR */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-6" id="coupons_config_section">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Ticket className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
            Premium Coupons & Discount Codes
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Creator panel */}
          <div className="lg:col-span-1 bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
              <span>➕ Generate Discount Code</span>
            </h4>

            <form onSubmit={handleCreateCoupon} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Coupon Code</label>
                <input 
                  type="text"
                  value={newCouponCode}
                  onChange={(e) => setNewCouponCode(e.target.value)}
                  placeholder="WELCOME50"
                  className="w-full bg-white border border-slate-200 rounded p-2 text-xs font-black placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Discount Percent (%)</label>
                <input 
                  type="number"
                  min="0"
                  max="100"
                  value={newCouponDiscount}
                  onChange={(e) => setNewCouponDiscount(e.target.value)}
                  placeholder="20"
                  className="w-full bg-white border border-slate-200 rounded p-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Applicable For</label>
                <select 
                  value={newCouponTierId}
                  onChange={(e) => setNewCouponTierId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded p-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Subscription Tiers</option>
                  <option value="premium">Bot Paid Subscription</option>
                  {subscriptionTiers.map((tier: any) => (
                    <option key={tier.id} value={tier.id}>{tier.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Users Redemptions Limit</label>
                <input 
                  type="number"
                  min="1"
                  value={newCouponMaxUses}
                  onChange={(e) => setNewCouponMaxUses(e.target.value)}
                  placeholder="5"
                  className="w-full bg-white border border-slate-200 rounded p-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs py-2.5 px-4 rounded-md transition-colors shadow-sm tracking-wide uppercase mt-2 shadow-amber-500/10 cursor-pointer"
              >
                {loading ? 'Processing...' : '⚡ Generate Coupon'}
              </button>
            </form>
          </div>

          {/* List panel */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest pb-1.5 border-b border-slate-100 flex items-center justify-between">
              <span>🎟️ Active Coupons ({coupons.length})</span>
            </h4>

            {coupons.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs italic">
                No discount coupons have been generated yet. Use the left panel to create your first coupon code!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coupons.map((coupon: any) => {
                  const appliedToText = coupon.tierId === 'all' 
                    ? 'All Tiers' 
                    : coupon.tierId === 'premium' 
                      ? 'Bot Paid Sub' 
                      : subscriptionTiers.find((t: any) => t.id === coupon.tierId)?.name || coupon.tierId;

                  const isExhausted = coupon.usedCount >= coupon.maxUses;

                  return (
                    <div 
                      key={coupon._id}
                      className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${coupon.isActive ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50/70 border-slate-100 opacity-65'}`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-mono font-black text-sm bg-slate-100 text-slate-800 px-2.5 py-1 rounded border border-slate-200 tracking-wider">
                            {coupon.code}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleCouponActive(coupon)}
                              className={`text-[9px] font-black px-2 py-0.5 rounded transition-all border cursor-pointer ${coupon.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'}`}
                            >
                              {coupon.isActive ? '● ACTIVE' : '○ DISABLED'}
                            </button>
                            <button
                              onClick={() => handleDeleteCoupon(coupon._id)}
                              className="text-slate-400 hover:text-red-650 p-1 rounded transition-colors cursor-pointer"
                              title="Delete Coupon"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Discount</span>
                            <span className="font-extrabold text-amber-600">{coupon.discountPercent}% OFF</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Applicable For</span>
                            <span className="font-extrabold text-slate-700 truncate block max-w-[120px]">{appliedToText}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-50">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-slate-400">REDEMPTIONS LIMIT:</span>
                            <span className={`font-mono font-black ${isExhausted ? 'text-rose-600' : 'text-slate-700'}`}>
                              {coupon.usedCount} / {coupon.maxUses} used
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1 shadow-inner border border-slate-200/40">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${isExhausted ? 'bg-rose-500' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.min(100, (coupon.usedCount / coupon.maxUses) * 100)}%` }}
                            ></div>
                          </div>
                          {isExhausted && (
                            <span className="text-[9px] font-black text-rose-500 block text-right mt-1.5 uppercase tracking-widest">
                              ⚠️ Limit Reached! (Fully Used)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
