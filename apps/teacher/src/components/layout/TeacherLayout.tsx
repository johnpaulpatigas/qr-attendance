import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  QrCode,
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart3,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, Badge } from '@qr-attendance/ui';
import { useAuth } from '../../features/auth/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export const TeacherLayout: React.FC = () => {
  const location = useLocation();
  const { profile, user, signOut } = useAuth();
  const { isOnline, queuedCount } = useNetworkStatus();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Scan Attendance', href: '/attendance', icon: QrCode },
    { name: 'Students', href: '/students', icon: Users },
    { name: 'Classes', href: '/classes', icon: BookOpen },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Teacher';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">DepEd QR</h1>
            <p className="text-xs font-medium text-slate-500">Teacher Portal</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 p-4">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Teacher Info & Logout */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between px-2 text-xs text-slate-500">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                Online
                {queuedCount > 0 && (
                  <Badge variant="warning" size="sm" className="text-[10px] py-0 px-1">
                    {queuedCount} Q
                  </Badge>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-600 font-medium animate-pulse">
                <WifiOff className="h-3.5 w-3.5 text-rose-500" />
                Offline ({queuedCount})
              </span>
            )}
            <Badge variant="info" size="sm">
              {profile?.role === 'admin' ? 'Administrator' : 'Teacher'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
              {initials}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-600 hover:text-rose-600 hover:bg-rose-50"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={() => signOut()}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <QrCode className="h-5 w-5" />
            </div>
            <span className="font-bold text-slate-900">Teacher Portal</span>
          </div>

          <div className="hidden lg:block text-sm font-medium text-slate-600">
            School Year: <span className="font-semibold text-slate-900">2026-2027</span>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="success" size="sm" className="hidden sm:inline-flex">
              Authenticated
            </Badge>
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
              {initials}
            </div>
          </div>
        </header>

        {/* Route Page Outlet */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:p-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white lg:hidden">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center py-1 text-xs ${
                  active ? 'font-semibold text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="mt-0.5 text-[10px]">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
