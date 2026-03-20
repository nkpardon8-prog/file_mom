import { Files, HardDrive, Clock, FileType2, FolderOpen, Sparkles, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { useStats, useWatcherStatus, useDescribeStatus, useDescribeBatch, useDescribeCost } from '../hooks/useApi';
import { useWatchEvents } from '../hooks/useWatchEvents';
import { StatsCard, StatsCardSkeleton } from '../components/StatsCard';
import { ScanButton } from '../components/ScanButton';
import { ActivityFeed } from '../components/ActivityFeed';
import { formatSize, formatRelativeTime, formatNumber, formatDuration, formatCost } from '../lib/utils';
import { Download } from 'lucide-react';
import type { ScanResult } from '../lib/api';
import { exportDescriptions } from '../lib/api';

export function Dashboard() {
  const { data: stats, isLoading, isError, error } = useStats();
  const { data: watcherStatus } = useWatcherStatus();
  const { events, clearEvents } = useWatchEvents(watcherStatus?.watching ?? false);
  const { data: describeStatus } = useDescribeStatus();
  const describeBatch = useDescribeBatch();
  const { data: describeCost } = useDescribeCost();

  const handleScanComplete = (result: ScanResult) => {
    toast.success(`Scan complete — ${formatNumber(result.totalFiles)} files: ${result.newFiles} new, ${result.updatedFiles} updated, ${result.deletedFiles} deleted in ${formatDuration(result.durationMs)}`);
  };

  const handleScanError = (err: Error) => {
    toast.error(`Scan failed — ${err.message}`);
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
          <Files className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Cannot connect to API</h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          Make sure the FileMom API is running on localhost:4000.
          <br />
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  const extensionCount = stats ? Object.keys(stats.byExtension).length : 0;
  const sortedExtensions = stats
    ? Object.entries(stats.byExtension).sort((a, b) => b[1] - a[1])
    : [];
  const maxExtCount = sortedExtensions.length > 0 ? sortedExtensions[0][1] : 1;
  const isEmpty = stats && stats.totalFiles === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Overview of your indexed files</p>
        </div>
        <div className="flex gap-3">
          {describeStatus?.enableAIDescriptions && describeStatus.undescribedCount > 0 && (
            <button
              onClick={() => {
                describeBatch.mutate(undefined, {
                  onSuccess: (result) => {
                    toast.success(`Described ${result.described} files in ${formatDuration(result.durationMs)} (${formatCost(result.cost)})`);
                  },
                  onError: (err) => {
                    toast.error(`Describe failed — ${err.message}`);
                  },
                });
              }}
              disabled={describeBatch.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 dark:bg-purple-500 dark:hover:bg-purple-600"
            >
              <Sparkles className="h-4 w-4" />
              {describeBatch.isPending ? 'Describing...' : `Describe All (${describeStatus.undescribedCount})`}
            </button>
          )}
          <ScanButton fullRescan onScanComplete={handleScanComplete} onScanError={handleScanError} />
          <ScanButton onScanComplete={handleScanComplete} onScanError={handleScanError} />
        </div>
      </div>

      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 text-center dark:border-gray-600">
          <FolderOpen className="h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No files indexed yet</h2>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Click "Scan Now" above to index your watched folders.
            Add folders with the CLI: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">filemom add ~/Documents</code>
          </p>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${describeStatus?.enableAIDescriptions ? (describeCost && describeCost.cost > 0 ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-5') : 'lg:grid-cols-4'}`}>
        {isLoading ? (
          <><StatsCardSkeleton /><StatsCardSkeleton /><StatsCardSkeleton /><StatsCardSkeleton /></>
        ) : stats ? (
          <>
            <StatsCard title="Total Files" value={formatNumber(stats.totalFiles)} icon={Files} />
            <StatsCard title="Total Size" value={formatSize(stats.totalSize)} icon={HardDrive} />
            <StatsCard title="Last Scan" value={formatRelativeTime(stats.lastScanAt)} icon={Clock} />
            <StatsCard title="File Types" value={String(extensionCount)} subtitle={extensionCount === 1 ? 'extension' : 'extensions'} icon={FileType2} />
            {describeStatus?.enableAIDescriptions && (
              <StatsCard
                title="AI Described"
                value={`${formatNumber(stats.totalFiles - (describeStatus?.undescribedCount ?? 0))}/${formatNumber(stats.totalFiles)}`}
                subtitle="files"
                icon={Sparkles}
              />
            )}
            {describeStatus?.enableAIDescriptions && describeCost && describeCost.cost > 0 && (
              <StatsCard title="AI Cost" value={formatCost(describeCost.cost)} icon={DollarSign} />
            )}
          </>
        ) : null}
      </div>

      {describeStatus?.enableAIDescriptions && stats && stats.totalFiles > 0 && stats.totalFiles > (describeStatus?.undescribedCount ?? 0) && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              try {
                const data = await exportDescriptions();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'filemom-descriptions.json'; a.click();
                URL.revokeObjectURL(url);
                toast.success(`Exported ${data.length} descriptions`);
              } catch (err) {
                toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export Descriptions (JSON)
          </button>
        </div>
      )}

      {stats && !isEmpty && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">File Types</h2>
            <div className="mt-4 space-y-3">
              {sortedExtensions.slice(0, 10).map(([ext, count]) => (
                <div key={ext} className="flex items-center gap-3">
                  <span className="w-16 text-right text-sm font-medium text-gray-600 dark:text-gray-400">.{ext || '(none)'}</span>
                  <div className="flex-1">
                    <div className="h-5 rounded-full bg-gray-100 dark:bg-gray-700">
                      <div className="h-5 rounded-full bg-indigo-500" style={{ width: `${(count / maxExtCount) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-12 text-right text-sm text-gray-500 dark:text-gray-400">{formatNumber(count)}</span>
                </div>
              ))}
              {sortedExtensions.length > 10 && (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500">+{sortedExtensions.length - 10} more types</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Watched Folders</h2>
            <div className="mt-4 space-y-3">
              {stats.watchedFolders.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No folders configured. Use the CLI to add folders.</p>
              ) : (
                stats.watchedFolders.map((folder) => (
                  <div key={folder.path} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={folder.path}>{folder.path}</p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatNumber(folder.fileCount)} files</span>
                      <span>Scanned {formatRelativeTime(folder.lastScanAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(watcherStatus?.watching || events.length > 0) && (
        <ActivityFeed events={events} onClear={clearEvents} />
      )}
    </div>
  );
}
