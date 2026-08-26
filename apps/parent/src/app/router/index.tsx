import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ParentLayout } from '../../components/layout/ParentLayout';
import { ProtectedRoute } from '../../features/auth/ProtectedRoute';
import { LoadingState, ErrorBoundary } from '@qr-attendance/ui';

const TodayAttendancePage = lazy(() => import('../../pages/TodayAttendancePage').then((m) => ({ default: m.TodayAttendancePage })));
const AttendanceHistoryPage = lazy(() => import('../../pages/AttendanceHistoryPage').then((m) => ({ default: m.AttendanceHistoryPage })));
const StatisticsPage = lazy(() => import('../../pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage })));
const NotificationsPage = lazy(() => import('../../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const LoginPage = lazy(() => import('../../pages/LoginPage').then((m) => ({ default: m.LoginPage })));

const SuspendedRoute = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={<div className="p-12"><LoadingState message="Loading module..." /></div>}>
      {children}
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <SuspendedRoute>
        <LoginPage />
      </SuspendedRoute>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <ParentLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <SuspendedRoute>
            <TodayAttendancePage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'history',
        element: (
          <SuspendedRoute>
            <AttendanceHistoryPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'statistics',
        element: (
          <SuspendedRoute>
            <StatisticsPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'notifications',
        element: (
          <SuspendedRoute>
            <NotificationsPage />
          </SuspendedRoute>
        ),
      },
    ],
  },
]);

