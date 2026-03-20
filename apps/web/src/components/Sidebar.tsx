import { NavLink } from 'react-router';
import { LayoutDashboard, Search, Sparkles, Eye, Undo2, Settings as SettingsIcon, FolderHeart, FolderOpen, Loader2, Sun, Moon, Monitor } from 'lucide-react';
import { useHealth, useWatcherStatus, useWatcherStart, useWatcherStop } from '../hooks/useApi';
import { useTheme } from '../hooks/useTheme';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/browser', icon: FolderOpen, label: 'Browser' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/plan', icon: Sparkles, label: 'Organize' },
  { to: '/enrich', icon: Eye, label: 'Enrich' },
  { to: '/undo', icon: Undo2, label: 'Undo History' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { data: health, isError } = useHealth();
  const isConnected = !!health && !isError;
  const { data: watcherStatus } = useWatcherStatus();
  const startWatcher = useWatcherStart();
  const stopWatcher = useWatcherStop();
  const { theme, toggle: toggleTheme } = useTheme();

  const isWatching = watcherStatus?.watching ?? false;
  const toggling = startWatcher.isPending || stopWatcher.isPending;

  function handleToggle() {
    if (isWatching) stopWatcher.mutate();
    else startWatcher.mutate();
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-5 dark:border-gray-700">
        <FolderHeart className="h-7 w-7 text-indigo-600" />
        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">FileMom</span>
      </div>

      <nav className="flex-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        {/* Theme toggle */}
        <button onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ThemeIcon className="h-4 w-4" />
          <span className="capitalize">{theme}</span>
        </button>

        {/* Watcher toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {isWatching ? (
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            )}
            <span className={isWatching ? 'font-medium text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
              {isWatching ? 'Watching' : 'Watcher off'}
            </span>
          </div>
          <button onClick={handleToggle} disabled={toggling}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              isWatching ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400'
            } disabled:opacity-50`}
          >
            {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : isWatching ? 'Stop' : 'Start'}
          </button>
        </div>

        {/* API status */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={isConnected ? 'text-gray-600 dark:text-gray-400' : 'text-red-600 dark:text-red-400'}>
            {isConnected ? `API v${health.version}` : 'API Disconnected'}
          </span>
        </div>
      </div>
    </aside>
  );
}
