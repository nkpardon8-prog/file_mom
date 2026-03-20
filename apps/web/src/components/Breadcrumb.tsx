import { Home, ChevronRight } from 'lucide-react';

interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  if (!path) {
    return (
      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <Home className="h-4 w-4" />
        <span className="font-medium text-gray-900 dark:text-gray-100">All Files</span>
      </div>
    );
  }

  const segments = path.split('/').filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      <button onClick={() => onNavigate('')} className="hover:text-indigo-600 dark:hover:text-indigo-400">
        <Home className="h-4 w-4" />
      </button>
      {segments.map((segment, i) => {
        const segmentPath = '/' + segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;
        return (
          <span key={segmentPath} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="font-medium text-gray-900 dark:text-gray-100">{segment}</span>
            ) : (
              <button onClick={() => onNavigate(segmentPath)} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
