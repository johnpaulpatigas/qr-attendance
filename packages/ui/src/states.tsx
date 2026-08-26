import React from 'react';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import { cn } from './utils';
import { Button } from './button';

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className,
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return <Loader2 className={cn('animate-spin text-blue-600', sizes[size], className)} />;
};

export const LoadingState: React.FC<{ message?: string; className?: string }> = ({
  message = 'Loading...',
  className,
}) => (
  <div
    className={cn('flex flex-col items-center justify-center space-y-3 p-8 text-center', className)}
  >
    <Spinner size="lg" />
    <p className="text-sm font-medium text-slate-500">{message}</p>
  </div>
);

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center',
      className
    )}
  >
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
      {icon || <Inbox className="h-6 w-6" />}
    </div>
    <h4 className="text-base font-semibold text-slate-900">{title}</h4>
    {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
    {action && (
      <div className="mt-5">
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      </div>
    )}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center',
      className
    )}
  >
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
      <AlertCircle className="h-6 w-6" />
    </div>
    <h4 className="text-base font-semibold text-rose-900">{title}</h4>
    <p className="mt-1.5 max-w-md text-sm text-rose-700">{message}</p>
    {onRetry && (
      <div className="mt-5">
        <Button onClick={onRetry} variant="danger" size="sm">
          Try Again
        </Button>
      </div>
    )}
  </div>
);
