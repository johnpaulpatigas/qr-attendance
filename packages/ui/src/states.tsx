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

  return <Loader2 className={cn('animate-spin text-blue-600 dark:text-blue-400', sizes[size], className)} />;
};

export const LoadingState: React.FC<{ message?: string; className?: string }> = ({
  message = 'Loading...',
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center p-8 text-center space-y-3', className)}>
    <Spinner size="lg" />
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{message}</p>
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
  <div className={cn('flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30', className)}>
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 mb-4">
      {icon || <Inbox className="h-6 w-6" />}
    </div>
    <h4 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h4>
    {description && (
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
    )}
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
  <div className={cn('flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20', className)}>
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400 mb-4">
      <AlertCircle className="h-6 w-6" />
    </div>
    <h4 className="text-base font-semibold text-rose-900 dark:text-rose-200">{title}</h4>
    <p className="mt-1.5 max-w-md text-sm text-rose-700 dark:text-rose-400">{message}</p>
    {onRetry && (
      <div className="mt-5">
        <Button onClick={onRetry} variant="danger" size="sm">
          Try Again
        </Button>
      </div>
    )}
  </div>
);
