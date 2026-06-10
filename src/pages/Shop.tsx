import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
  ArrowLeft, 
  Sparkles, 
  Ticket, 
  AlertCircle, 
  CheckCircle2, 
  History, 
  RotateCw, 
  Lock, 
  ShieldCheck, 
  Smartphone,
  Percent,
  Coins
} from 'lucide-react';

export function Shop() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState<any>(null);
  const [commands, setCommands] = useState<any[]>([]);
  const [shopSettings, setShopSettings] = useState<any>({ premiumMonthlyPrice: 80, premiumDailyBonus: 15, premiumDiscountPercent: 10 });
  const [subscriptionTiers, setSubscriptionTiers] = useState<any[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [activeTab, setActiveTab] = useState<'buy' | 'history'>('buy');
  
  // Custom purchase state for command marketplace
  const [selectedQuantities, setSelectedQuantities] = useState<{ [key: string]: number }>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Checkout flow state
  const [checkoutItem, setCheckoutItem] = useState<{ 
    id: string; 
    name: string; 
    price: number; 
    creditsCount?: number; 
    originalPrice?: number;
    discount?: number;
  } | null>(null);
  
  const [paymentId, setPaymentId] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  useEffect(() => {
    // 1. Resolve userid
    let uId = searchParams.get('userid');
    
    // 2. Fallback to Telegram WebApp context
    if (!uId) {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      if (tgUser?.id) {
        uId = String(tgUser.id);
      }
    }

    if (uId) {
      setUserId(uId);
    } else {
      // Browser fallback / demo
      setUserId('714902844');
    }

    // Load available credit-based commands
    axios.get('/api/commands')
      .then(res => {
        // filter commands that are credit-based AND are for sale
        const purchasable = res.data.filter((c: any) => c.isCreditBased && c.isForSale);
        setCommands(purchasable);

        // Initialize default quantities to the minimum purchase credits
        const defaultQuants: { [key: string]: number } = {};
        purchasable.forEach((c: any) => {
          defaultQuants[c.command] = c.minPurchaseCredits || 20;
        });
        setSelectedQuantities(defaultQuants);
      })
      .catch(err => console.error("Error loading commands", err));

    // Load overall shop settings (including premiumDiscountPercent)
    axios.get('/api/shop/settings')
      .then(res => {
        setShopSettings({
          premiumMonthlyPrice: res.data.premiumMonthlyPrice ?? 80,
          premiumDailyBonus: res.data.premiumDailyBonus ?? 15,
          premiumDiscountPercent: res.data.premiumDiscountPercent ?? 10,
          premiumCommandBonuses: res.data.premiumCommandBonuses || []
        });
      })
      .catch(err => console.error("Error loading shop settings", err));

    // Load custom subscription tiers
    axios.get('/api/subscription-tiers')
      .then(res => {
        if (Array.isArray(res.data)) {
          setSubscriptionTiers(res.data);
        }
      })
      .catch(err => console.error("Error loading subscription tiers", err))
      .finally(() => setLoadingTiers(false));
  }, [searchParams]);

  // Fetch and update user profiles
  const fetchUser = () => {
    if (userId) {
      axios.get(`/api/users/telegram/${userId}`)
        .then(res => setUser(res.data))
        .catch(err => console.error("Error fetching user data:", err));
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  // Coupons state machine
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponValError, setCouponValError] = useState<string | null>(null);
  const [couponValSuccess, setCouponValSuccess] = useState<string | null>(null);
  const [couponValLoading, setCouponValLoading] = useState(false);

  const handleOpenCheckout = (id: string, name: string, price: number, creditsCount?: number, originalPrice?: number, discount?: number) => {
    setCheckoutItem({ id, name, price, creditsCount, originalPrice, discount });
    setPaymentId('');
    setPaymentError(null);
    setPaymentSuccess(null);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponValError(null);
    setCouponValSuccess(null);
  };

  const handleCloseCheckout = () => {
    setCheckoutItem(null);
    setPaymentId('');
    setPaymentError(null);
    setPaymentSuccess(null);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponValError(null);
    setCouponValSuccess(null);
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponValError("Please enter a coupon code.");
      return;
    }
    if (!checkoutItem) return;

    setCouponValLoading(true);
    setCouponValError(null);
    setCouponValSuccess(null);

    try {
      const res = await axios.post('/api/shop/validate-coupon', {
        code: couponCode.trim().toUpperCase(),
        productId: checkoutItem.id
      });
      if (res.data.success) {
        const validatedCoupon = res.data.coupon;
        setAppliedCoupon(validatedCoupon);
        setCouponValSuccess(`🎉 Coupon applied! ${validatedCoupon.discountPercent}% instant discount.`);
        
        // Calculate discounted price
        const original = checkoutItem.originalPrice ?? checkoutItem.price;
        const discountAmount = parseFloat(((original * validatedCoupon.discountPercent) / 100).toFixed(2));
        const finalPrice = parseFloat((original - discountAmount).toFixed(2));

        setCheckoutItem((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            originalPrice: original,
            discount: discountAmount,
            price: finalPrice
          };
        });
      }
    } catch (err: any) {
      setCouponValError(err.response?.data?.error || "Invalid coupon code.");
    } finally {
      setCouponValLoading(false);
    }
  };

  // Quantity changes handler
  const handleQuantityChange = (cmdName: string, val: string, minLimit: number) => {
    const numeric = parseInt(val, 10);
    
    // Clear validation error on change
    setValidationErrors(prev => ({ ...prev, [cmdName]: '' }));

    if (isNaN(numeric)) {
      setSelectedQuantities(prev => ({ ...prev, [cmdName]: 0 }));
      return;
    }

    setSelectedQuantities(prev => ({ ...prev, [cmdName]: numeric }));

    if (numeric < minLimit) {
      setValidationErrors(prev => ({ 
        ...prev, 
        [cmdName]: `Minimum purchase limit is ${minLimit} credits.` 
      }));
    }
  };

  // Process purchase click
  const handlePurchaseCommandInit = (cmd: any) => {
    const qty = selectedQuantities[cmd.command] || 0;
    const minLimit = cmd.minPurchaseCredits || 10;

    if (qty < minLimit) {
      setValidationErrors(prev => ({ 
        ...prev, 
        [cmd.command]: `Failed. You must buy at least ${minLimit} credits.` 
      }));
      return;
    }

    const pricePer = cmd.pricePerCredit || 0.5;
    const originalPrice = parseFloat((qty * pricePer).toFixed(2));
    
    // Apply discount if user is Premium
    let discountPercent = 0;
    if (user?.isPremium) {
      discountPercent = shopSettings.premiumDiscountPercent || 0;
      if (user.premiumTier) {
        const matchedTier = subscriptionTiers.find((t: any) => t.id === user.premiumTier);
        if (matchedTier) {
          discountPercent = matchedTier.discountPercent ?? discountPercent;
        }
      }
    }
    const discountAmount = parseFloat(((originalPrice * discountPercent) / 100).toFixed(2));
    const finalPrice = parseFloat((originalPrice - discountAmount).toFixed(2));

    handleOpenCheckout(
      cmd.command, 
      `${qty} Credits for ${cmd.command}`, 
      finalPrice, 
      qty, 
      originalPrice, 
      discountAmount
    );
  };

  const verifyPayment = async () => {
    if (!paymentId.trim()) {
      setPaymentError("Please enter your UTR or Transaction ID.");
      return;
    }
    if (!checkoutItem) return;

    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const botRef = searchParams.get('botRef') || undefined;
      const res = await axios.post('/api/shop/verify-payment', {
        telegramId: userId,
        productId: checkoutItem.id,
        amount: checkoutItem.price,
        paymentId: paymentId,
        creditsCount: checkoutItem.creditsCount,
        couponCode: appliedCoupon ? appliedCoupon.code : undefined,
        botRef: botRef
      });

      if (res.data.success) {
        setPaymentSuccess(`Verification successful! ${checkoutItem.name} has been added to your profile.`);
        fetchUser(); // Refresh credits and purchase history
        setPaymentId('');
        
        // Auto close after 4 seconds
        setTimeout(() => {
          handleCloseCheckout();
        }, 4000);
      }
    } catch (err: any) {
      console.error(err);
      setPaymentError(err.response?.data?.error || 'Verification failed. Please double check the transaction details and make sure payment is settled.');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Generate standard UPI Payment URL
  const getUpiUrl = () => {
    if (!checkoutItem) return '';
    const cleanName = checkoutItem.name.replace(/[^a-zA-Z0-9]/g, ' ');
    return `upi://pay?pa=alkhkumar@fam&pn=ENCORE_XOSINT_Shop&am=${checkoutItem.price}&cu=INR&tn=${encodeURIComponent(`XOSINT ${cleanName}`)}`;
  };

  // QR Server generation URL
  const getQrCodeSrc = () => {
    const upi = getUpiUrl();
    if (!upi) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upi)}`;
  };

  const isPremiumActive = user?.isPremium;
  const userActiveDiscount = (() => {
    if (user?.premiumTier) {
      const matchedTier = subscriptionTiers.find((t: any) => t.id === user.premiumTier);
      if (matchedTier) return matchedTier.discountPercent ?? (shopSettings.premiumDiscountPercent || 0);
    }
    return shopSettings.premiumDiscountPercent || 0;
  })();
  
  const premiumExpiresString = user?.premiumExpiresAt 
    ? new Date(user.premiumExpiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) 
    : '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-4 sm:p-6 flex flex-col items-center">
      <div className="w-full max-w-lg">
        
        {/* Header navigation */}
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors"
            id="back_btn"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
          
          <button 
            onClick={fetchUser} 
            className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm"
            title="Refresh Account Data"
            id="refresh_btn"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        {user && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-slate-100 dark:border-gray-800/80 p-5 mb-6" id="user_profile_card">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${isPremiumActive ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-white shadow-md' : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-slate-300'}`}>
                  {user.firstName ? user.firstName[0].toUpperCase() : 'U'}
                </div>
                {isPremiumActive && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 border border-white dark:border-gray-950 text-white rounded-full p-0.5" title="Premium Subscriber">
                    <Sparkles className="w-3 h-3 fill-current" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {user.firstName || 'Telegram User'}
                </h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                  ID: {user.telegramId}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${isPremiumActive ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-slate-400'}`}>
                  {isPremiumActive ? '👑 Premium Active' : 'Free Account'}
                </span>
                {isPremiumActive && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate">
                    Expires: {premiumExpiresString}
                  </p>
                )}
              </div>
            </div>

            {/* Custom credits summary inside User Card */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-gray-800/60 grid grid-cols-2 gap-4 text-center">
              <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-2.5 rounded-xl border border-indigo-100/40 dark:border-indigo-950/20">
                <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mb-0.5">Coins Balance</p>
                <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">{user.encCoins || 0} ENC</p>
              </div>
              <div className="bg-amber-50/50 dark:bg-amber-950/10 p-2.5 rounded-xl border border-amber-100/40 dark:border-amber-950/20">
                <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mb-0.5">Premium Advantage</p>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 truncate">
                  {isPremiumActive ? `✓ Get ${userActiveDiscount}% Discount!` : `${shopSettings.premiumDiscountPercent}% discount when Premium!`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-gray-800 mb-6" id="shop_tabs">
          <button 
            onClick={() => setActiveTab('buy')}
            className={`flex-1 py-3 text-center font-bold text-sm border-b-2 transition-all ${activeTab === 'buy' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            🛒 Marketplace
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-center font-bold text-sm border-b-2 transition-all ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            <span className="inline-flex items-center gap-1.5 justify-center">
              <History className="w-4 h-4" /> Purchase Logs
            </span>
          </button>
        </div>

        {/* Tab contents */}
        {activeTab === 'buy' && (
          <div className="space-y-6" id="buy_tab_content">
            {/* 1. Subscription Segment */}
            {loadingTiers ? (
              <div className="space-y-4" id="subscription_tiers_segment_loading">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-1.5 mb-1 animate-pulse">
                  <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500/10" />
                  <span>Loading Subscription Tiers...</span>
                </h2>
                <div className="h-48 bg-slate-100 dark:bg-gray-900 border border-slate-200/60 dark:border-gray-800 rounded-2xl animate-pulse"></div>
              </div>
            ) : subscriptionTiers && subscriptionTiers.length > 0 ? (
              <div className="space-y-4" id="subscription_tiers_segment">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500/10" />
                  <span>Choose Your Premium Tier</span>
                </h2>
                <div className="grid grid-cols-1 gap-4">
                  {subscriptionTiers.map((tier) => {
                    const isUserSubscribed = user?.premiumTier === tier.id && isPremiumActive;
                    return (
                      <div 
                        key={tier.id} 
                        className={`rounded-2xl p-5 border text-white relative overflow-hidden transition-all shadow-md ${
                          isUserSubscribed 
                            ? 'bg-gradient-to-br from-indigo-600 to-indigo-850 border-indigo-750' 
                            : 'bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-950 border-slate-750/30'
                        }`}
                      >
                        <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-yellow-300 fill-current" />
                                {isUserSubscribed ? '👑 Active Sub' : 'Monthly Premium'}
                              </span>
                              <span className="font-extrabold text-[10px] text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded font-mono uppercase tracking-wide">{tier.id}</span>
                            </div>
                            <h3 className="text-base font-black mt-2 leading-none flex items-center gap-1">
                              {tier.name}
                            </h3>
                            <p className="text-white/70 text-[11px] mt-1.5 leading-relaxed">
                              Run command queries on VIP private chats, bypass daily rate quotas, and gain custom discount rates.
                            </p>
                          </div>

                          {/* Info list */}
                          <div className="space-y-3 text-xs text-white/90">
                            <div className="flex flex-col gap-1.5 bg-black/20 p-3 rounded-lg border border-white/5">
                              <span className="text-[10px] uppercase font-black text-white/50 tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-yellow-300" /> Tier Perks & Bonus Quotas
                              </span>
                              {tier.commands && tier.commands.length > 0 ? (
                                <div className="space-y-1.5">
                                  {tier.commands.map((tc: any, index: number) => (
                                    <div key={index} className="flex justify-between items-center text-[10px] bg-white/5 px-2.5 py-1 rounded border border-white/5">
                                      <span className="font-extrabold text-white/95 font-mono">{tc.command}</span>
                                      {Number(tc.bonusCommonCredits || 0) > 0 && (
                                        <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-500/20 text-[9px] font-black px-2 py-0.5 rounded shadow-sm">
                                          +{tc.bonusCommonCredits} Bonus Credits
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] italic text-white/40">No additional instant credits defined for this tier.</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20 shrink-0" />
                              <span>Flat <strong>{tier.discountPercent}% OFF</strong> on separate credit checkouts</span>
                            </div>

                            {(() => {
                              const lowercaseId = (tier.id || "").toLowerCase();
                              let limit = 0;
                              if (lowercaseId.includes("basic")) limit = 10;
                              else if (lowercaseId.includes("gold")) limit = 25;
                              else if (lowercaseId.includes("max") || lowercaseId.includes("premium")) limit = 50;

                              if (limit > 0) {
                                return (
                                  <div className="flex items-center gap-2 text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2.5 py-1.5 rounded-xl text-indigo-200 transition">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span>🔎 <strong>MASS SEARCH</strong>: Max <strong>{limit} parameters</strong> / run</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
                            <div>
                              <span className="text-white/40 text-[9px] block font-bold uppercase tracking-wider">Subscription Rate</span>
                              <span className="text-lg font-black">₹{tier.price}<span className="text-[10px] font-normal"> / month</span></span>
                            </div>
                            <button
                              onClick={() => {
                                if (isUserSubscribed) return;
                                handleOpenCheckout(tier.id, `${tier.name} Subscription`, tier.price);
                              }}
                              disabled={isUserSubscribed}
                              className={`font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 ${
                                isUserSubscribed 
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 cursor-default' 
                                  : 'bg-white hover:bg-slate-50 text-indigo-950 hover:text-indigo-900 cursor-pointer'
                              }`}
                            >
                              {isUserSubscribed ? '✓ Subscribed' : '👑 Subscribe'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 2. Credits Shop Segment */}
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-500" />
                Buy Command Credits
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                Configure your own quantity to purchase credits for specific premium API commands. Standard rates apply, with custom discount perks automatically credited on checkouts.
              </p>

              {commands.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6 text-center text-slate-400">
                  No command credit packs currently configured in the shop.
                </div>
              ) : (
                <div className="space-y-4" id="credit_packs_list">
                  {commands.map((cmd) => {
                    const qty = selectedQuantities[cmd.command] || 0;
                    const error = validationErrors[cmd.command];
                    const pricePer = cmd.pricePerCredit || 0.5;
                    const basePrice = parseFloat((qty * pricePer).toFixed(2));
                    
                    const discountPercent = isPremiumActive ? userActiveDiscount : 0;
                    const discountAmount = parseFloat(((basePrice * discountPercent) / 100).toFixed(2));
                    const currentTotal = parseFloat((basePrice - discountAmount).toFixed(2));

                    return (
                      <div 
                        key={cmd._id} 
                        className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-slate-200/60 dark:border-gray-800 shadow-sm hover:border-slate-350 dark:hover:border-gray-700 transition-all space-y-4"
                      >
                        {/* Title and rate */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="inline-block bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded mb-1">
                              ₹{pricePer} / Credit
                            </span>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                              Credits for {cmd.command}
                            </h3>
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                              {cmd.description || 'API Search Command limits pack'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-slate-400 block font-bold">Min Purchase Limit</span>
                            <span className="bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-slate-300 text-[11px] font-extrabold px-2 py-0.5 rounded block text-center mt-1">
                              {cmd.minPurchaseCredits || 20}
                            </span>
                          </div>
                        </div>

                        {/* Interactive selector */}
                        <div className="pt-3 border-t border-slate-100 dark:border-gray-850 flex items-center justify-between gap-4">
                          <div className="w-1/2">
                            <label className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mb-1">Credits count</label>
                            <input 
                              type="number" 
                              value={qty === 0 ? '' : qty}
                              onChange={(e) => handleQuantityChange(cmd.command, e.target.value, cmd.minPurchaseCredits || 20)}
                              className="w-full bg-slate-50 dark:bg-gray-950 p-2 border border-slate-200 dark:border-gray-800 focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold rounded-lg text-sm"
                              placeholder={String(cmd.minPurchaseCredits || 20)}
                            />
                          </div>

                          {/* Price calculation and verify action */}
                          <div className="w-1/2 text-right">
                            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mb-0.5">Calculated Cost</p>
                            
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {isPremiumActive && discountAmount > 0 && (
                                <span className="text-xs text-slate-400 line-through">₹{basePrice.toFixed(1)}</span>
                              )}
                              <span className="text-lg font-black text-slate-900 dark:text-indigo-400">₹{currentTotal.toFixed(2)}</span>
                            </div>

                            {isPremiumActive && discountAmount > 0 && (
                              <p className="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold">
                                (Saved ₹{discountAmount.toFixed(1)} with VIP Discount!)
                              </p>
                            )}
                          </div>
                        </div>

                        {error && (
                          <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {error}
                          </p>
                        )}

                        <button 
                          onClick={() => handlePurchaseCommandInit(cmd)}
                          disabled={qty < (cmd.minPurchaseCredits || 20)}
                          className={`w-full font-black text-xs py-2.5 rounded-lg text-center transition-all ${qty < (cmd.minPurchaseCredits || 20) ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-gray-800' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-sm'}`}
                        >
                          Checkout Custom Credits
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User purchases history tab */}
        {activeTab === 'history' && (
          <div className="space-y-4" id="history_tab_content">
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              Your Purchase History
            </h2>
            
            {(!user || !user.purchaseHistory || user.purchaseHistory.length === 0) ? (
              <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-8 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold">No Purchases Found</p>
                <p className="text-xs">Your payment transaction records and subscription orders will print here.</p>
              </div>
            ) : (
              <div className="space-y-3" id="purchase_history_list">
                {user.purchaseHistory.map((history: any, idx: number) => (
                  <div key={idx} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-150 dark:border-gray-800 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {history.productName}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Ordered on {new Date(history.date).toLocaleDateString()} at {new Date(history.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                        ₹{history.price}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-gray-800/40 grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400 block">UTR reference:</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono break-all">{history.utr || 'N/A'}</code>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-right">Transaction status:</span>
                        <span className="text-emerald-500 dark:text-emerald-400 font-extrabold block text-right">
                          ✓ SUCCESSFUL
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Checkout Payment Overlay Modal */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-6" id="checkout_modal_container">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-gray-800 mb-4">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                💳 Secure UPI Payment Checkout
              </h3>
              <button 
                onClick={handleCloseCheckout}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1"
                id="close_checkout_btn"
              >
                ✕
              </button>
            </div>

            {/* Product description */}
            <div className="bg-slate-50 dark:bg-gray-950 p-4 rounded-xl mb-5 border border-slate-100 dark:border-gray-850">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Item Selected</span>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{checkoutItem.name}</h4>
              
              {checkoutItem.originalPrice && checkoutItem.discount ? (
                <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-gray-800 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Subtotal:</span>
                    <span>₹{checkoutItem.originalPrice}</span>
                  </div>
                  <div className="flex justify-between text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                    <span>Premium Discount ({userActiveDiscount}%):</span>
                    <span>-₹{checkoutItem.discount}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-900 dark:text-white font-extrabold text-sm pt-1 border-t border-dashed border-slate-200 dark:border-gray-800">
                    <span>Payable Amount:</span>
                    <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">₹{checkoutItem.price}</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-slate-200/50 dark:border-gray-800">
                  <span className="text-xs text-slate-500">Payable Amount:</span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-sans">₹{checkoutItem.price}</span>
                </div>
              )}
            </div>

            {/* Promo Coupon Module (Membership subscriptions only) */}
            {!checkoutItem.creditsCount && !paymentSuccess && (
              <div className="bg-amber-50/50 dark:bg-amber-950/15 border border-amber-200/50 dark:border-amber-900/30 p-3.5 rounded-xl mb-4 space-y-2 text-xs text-left" id="subscription_checkout_coupon_box">
                <span className="text-amber-800 dark:text-amber-300 font-extrabold text-[10px] uppercase tracking-wider block">
                  🎟️ Have a Subscription Coupon Code?
                </span>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="E.G. WELCOME50"
                    disabled={couponValLoading || !!appliedCoupon}
                    className="flex-1 bg-white dark:bg-gray-800 border border-slate-250 dark:border-gray-750 rounded-lg px-2.5 py-1.5 font-bold uppercase tracking-wider text-slate-800 dark:text-white text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponValLoading || !!appliedCoupon || !couponCode.trim()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors border ${appliedCoupon ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 hover:border-amber-600 cursor-pointer disabled:bg-slate-200 dark:disabled:bg-gray-800 disabled:text-slate-400 disabled:border-slate-200 dark:disabled:border-gray-850'}`}
                  >
                    {couponValLoading ? 'Checking...' : appliedCoupon ? '✓ APPLIED' : 'APPLY'}
                  </button>
                </div>
                {couponValError && (
                  <span className="text-[10px] text-red-650 dark:text-red-400 font-bold block text-left">
                    ⚠️ {couponValError}
                  </span>
                )}
                {couponValSuccess && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black block text-left">
                    {couponValSuccess}
                  </span>
                )}
              </div>
            )}

            {/* Verification Success Screen */}
            {paymentSuccess ? (
              <div className="text-center py-6 space-y-3" id="verification_success_screen">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/50 rounded-full flex items-center justify-center text-emerald-500 mx-auto border border-emerald-100 dark:border-emerald-800 animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">Transaction Verified!</h4>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 max-w-xs mx-auto leading-relaxed">
                  {paymentSuccess}
                </p>
                <p className="text-[10px] text-slate-400">
                  Refreshing your profile... closing checkout window.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* Visual Step QR code generation */}
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Step 1: Scan & Pay ₹{checkoutItem.price}
                  </p>
                  
                  {/* UPI QR Frame */}
                  <div className="inline-block p-4 bg-white rounded-xl border border-slate-250/80 shadow-md">
                    <img 
                      src={getQrCodeSrc()} 
                      alt="UPI QR Code Payment and Verification" 
                      className="w-48 h-48 mx-auto" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="mt-2 text-[10px] font-bold text-slate-500 tracking-tight flex items-center justify-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Scan QR Code with UPI App</span>
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-slate-400 max-w-xs mx-auto mt-2 leading-tight">
                    Scan with any UPI application (GPay, Paytm, PhonePe, FamPay, etc.) to pay exactly <span className="font-extrabold text-slate-800 dark:text-slate-200">₹{checkoutItem.price}</span>.
                  </p>
                </div>

                {/* Input forms for verification */}
                <div className="pt-4 border-t border-slate-100 dark:border-gray-850">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Step 2: Enter Transaction UTR / ID
                  </p>
                  
                  <div className="space-y-2">
                    <div>
                      <input 
                        type="text" 
                        value={paymentId}
                        onChange={(e) => setPaymentId(e.target.value)}
                        placeholder="Enter 12-digit UPI UTR"
                        className="w-full p-2.5 rounded-xl text-center font-mono font-bold tracking-widest text-[#000] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm"
                        disabled={paymentLoading}
                        id="payment_id_input"
                      />
                      <p className="text-[9px] text-slate-400 leading-normal mt-1.5 flex items-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-450 shrink-0 mt-0.5" />
                        <span>
                          <strong>Note:</strong> Enter final Settlement transaction Number. If paid via Fampay app, enter <strong>Fampay Transaction ID</strong> directly (e.g. starting with FMP).
                        </span>
                      </p>
                    </div>

                    {paymentError && (
                      <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-2.5 rounded-lg text-[11px] font-medium border border-red-100 dark:border-red-900/30 flex items-start gap-1.5 leading-relaxed">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{paymentError}</span>
                      </div>
                    )}

                    <button 
                      onClick={verifyPayment}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl py-3 text-xs tracking-wide transition-all shadow-md mt-1 disabled:opacity-50 flex items-center justify-center gap-2"
                      disabled={paymentLoading || !paymentId.trim()}
                      id="submit_verify_btn"
                    >
                      {paymentLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Verifying settlement trans...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" /> Submit & Verify Payment
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-gray-850 flex items-center justify-center gap-1 text-[10px] text-slate-400">
              <Lock className="w-3 h-3 text-slate-450" /> Secure double-spend protection online
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
