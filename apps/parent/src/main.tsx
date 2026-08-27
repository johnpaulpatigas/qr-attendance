import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { initOfflineDatabase } from '@qr-attendance/supabase';
import { AuthProvider } from './features/auth';
import { router } from './app/router';
import './styles/index.css';

// Initialize native/web SQLite offline database
initOfflineDatabase().catch((err) => {
  console.warn('Parent SQLite init non-critical notice:', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
