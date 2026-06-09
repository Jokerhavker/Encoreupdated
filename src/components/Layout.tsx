import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, TerminalSquare, Users, MessageSquareShare, Settings, Layers, LogOut, Gift, ShoppingCart, Receipt, Bot, Heart } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/commands', label: 'Commands', icon: TerminalSquare },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/groups', label: 'Groups', icon: Layers },
  { href: '/broadcast', label: 'Broadcast', icon: MessageSquareShare },
  { href: '/mirror-bots', label: 'Mirror Bots', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/redeem-store', label: 'Redeem Store', icon: Gift },
  { href: '/store-management', label: 'Store Management', icon: ShoppingCart },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/donations', label: 'Donations', icon: Heart },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('adminKey');
    navigate('/suwmwiuwnwkw');
  };

  return (
    <div className="flex flex-col-reverse md:flex-row bg-gray-50 h-screen w-full font-sans overflow-hidden">
      <aside className="w-full md:w-64 bg-white border-t md:border-t-0 md:border-r border-gray-200 flex flex-row md:flex-col shrink-0 z-10">
        <div className="hidden md:flex h-16 items-center px-6 border-b border-gray-200 font-bold text-lg tracking-tight text-indigo-600 shrink-0">
          ENCORE XOSINT
        </div>
        <div className="flex-1 flex flex-col justify-between overflow-x-auto md:overflow-y-auto">
          <nav className="flex flex-row md:flex-col py-2 px-2 md:py-4 md:px-3 gap-1 whitespace-nowrap">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex md:justify-start justify-center flex-col md:flex-row items-center px-4 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium rounded-md transition-colors shrink-0",
                    active ? "bg-indigo-50 text-indigo-700" : "text-gray-500 md:text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("mb-1 md:mb-0 md:mr-3 h-5 w-5", active ? "text-indigo-600" : "text-gray-400")} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          
          <div className="hidden md:block p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col items-stretch w-full overflow-y-auto overflow-x-hidden relative">
        <header className="bg-white border-b border-gray-200 h-14 md:h-16 flex items-center px-4 md:px-8 shrink-0 shadow-sm sticky top-0 z-10">
          <div className="flex-1 flex justify-between items-center">
            <h1 className="text-lg md:text-xl font-semibold capitalize tracking-tight truncate">
              {navItems.find(i => i.href === location.pathname)?.label || 'Dashboard'}
            </h1>
            
            <button
              onClick={handleLogout}
              className="md:hidden flex items-center px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </button>
          </div>
        </header>
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
