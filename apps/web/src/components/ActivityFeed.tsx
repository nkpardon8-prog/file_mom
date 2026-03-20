import { FilePlus, FileEdit, FileX, AlertCircle, Trash2 } from 'lucide-react';
import type { WatchEvent } from '../hooks/useWatchEvents';

function eventIcon(type: string) {
  switch (type) {
    case 'file:created': return <FilePlus className="h-4 w-4 text-green-500" />;
    case 'file:modified': return <FileEdit className="h-4 w-4 text-yellow-500" />;
    case 'file:deleted': return <FileX className="h-4 w-4 text-red-500" />;
    case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <FileEdit className="h-4 w-4 text-gray-400" />;
  }
}

function eventColor(type: string) {
  switch (type) {
    case 'file:created': return 'text-green-700 dark:text-green-400';
    case 'file:modified': return 'text-yellow-700 dark:text-yellow-400';
    case 'file:deleted': return 'text-red-700 dark:text-red-400';
    case 'error': return 'text-red-700 dark:text-red-400';
    default: return 'text-gray-700 dark:text-gray-300';
  }
}

function eventLabel(type: string) {
  switch (type) {
    case 'file:created': return '+';
    case 'file:modified': return '~';
    case 'file:deleted': return '-';
    case 'error': return '!';
    default: return '?';
  }
}

interface ActivityFeedProps {
  events: WatchEvent[];
  onClear: () => void;
}

export function ActivityFeed({ events, onClear }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Activity Feed</h2>
        <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">Waiting for file changes...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Activity Feed</h2>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">{events.length}</span>
        </div>
        <button onClick={onClear} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600">
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {events.map((event) => (
          <div key={event.id} className="flex items-center gap-3 border-b border-gray-50 px-6 py-2 last:border-b-0 dark:border-gray-800">
            {eventIcon(event.type)}
            <span className={`text-xs font-mono font-bold ${eventColor(event.type)}`}>{eventLabel(event.type)}</span>
            <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300" title={event.path ?? event.error}>
              {event.type === 'error' ? event.error : event.path}
            </span>
            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
