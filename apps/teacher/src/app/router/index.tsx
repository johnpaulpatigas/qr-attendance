import { createBrowserRouter } from 'react-router-dom';
import { TeacherLayout } from '../../components/layout/TeacherLayout';
import { DashboardPage } from '../../pages/DashboardPage';
import { AttendancePage } from '../../pages/AttendancePage';
import { StudentsPage } from '../../pages/StudentsPage';
import { SF1ImportPage } from '../../pages/SF1ImportPage';
import { ClassesPage } from '../../pages/ClassesPage';
import { ReportsPage } from '../../pages/ReportsPage';
import { LoginPage } from '../../pages/LoginPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <TeacherLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'attendance',
        element: <AttendancePage />,
      },
      {
        path: 'students',
        element: <StudentsPage />,
      },
      {
        path: 'students/import-sf1',
        element: <SF1ImportPage />,
      },
      {
        path: 'classes',
        element: <ClassesPage />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
    ],
  },
]);
