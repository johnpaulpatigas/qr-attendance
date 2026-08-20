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
} from 'lucide-react';
import { Button, Badge } from '@qr-attendance/ui';

export const ParentLayout: React.FC = () => {
  const location = useLocation();
  const [selectedChild, setSelectedChild] = useState('1');

  const navigation = [
    { name: "Today's Status", href: '/', icon: CalendarCheck },
    { name: 'History', href: '/history', icon: History },
    { name: 'Statistics', href: '/statistics', icon: BarChart2 },
    { name: 'Notifications', href: '/notifications', icon: Bell, badge: 2 },
  ];

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

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
            <h1 className="text-base font-bold text-slate-900 leading-tight">DepEd QR</h1>
            <p className="text-xs font-medium text-slate-500">Parent & Student Portal</p>
          </div>
        </div>

        {/* Child Selector Dropdown */}
        <div className="border-b border-slate-100 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Viewing Child
          </label>
          <div className="relative">
            <select
              value={selectedChild}
              onChange={(e) => setSelectedChild(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm font-medium text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="1">Juan Dela Cruz (Gr. 12 STEM A)</option>
              <option value="2">Maria Dela Cruz (Gr. 9 Rizal)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          </div>
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
                    ? 'bg-emerald-50 text-emerald-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {item.name}
                </div>
                {item.badge && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="border-t border-slate-200 p-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-600 hover:text-rose-600 hover:bg-rose-50"
            leftIcon={<LogOut className="h-4 w-4" />}
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

          <div className="hidden lg:flex items-center gap-2">
            <Badge variant="success" size="sm">FCM Push Enabled</Badge>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/notifications" className="relative p-1.5 text-slate-500 hover:text-slate-700">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </Link>
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-800">
              JD
            </div>
          </div>
        </header>

        {/* Page Content */}
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
                className={`flex flex-col items-center justify-center py-1 text-xs relative ${
                  active ? 'font-semibold text-emerald-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="mt-0.5 text-[10px]">{item.name}</span>
                {item.badge && (
                  <span className="absolute top-0.5 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
