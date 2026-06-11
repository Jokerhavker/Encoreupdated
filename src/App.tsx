import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Commands } from './pages/Commands';
import { Users } from './pages/Users';
import { Groups } from './pages/Groups';
import { Broadcast } from './pages/Broadcast';
import { Settings } from './pages/Settings';
import { Offerwall } from './pages/Offerwall';
import { Redeem } from './pages/Redeem';
import { Login } from './pages/Login';
import { Shop } from './pages/Shop';
import { StoreManagement } from './pages/StoreManagement';
import { AdminGuard } from './components/AdminGuard';
import { RedeemStoreManagement } from './pages/RedeemStoreManagement';
import { Transactions } from './pages/Transactions';
import { MirrorManager } from './pages/MirrorManager';
import { MirrorAdmin } from './pages/MirrorAdmin';
import Donate from './pages/Donate';
import { Donations } from './pages/Donations';
import { MassApiRunner } from './pages/MassApiRunner';

function WebappMaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    axios.get('/api/bot-maintenance-status')
      .then(res => {
        if (res.data && res.data.maintenance === true) {
          setMaintenance(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 font-mono text-xs">
        Loading status...
      </div>
    );
  }

  if (maintenance) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white font-sans">
        <div className="max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500"></div>
          
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            🤖
          </div>
          
          <h1 className="text-xl font-black tracking-tight text-white mb-3">
            Bot is on maintenance
          </h1>
          
          <p className="text-sm text-slate-400 font-medium leading-relaxed mb-6">
            This service is suspended temporarily! Our system is currently undergoing scheduled upgrades or maintenance activities.
          </p>
          
          <div className="inline-flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-lg text-xs leading-none text-slate-400 font-mono">
            <span>STATUS:</span>
            <span className="text-amber-500 font-bold">TEMPORARILY SUSPENDED</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/suwmwiuwnwkw" element={<Login />} />
        <Route path="/rewards" element={<WebappMaintenanceGuard><Offerwall /></WebappMaintenanceGuard>} />
        <Route path="/redeem" element={<WebappMaintenanceGuard><Redeem /></WebappMaintenanceGuard>} />
        <Route path="/shop" element={<WebappMaintenanceGuard><Shop /></WebappMaintenanceGuard>} />
        <Route path="/mirrors" element={<WebappMaintenanceGuard><MirrorManager /></WebappMaintenanceGuard>} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/mass-run" element={<WebappMaintenanceGuard><MassApiRunner /></WebappMaintenanceGuard>} />
        <Route element={<AdminGuard />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="mirror-bots" element={<MirrorAdmin />} />
            <Route path="commands" element={<Commands />} />
            <Route path="users" element={<Users />} />
            <Route path="groups" element={<Groups />} />
            <Route path="broadcast" element={<Broadcast />} />
            <Route path="settings" element={<Settings />} />
            <Route path="redeem-store" element={<RedeemStoreManagement />} />
            <Route path="store-management" element={<StoreManagement />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="donations" element={<Donations />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
