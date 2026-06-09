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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/suwmwiuwnwkw" element={<Login />} />
        <Route path="/rewards" element={<Offerwall />} />
        <Route path="/redeem" element={<Redeem />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/mirrors" element={<MirrorManager />} />
        <Route path="/donate" element={<Donate />} />
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
