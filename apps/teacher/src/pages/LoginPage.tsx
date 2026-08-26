import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QrCode, Lock, Mail, KeyRound } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input } from '@qr-attendance/ui';
import { loginSchema, passwordResetSchema } from '@qr-attendance/validation';
import { useAuth } from '../features/auth/AuthContext';
import { useAppBackButton } from '../hooks/useAppBackButton';

export const LoginPage: React.FC = () => {
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useAppBackButton({
    onCustomBack: () => {
      if (isResetMode) {
        setIsResetMode(false);
        setError(null);
        setSuccessMessage(null);
        return true;
      }
      return false;
    },
  });

  const { signInWithEmail, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    const { error: authError } = await signInWithEmail(email, password);
    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      navigate(from, { replace: true });
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validation = passwordResetSchema.safeParse({ email });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    const { error: resetErr } = await resetPassword(email);
    setLoading(false);

    if (resetErr) {
      setError(resetErr.message);
    } else {
      setSuccessMessage('Password reset instructions sent to your email address.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-xl mb-3">
            <QrCode className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">MNHS Teacher Portal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Marigondon National High School • Attendance Management System
          </p>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardHeader>
            <CardTitle>{isResetMode ? 'Reset Password' : 'Sign In'}</CardTitle>
            <CardDescription>
              {isResetMode
                ? 'Enter your registered MNHS teacher email to receive a recovery link'
                : 'Enter your teacher credentials to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typeof navigator !== 'undefined' && !navigator.onLine && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span><strong>Offline Mode:</strong> Sign in with the credentials previously used on this device.</span>
              </div>
            )}
            {isResetMode ? (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                    {error}
                  </div>
                )}
                {successMessage && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                    {successMessage}
                  </div>
                )}

                <Input
                  label="MNHS / DepEd Email"
                  type="email"
                  placeholder="teacher@mnhs.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
                <Button type="submit" className="w-full" isLoading={loading} leftIcon={<KeyRound className="h-4 w-4" />}>
                  Send Reset Link
                </Button>
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                    {error}
                  </div>
                )}
                <Input
                  label="MNHS / DepEd Email"
                  type="email"
                  placeholder="teacher@mnhs.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setError(null);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <Button type="submit" className="w-full" isLoading={loading}>
                  Sign In
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
