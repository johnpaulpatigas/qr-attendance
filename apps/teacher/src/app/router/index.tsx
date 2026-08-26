import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { TeacherLayout } from '../../components/layout/TeacherLayout';
import { ProtectedRoute } from '../../features/auth/ProtectedRoute';
import { LoadingState, ErrorBoundary } from '@qr-attendance/ui';

const DashboardPage = lazy(() => import('../../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AttendancePage = lazy(() => import('../../pages/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const StudentsPage = lazy(() => import('../../pages/StudentsPage').then((m) => ({ default: m.StudentsPage })));
const SF1ImportPage = lazy(() => import('../../pages/SF1ImportPage').then((m) => ({ default: m.SF1ImportPage })));
const ClassesPage = lazy(() => import('../../pages/ClassesPage').then((m) => ({ default: m.ClassesPage })));
const ReportsPage = lazy(() => import('../../pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
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
        <TeacherLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <SuspendedRoute>
            <DashboardPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'attendance',
        element: (
          <SuspendedRoute>
            <AttendancePage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'students',
        element: (
          <SuspendedRoute>
            <StudentsPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'students/import-sf1',
        element: (
          <SuspendedRoute>
            <SF1ImportPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'classes',
        element: (
          <SuspendedRoute>
            <ClassesPage />
          </SuspendedRoute>
        ),
      },
      {
        path: 'reports',
        element: (
          <SuspendedRoute>
            <ReportsPage />
          </SuspendedRoute>
        ),
      },
    ],
  },
]);

