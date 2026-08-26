import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserCheck, Lock, Mail, KeyRound, User, Hash, HeartHandshake } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Select,
} from '@qr-attendance/ui';
import { loginSchema, passwordResetSchema } from '@qr-attendance/validation';
import { useAuth } from '../features/auth';
import { useAppBackButton } from '../hooks/useAppBackButton';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [fullName, setFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [studentLrn, setStudentLrn] = useState('');
  const [relationship, setRelationship] = useState('Parent');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useAppBackButton({
    onCustomBack: () => {
      if (mode !== 'signin') {
        setMode('signin');
        setError(null);
        setSuccessMessage(null);
        return true;
      }
      return false;
    },
  });

  const { signInWithEmail, signUpWithStudentLrn, resetPassword } = useAuth();
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    const trimmedLrn = studentLrn.replace(/\D/g, '');
    if (trimmedLrn.length !== 12) {
      setError('Please enter a valid 12-digit Learner Reference Number (LRN).');
      return;
    }

    if (signUpPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const res = await signUpWithStudentLrn({
      fullName,
      email: signUpEmail,
      password: signUpPassword,
      studentLrn: trimmedLrn,
      relationship,
    });
    setLoading(false);

    if (res.error) {
      setError(res.error.message);
    } else if (res.emailConfirmationRequired) {
      setSuccessMessage(
        'Account registered and student linked! Please check your email inbox to confirm your account, then sign in.'
      );
      setEmail(signUpEmail);
      setTimeout(() => {
        setMode('signin');
      }, 3000);
    } else {
      setSuccessMessage('Account created and student successfully linked! Logging you in...');
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 1000);
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
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xl">
            <UserCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Parent & Student Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Classroom Attendance & Notifications</p>
        </div>

        {/* Tab Selector */}
        {mode !== 'reset' && (
          <div className="flex rounded-xl bg-slate-200 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                mode === 'signin'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                mode === 'signup'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        <Card className="border-slate-200 shadow-lg">
          <CardHeader>
            <CardTitle>
              {mode === 'signup'
                ? 'Create Parent Account'
                : mode === 'reset'
                  ? 'Reset Password'
                  : 'Sign In'}
            </CardTitle>
            <CardDescription>
              {mode === 'signup'
                ? 'Link your student with their 12-digit LRN for instant attendance access'
                : mode === 'reset'
                  ? 'Enter your registered email address to receive reset instructions'
                  : 'Enter your credentials to view attendance'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typeof navigator !== 'undefined' && !navigator.onLine && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
                <span>
                  <strong>Offline Mode:</strong> Sign in with the account previously used on this
                  device.
                </span>
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                {successMessage}
              </div>
            )}

            {mode === 'signup' ? (
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <Input
                  label="Your Full Name"
                  placeholder="e.g. Maria Santos"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  leftIcon={<User className="h-4 w-4" />}
                  required
                />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="parent@example.com"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
                <Input
                  label="Student Learner Reference No. (LRN)"
                  placeholder="12 numeric digits"
                  value={studentLrn}
                  onChange={(e) => setStudentLrn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  leftIcon={<Hash className="h-4 w-4" />}
                  helperText="12-digit LRN on student ID card or report card"
                  required
                />
                <Select
                  label="Relationship to Student"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  options={[
                    { value: 'Mother', label: 'Mother' },
                    { value: 'Father', label: 'Father' },
                    { value: 'Guardian', label: 'Guardian' },
                    { value: 'Student (Self)', label: 'Student (Self)' },
                  ]}
                />
                <Button
                  type="submit"
                  variant="success"
                  className="mt-2 w-full"
                  isLoading={loading}
                  leftIcon={<HeartHandshake className="h-4 w-4" />}
                >
                  Register & Link Student
                </Button>
              </form>
            ) : mode === 'reset' ? (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                />
                <Button
                  type="submit"
                  variant="success"
                  className="w-full"
                  isLoading={loading}
                  leftIcon={<KeyRound className="h-4 w-4" />}
                >
                  Send Reset Link
                </Button>
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-semibold text-emerald-700 underline hover:text-emerald-800"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="parent@example.com"
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
                      setMode('reset');
                      setError(null);
                    }}
                    className="text-xs text-emerald-700 underline hover:text-emerald-800"
                  >
                    Forgot Password?
                  </button>
                </div>
                <Button type="submit" variant="success" className="w-full" isLoading={loading}>
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
