import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useScan } from '../hooks/useApi';
import type { ScanResult } from '../lib/api';

interface ScanButtonProps {
  fullRescan?: boolean;
  onScanComplete?: (result: ScanResult) => void;
  onScanError?: (error: Error) => void;
}

export function ScanButton({ fullRescan, onScanComplete, onScanError }: ScanButtonProps) {
  const scan = useScan();

  const handleClick = () => {
    scan.mutate(fullRescan ? { fullRescan: true } : undefined, {
      onSuccess: (result) => onScanComplete?.(result),
      onError: (error) => onScanError?.(error instanceof Error ? error : new Error(String(error))),
    });
  };

  const Icon = fullRescan ? RotateCcw : RefreshCw;
  const label = fullRescan ? 'Full Rescan' : 'Scan Now';

  return (
    <button
      onClick={handleClick}
      disabled={scan.isPending}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        fullRescan
          ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
      }`}
    >
      {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {scan.isPending ? 'Scanning...' : label}
    </button>
  );
}
