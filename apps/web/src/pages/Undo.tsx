import { useState, useEffect } from 'react';
import { Undo2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUndoBatches, useUndoBatch } from '../hooks/useApi';
import { formatNumber, formatRelativeTime, formatCountdown } from '../lib/utils';

export function Undo() {
  const { data: batches, isLoading } = useUndoBatches();
  const undoMutation = useUndoBatch();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!batches || batches.length === 0) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [batches]);

  function handleUndo(batchId: string) {
    undoMutation.mutate(batchId, {
      onSuccess: (result) => {
        if (result.success) toast.success(`Undo complete — restored ${result.restored} action(s)`);
        else toast.error(`Undo partial — restored ${result.restored}, ${result.errors.length} error(s)`);
      },
      onError: (err) => toast.error(`Undo failed — ${err instanceof Error ? err.message : 'Unknown error'}`),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Undo History</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Reverse recent file operations within 30 minutes</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      )}

      {!isLoading && batches && batches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-24 text-center dark:border-gray-600">
          <Undo2 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">No undoable operations</h2>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">After executing an organization plan, undo will be available here for 30 minutes.</p>
        </div>
      )}

      {batches && batches.length > 0 && (
        <div className="space-y-4">
          {batches.map((batch) => {
            const expired = batch.expiresAt <= Date.now();
            return (
              <div key={batch.batchId} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{batch.intent}</h3>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatNumber(batch.actionCount)} actions</span>
                      <span>Executed {formatRelativeTime(new Date(batch.executedAt).toISOString())}</span>
                      <span className={expired ? 'text-red-500' : 'font-medium text-green-600 dark:text-green-400'}>
                        {expired ? 'Expired' : formatCountdown(batch.expiresAt) + ' left'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-400 dark:text-gray-500">{batch.batchId}</p>
                  </div>
                  <button onClick={() => handleUndo(batch.batchId)} disabled={expired || undoMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50">
                    {undoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Undo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
