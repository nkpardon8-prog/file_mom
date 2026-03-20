import { useState } from 'react';
import { NavLink } from 'react-router';
import {
  Sparkles, Loader2, ArrowRightLeft, Pencil, FolderPlus, Copy,
  AlertTriangle, CheckCircle2, XCircle, MinusCircle, Undo2, Plus,
  MessageSquare, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useGeneratePlan, useRefinePlan, useExecutePlan } from '../hooks/useApi';
import { StatsCard } from '../components/StatsCard';
import { formatSize, formatNumber, formatCost } from '../lib/utils';
import type { ActionPlan, ActionType, QueryExpansion, ExecutionResult } from '../lib/api';

type PageState = 'idle' | 'generating' | 'reviewing' | 'refining' | 'confirming' | 'executing' | 'completed';

function actionIcon(type: ActionType) {
  switch (type) {
    case 'move_file': return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
    case 'rename_file': return <Pencil className="h-4 w-4 text-purple-500" />;
    case 'create_folder': return <FolderPlus className="h-4 w-4 text-green-500" />;
    case 'copy_file': return <Copy className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
  }
}

function actionLabel(type: ActionType) {
  switch (type) {
    case 'move_file': return 'Move';
    case 'rename_file': return 'Rename';
    case 'create_folder': return 'Create';
    case 'copy_file': return 'Copy';
  }
}

function truncPath(p: string, max = 50) {
  return p.length <= max ? p : '\u2026' + p.slice(-(max - 1));
}

export function Plan() {
  const [pageState, setPageState] = useState<PageState>('idle');
  const [command, setCommand] = useState('');
  const [previewOnly, setPreviewOnly] = useState(false);
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [expansion, setExpansion] = useState<QueryExpansion | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [feedbackHistory, setFeedbackHistory] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [showExpansion, setShowExpansion] = useState(false);

  const genMutation = useGeneratePlan();
  const refineMutation = useRefinePlan();
  const execMutation = useExecutePlan();

  function handleGenerate() {
    setPageState('generating');
    genMutation.mutate({ command: command.trim(), previewOnly }, {
      onSuccess: (data) => {
        setPlan(data.plan);
        setExpansion(data.expansion);
        setTotalCost(data.cost);
        setFeedbackHistory([]);
        setPageState('reviewing');
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Unknown error');
        setPageState('idle');
      },
    });
  }

  function handleRefine() {
    if (!plan) return;
    setPageState('refining');
    const history = [...feedbackHistory, feedback.trim()];
    refineMutation.mutate({ plan, feedback: feedback.trim(), history }, {
      onSuccess: (data) => {
        setPlan(data.plan);
        setTotalCost((c) => c + data.cost);
        setFeedbackHistory(history);
        setFeedback('');
        setPageState('reviewing');
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Unknown error');
        setPageState('reviewing');
      },
    });
  }

  function handleExecute() {
    if (!plan) return;
    setPageState('executing');
    execMutation.mutate({ plan, dryRun }, {
      onSuccess: (result) => {
        setExecutionResult(result);
        setPageState('completed');
        if (!result.success) {
          toast.error(`${result.summary.failed} action(s) failed.`);
        }
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Unknown error');
        setPageState('reviewing');
      },
    });
  }

  function handleNewPlan() {
    setPageState('idle');
    setCommand('');
    setPlan(null);
    setExpansion(null);
    setTotalCost(0);
    setFeedbackHistory([]);
    setFeedback('');
    setExecutionResult(null);
    setDryRun(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Organize Files</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Describe what you want done — the AI will generate a plan</p>
      </div>

      {/* Command Input */}
      {(pageState === 'idle' || pageState === 'generating') && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
          <label htmlFor="command" className="block text-sm font-medium text-gray-700 dark:text-gray-300">What would you like to organize?</label>
          <textarea
            id="command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={pageState === 'generating'}
            placeholder='e.g. "Sort my photos by date", "Put all tax documents in one folder"...'
            className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:text-gray-500 dark:disabled:text-gray-400"
            rows={3}
          />
          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={previewOnly} onChange={(e) => setPreviewOnly(e.target.checked)} disabled={pageState === 'generating'} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600" />
              Preview only (no AI cost)
            </label>
            <button onClick={handleGenerate} disabled={pageState === 'generating' || !command.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {pageState === 'generating' ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4" /> Generate Plan</>}
            </button>
          </div>
        </div>
      )}

      {/* Plan Review */}
      {plan && (pageState === 'reviewing' || pageState === 'refining') && (
        <div className="space-y-6">
          {/* Intent + Summary */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.intent}</h2>
            <div className="mt-3 flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <span>{formatNumber(plan.summary.filesAffected)} files affected</span>
              <span>{plan.summary.foldersCreated} folders to create</span>
              <span>{formatSize(plan.summary.totalSizeBytes)} total</span>
              <span className={totalCost > 1 ? 'font-bold text-red-600' : ''}>{formatCost(totalCost)} AI cost{totalCost > 1 ? ' ⚠' : ''}</span>
            </div>
          </div>

          {/* Query Expansion */}
          {expansion && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3">
              <button onClick={() => setShowExpansion(!showExpansion)} className="flex w-full items-center justify-between text-left">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400"><Info className="h-4 w-4" /> Query Expansion</div>
                {showExpansion ? <ChevronUp className="h-4 w-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
              </button>
              {showExpansion && (
                <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <p><span className="font-medium">Keywords:</span> {expansion.keywords.join(', ')}</p>
                  {expansion.folderPatterns.length > 0 && <p><span className="font-medium">Folders:</span> {expansion.folderPatterns.join(', ')}</p>}
                  {expansion.extensions.length > 0 && <p><span className="font-medium">Types:</span> {expansion.extensions.join(', ')}</p>}
                  <p><span className="font-medium">Reasoning:</span> {expansion.reasoning}</p>
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {plan.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div>
                <p className="text-sm font-medium text-amber-800">Warnings</p>
                <ul className="mt-1 list-disc pl-4 text-sm text-amber-700">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div></div>
            </div>
          )}

          {/* Actions Table */}
          {plan.actions.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Destination</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400 w-28">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {plan.actions.map((a) => {
                    const needsReview = plan.needsReview.includes(a.id);
                    const color = a.confidence >= 0.8 ? 'bg-green-500' : a.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <tr key={a.id} className={needsReview ? 'bg-amber-50' : ''}>
                        <td className="px-4 py-3"><div className="flex items-center gap-2">{actionIcon(a.type)}<span className="text-xs font-medium text-gray-600 dark:text-gray-400">{actionLabel(a.type)}</span></div></td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300" title={a.source}>{truncPath(a.source)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300" title={a.destination}>{truncPath(a.destination)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 rounded-full bg-gray-200 dark:bg-gray-700"><div className={`h-2 rounded-full ${color}`} style={{ width: `${a.confidence * 100}%` }} /></div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{(a.confidence * 100).toFixed(0)}%</span>
                          </div>
                          {needsReview && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Review</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-[200px]">{a.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{plan.actions.length} action{plan.actions.length !== 1 ? 's' : ''}</div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No actions in this plan (preview mode)</div>
          )}

          {/* Refine */}
          {feedbackHistory.length < 3 && (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Feedback <span className="text-gray-400 dark:text-gray-500">(Round {feedbackHistory.length + 1}/3)</span></label>
                <input type="text" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. Don't move the PDFs, use year-based folders..."
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button onClick={handleRefine} disabled={!feedback.trim() || pageState === 'refining'}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                {pageState === 'refining' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Refine
              </button>
            </div>
          )}
          {feedbackHistory.length >= 3 && <p className="text-sm text-gray-500 dark:text-gray-400">Maximum refinement rounds reached (3/3).</p>}

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <button onClick={handleNewPlan} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            {plan.actions.length > 0 && (
              <button onClick={() => setPageState('confirming')} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">Approve & Execute</button>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {pageState === 'confirming' && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPageState('reviewing')} />
          <div className="relative w-[480px] rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirm Execution</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">This will execute {plan.actions.length} actions affecting {plan.summary.filesAffected} files.</p>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 text-indigo-600" />
              Dry run (validate without moving files)
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setPageState('reviewing')} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Back</button>
              <button onClick={handleExecute} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">{dryRun ? 'Validate' : 'Execute'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Executing */}
      {pageState === 'executing' && (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{dryRun ? 'Validating plan...' : 'Executing plan...'}</p>
        </div>
      )}

      {/* Completed */}
      {pageState === 'completed' && executionResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatsCard title="Succeeded" value={String(executionResult.summary.succeeded)} icon={CheckCircle2} />
            <StatsCard title="Failed" value={String(executionResult.summary.failed)} icon={XCircle} />
            <StatsCard title="Skipped" value={String(executionResult.summary.skipped)} icon={MinusCircle} />
          </div>

          {executionResult.results.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400 w-16">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {executionResult.results.map((r) => {
                    const action = plan?.actions.find((a) => a.id === r.actionId);
                    return (
                      <tr key={r.actionId}>
                        <td className="px-4 py-3">{r.success ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{action ? `${actionLabel(action.type)}: ${truncPath(action.source, 40)}` : r.actionId}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{r.error ?? (action ? `→ ${truncPath(action.destination, 40)}` : 'OK')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {executionResult.success && !dryRun && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <Undo2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">Undo available for 30 minutes</p>
                  <p className="mt-0.5 font-mono text-xs text-green-600">Batch: {executionResult.batchId}</p>
                </div>
                <NavLink to="/undo" className="ml-auto rounded-lg border border-green-300 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50">Undo History</NavLink>
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <button onClick={handleNewPlan} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              <Plus className="h-4 w-4" /> New Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
