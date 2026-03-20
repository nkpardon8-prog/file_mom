import { useEffect, useRef } from 'react';
import { Move, Copy, Pencil, Trash2, Eye, ExternalLink, Sparkles } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  onClose: () => void;
  onMove: (path: string) => void;
  onCopy: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onViewDetails: (path: string) => void;
  onRedescribe: (path: string) => void;
}

export function ContextMenu({ x, y, filePath, onClose, onMove, onCopy, onRename, onDelete, onViewDetails, onRedescribe }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const items = [
    { icon: Move, label: 'Move to...', action: () => onMove(filePath) },
    { icon: Copy, label: 'Copy to...', action: () => onCopy(filePath) },
    { icon: Pencil, label: 'Rename', action: () => onRename(filePath) },
    { icon: Trash2, label: 'Delete', action: () => onDelete(filePath), danger: true },
    null, // separator
    { icon: Sparkles, label: 'Re-describe with AI', action: () => onRedescribe(filePath) },
    { icon: Eye, label: 'View Details', action: () => onViewDetails(filePath) },
    { icon: ExternalLink, label: 'Open in Finder', action: () => { /* noop in web */ onClose(); } },
  ];

  // Clamp position to keep menu within viewport
  const menuWidth = 192; // w-48
  const menuHeight = 260; // approximate height for 7 items + separators
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      style={{ top: Math.max(8, clampedY), left: Math.max(8, clampedX) }}
      className="fixed z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={`sep-${i}`} className="my-1 border-t border-gray-100 dark:border-gray-700" />
        ) : (
          <button
            key={item.label}
            onClick={() => { item.action(); onClose(); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              item.danger
                ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
