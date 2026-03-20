import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
}

export function StatsCard({ title, value, subtitle, icon: Icon }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/30">
          <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-7 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
