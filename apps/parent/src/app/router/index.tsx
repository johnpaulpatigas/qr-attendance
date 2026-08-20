import { createBrowserRouter } from 'react-router-dom';
import { ParentLayout } from '../../components/layout/ParentLayout';
import { ProtectedRoute } from '../../features/auth/ProtectedRoute';
import { TodayAttendancePage } from '../../pages/TodayAttendancePage';
import { AttendanceHistoryPage } from '../../pages/AttendanceHistoryPage';
import { StatisticsPage } from '../../pages/StatisticsPage';
import { NotificationsPage } from '../../pages/NotificationsPage';
import { LoginPage } from '../../pages/LoginPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
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
        element: <TodayAttendancePage />,
      },
      {
        path: 'history',
        element: <AttendanceHistoryPage />,
      },
      {
        path: 'statistics',
        element: <StatisticsPage />,
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
      },
    ],
  },
]);
