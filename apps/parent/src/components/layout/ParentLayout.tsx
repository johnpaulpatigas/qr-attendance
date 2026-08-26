import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  CalendarCheck,
  History,
  BarChart2,
  Bell,
  LogOut,
  UserCheck,
  ChevronDown,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, Badge } from '@qr-attendance/ui';
import { useAuth } from '../../features/auth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAppBackButton } from '../../hooks/useAppBackButton';
import { LinkStudentModal } from './LinkStudentModal';

export const ParentLayout: React.FC = () => {
  const location = useLocation();
  const { user, profile, linkedChildren, activeChild, setActiveChildId, signOut } = useAuth();
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const isOnline = useNetworkStatus();

  useAppBackButton({
    onCustomBack: () => {
      if (isLinkModalOpen) {
        setIsLinkModalOpen(false);
        return true;
      }
      return false;
    },
  });

  const navigation = [
    { name: "Today's Status", href: '/', icon: CalendarCheck },
    { name: 'History', href: '/history', icon: History },
    { name: 'Statistics', href: '/statistics', icon: BarChart2 },
    { name: 'Notifications', href: '/notifications', icon: Bell },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Parent / Student';
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base leading-tight font-bold text-slate-900">QR Attendance</h1>
            <p className="text-xs font-medium text-slate-500">Parent & Student Portal</p>
          </div>
        </div>

        {/* Child Selector & Link Child Button */}
        <div className="space-y-2 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Linked Student
            </label>
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              <UserPlus className="h-3 w-3" /> + Link Child
            </button>
          </div>

          {linkedChildren.length > 0 ? (
            <div className="relative">
              <select
                value={activeChild?.student_id || ''}
                onChange={(e) => setActiveChildId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pr-8 pl-3 text-sm font-medium text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                {linkedChildren.map((c) => (
                  <option key={c.student_id} value={c.student_id}>
                    {c.first_name} {c.last_name} (Gr. {c.grade_level} {c.section_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 h-4 w-4 text-slate-400" />
            </div>
          ) : (
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100/60"
            >
              <UserPlus className="h-3.5 w-3.5" /> Link Student by LRN
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 p-4">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-50 font-semibold text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="flex items-center justify-between px-2 text-xs text-slate-500">
            {isOnline ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                Online
              </span>
            ) : (
              <span className="flex animate-pulse items-center gap-1.5 font-medium text-rose-600">
                <WifiOff className="h-3.5 w-3.5 text-rose-500" />
                Offline (Cached)
              </span>
            )}
            <Badge variant="info" size="sm">
              Parent
            </Badge>
          </div>
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
              {initials}
            </div>
            <div className="truncate">
              <p className="truncate text-xs font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-600 hover:bg-rose-50 hover:text-rose-600"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={() => signOut()}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <UserCheck className="h-5 w-5" />
            </div>
            <span className="font-bold text-slate-900">Parent Portal</span>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {isOnline ? (
              <Badge variant="success" size="sm" className="flex items-center gap-1">
                <Wifi className="h-3 w-3" /> Online & FCM Active
              </Badge>
            ) : (
              <Badge variant="danger" size="sm" className="flex animate-pulse items-center gap-1">
                <WifiOff className="h-3 w-3" /> Offline (Showing Cached Data)
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700 lg:hidden"
            >
              <UserPlus className="h-4 w-4" /> Link Child
            </button>
            <Link
              to="/notifications"
              className="relative p-1.5 text-slate-500 hover:text-slate-700"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
              {initials}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:p-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed right-0 bottom-0 left-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white lg:hidden">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`relative flex flex-col items-center justify-center py-1 text-xs ${
                  active ? 'font-semibold text-emerald-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="mt-0.5 text-[10px]">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Link Student Modal */}
      <LinkStudentModal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} />
    </div>
  );
};
