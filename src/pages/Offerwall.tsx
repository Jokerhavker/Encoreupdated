import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Coins, MonitorPlay, Gift, PlaySquare } from 'lucide-react';
import { motion } from 'motion/react';

const FLOATING_ITEMS = ['🪙', '💎', '🎮', '💸', '✨', '🎁', '💰', '🌟'];

function FloatingBackground() {
  const [items, setItems] = useState<{ id: number; emoji: string; x: number; delay: number; duration: number; size: number }[]>([]);

  useEffect(() => {
    // Generate random items for the background
    const newItems = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      emoji: FLOATING_ITEMS[Math.floor(Math.random() * FLOATING_ITEMS.length)],
      x: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 10 + Math.random() * 20,
      size: 1 + Math.random() * 2,
    }));
    setItems(newItems);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 bg-animate-gradient bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-90 dark:from-indigo-900 dark:via-purple-900 dark:to-pink-900 font-sans">
      {items.map((item) => (
        <motion.div
          key={item.id}
          className="absolute bottom-[-10%] opacity-20 dark:opacity-30 drop-shadow-lg"
          initial={{ y: '100%', x: `${item.x}vw`, rotate: 0 }}
          animate={{
            y: '-120vh',
            x: [`${item.x}vw`, `${item.x + 10}vw`, `${item.x - 5}vw`, `${item.x}vw`],
            rotate: [0, 90, 180, 270, 360],
          }}
          transition={{
            duration: item.duration,
            repeat: Infinity,
            delay: item.delay,
            ease: "linear",
          }}
          style={{ fontSize: `${item.size}rem` }}
        >
          {item.emoji}
        </motion.div>
      ))}
    </div>
  );
}

export function Offerwall() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [playerId, setPlayerId] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const [monetagEnabled, setMonetagEnabled] = useState<boolean>(true);
  const [monetagCooldown, setMonetagCooldown] = useState<number>(0);
  const [adGapMinutes, setAdGapMinutes] = useState<number>(10);
  const [isAdReady, setIsAdReady] = useState(false);
  const [isAdBlockerDetected, setIsAdBlockerDetected] = useState<boolean>(false);

  useEffect(() => {
    // Fetch global ad settings
    axios.get('/api/settings').then(res => {
        const rewardSetting = res.data.find((s: any) => s.key === 'rewardSettings');
        if (rewardSetting) {
            setMonetagEnabled(rewardSetting.value?.Monetag !== false);
        }
        const adGapSetting = res.data.find((s: any) => s.key === 'adGapMinutes');
        if (adGapSetting) {
            setAdGapMinutes(Number(adGapSetting.value));
        }
    }).catch(err => console.error("Error loading settings:", err));

    // Resolve player Telegram ID
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgUser) {
        setPlayerId(String(tgUser));
    } else {
        const paramId = searchParams.get('userid') || searchParams.get('playerid');
        if (paramId) {
          setPlayerId(paramId);
        }
    }
    
    if ((window as any).Telegram?.WebApp) {
        const WebApp = (window as any).Telegram.WebApp;

        // Silently ignore standard CloudStorage error logs
        const originalConsoleError = console.error;
        console.error = (...args: any[]) => {
            if (typeof args[0] === 'string' && args[0].includes('CloudStorage is not supported')) {
                return;
            }
            originalConsoleError(...args);
        };
        
        WebApp.ready();
        setTimeout(() => {
            console.error = originalConsoleError;
        }, 1000);
    }
  }, [searchParams]);

  // Handle countdown decrement
  useEffect(() => {
    const timer = setInterval(() => {
        setMonetagCooldown(prev => (prev > 0 ? prev - 1000 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Inject Monetag Reward Script Only
  useEffect(() => {
    // 1. Script onerror check
    const script = document.createElement('script');
    script.src = '//libtl.com/sdk.js';
    script.setAttribute('data-zone', '10924313');
    script.setAttribute('data-sdk', 'show_10924313');
    script.onload = () => {
      setIsAdReady(true);
      setIsAdBlockerDetected(false);
    };
    script.onerror = () => {
        console.warn("Monetag script failed to load (possibly blocked).");
        setIsAdBlockerDetected(true);
        setIsAdReady(false);
    };
    document.body.appendChild(script);

    // 2. Fetch ad network domain check
    fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', { mode: 'no-cors', method: 'HEAD' })
      .catch(() => {
        console.warn("Blocked request to pagead. Adblocker is likely enabled.");
        setIsAdBlockerDetected(true);
      });

    // 3. Decoy DOM element check
    const decoy = document.createElement('div');
    decoy.className = 'adsbox ad-banner google-publisher-ad';
    decoy.setAttribute('style', 'position: absolute; left: -9999px; width: 1px; height: 1px;');
    document.body.appendChild(decoy);
    const decoyTimeout = setTimeout(() => {
      if (
        decoy.offsetHeight === 0 || 
        decoy.clientHeight === 0 || 
        (window.getComputedStyle && window.getComputedStyle(decoy).display === 'none')
      ) {
        console.warn("Decoy DOM elements hidden. Adblocker is active.");
        setIsAdBlockerDetected(true);
      }
      try {
        if (document.body.contains(decoy)) {
          document.body.removeChild(decoy);
        }
      } catch (err) {}
    }, 150);

    return () => {
      clearTimeout(decoyTimeout);
      try {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      } catch (e) {
        console.warn("Clean up of script failed:", e);
      }
    };
  }, []);

  // Sync user object
  useEffect(() => {
    if (playerId) {
      fetch(`/api/users/telegram/${playerId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setUser(data);
          }
        })
        .catch(err => console.error(err));
    }
  }, [playerId]);

  const handleWatchAd = () => {
    if (monetagCooldown > 0) {
        alert(`Please watch the ad later in ${Math.ceil(monetagCooldown / 1000)} seconds.`);
        return;
    }
    const showAd = (window as any).show_10924313;
    if (typeof showAd === 'function') {
      showAd().then(() => {
        if (playerId) {
            fetch(`/api/users/telegram/${playerId}/reward-ad`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ provider: 'Monetag' })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setUser((prev: any) => ({ ...prev, encCoins: data.newBalance }));
                    setMonetagCooldown(adGapMinutes * 60 * 1000);
                } else if (data.timeLeft) {
                    setMonetagCooldown(data.timeLeft);
                }
            })
            .catch(err => console.error("Error rewarding viewer:", err));
        }
      }).catch((e: any) => {
          console.error("Ad video skipped or terminated early:", e);
      });
    } else {
      alert('Ad provider engine is booting up. Please try again in a few seconds.');
    }
  };

  if (!playerId) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900 font-sans">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-indigo-200 dark:bg-indigo-900 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden font-sans">
      <FloatingBackground />

      <div className="relative z-10">
        {/* Header Profile Frame */}
        <div className="p-8 pb-12 pt-10 text-center text-white relative flex flex-col items-center">
          
          {user && (
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-8 w-full max-w-sm bg-white/20 dark:bg-black/20 backdrop-blur-md rounded-2xl p-4 border border-white/35 shadow-lg flex items-center justify-between"
            >
              <div className="flex flex-col items-start ml-2 text-left">
                <span className="font-bold text-lg leading-tight text-white drop-shadow-md">
                  {user.firstName || user.username || 'User'}
                </span>
                <span className="text-xs text-white/80 font-mono">ID: {user.telegramId}</span>
                {user.username && <span className="text-xs text-white/85">@{user.username}</span>}
              </div>
              <div className="flex flex-col items-end mr-2 text-right">
                <span className="text-xs text-yellow-200 font-bold uppercase tracking-wider">ENC Coins</span>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-5 h-5 text-yellow-300" />
                  <span className="text-2xl font-black text-white drop-shadow-sm">{user.encCoins || 0}</span>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="relative z-10 backdrop-blur-sm bg-white/10 dark:bg-black/10 inline-block p-6 rounded-3xl border border-white/20 shadow-xl"
          >
              <Coins className="w-16 h-16 mx-auto mb-4 text-yellow-300 drop-shadow-md" />
              <h1 className="text-3.5xl font-black mb-2 tracking-tight text-white drop-shadow-lg">Earn ENC Rewards</h1>
              <p className="text-white/90 font-medium text-sm md:text-base drop-shadow">
                Watch Monetag media videos to earn coins and exchange them on the go!
              </p>
          </motion.div>
        </div>

        {/* Ad Watch & Store Navigation */}
        <div className="px-4 pb-12">
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-2xl mx-auto space-y-4"
          >
            
            {monetagEnabled ? (
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/40 dark:border-gray-700 overflow-hidden hover:shadow-2xl transition-all hover:-translate-y-1">
                <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 w-full text-left">
                    <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0 shadow-inner">
                      <MonitorPlay className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg">Watch & Earn Video Boost</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Complete Monetag short ads to automatically add coins.</p>
                    </div>
                  </div>
                  
                  {isAdBlockerDetected ? (
                    <div className="w-full sm:w-auto bg-red-100/90 dark:bg-red-950/40 p-4 rounded-xl text-center border border-red-300 dark:border-red-900/50">
                      <p className="text-red-700 dark:text-red-400 text-sm font-bold">⚠️ Adblocker Active</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Please disable Adblocker/Shields and reload to Watch Ad</p>
                    </div>
                  ) : (
                    <button 
                      onClick={handleWatchAd}
                      disabled={!isAdReady || monetagCooldown > 0}
                      className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold shadow-lg transition-transform active:scale-95 whitespace-nowrap flex items-center justify-center gap-2 ${
                        isAdReady && monetagCooldown === 0
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white cursor-pointer' 
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {monetagCooldown > 0 ? (
                        `Wait ${Math.ceil(monetagCooldown / 1000)}s`
                      ) : isAdReady ? (
                        <>
                          <PlaySquare className="w-5 h-5 fill-current opacity-80" />
                          <span>Watch (+10 ENC)</span>
                        </>
                      ) : (
                        'Booting Ad...'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-md p-8 text-center text-gray-400">
                <Coins className="w-8 h-8 text-gray-350 mx-auto mb-2" />
                <p className="text-sm font-medium">Video rewards are temporarily closed by Admin.</p>
              </div>
            )}
            
            {/* Direct Shop Link Accent */}
            <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/40 dark:border-gray-700 p-6 mt-8 text-center">
                <button 
                  onClick={() => navigate('/redeem')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-transform active:scale-95 flex items-center justify-center gap-3 text-xl cursor-pointer"
                >
                  <Gift className="w-8 h-8" /> Open Redeem Store
                </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="max-w-2xl mx-auto mt-8 text-center text-white/80 dark:text-white/60 text-sm drop-shadow-md font-medium px-4"
          >
            <p>Deactivate ad block extensions or browsers to make sure coins credits are credited successfully.</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
