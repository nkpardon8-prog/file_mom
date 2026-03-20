import { useState } from 'react';
import { Eye, Cpu, Loader2, AlertTriangle, Info, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useEnrichStatus, useEnrichBatch, useEmbed } from '../hooks/useApi';
import { StatsCard, StatsCardSkeleton } from '../components/StatsCard';
import { formatNumber, formatDuration, formatCost } from '../lib/utils';
import type { EnrichmentResult, EmbeddingResult } from '../lib/api';

function FeatureDisabledBanner({ feature, configKey }: { feature: string; configKey: string }) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
      <div className="flex items-start gap-3">
        <Settings className="mt-0.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{feature} is not enabled</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set <code className="rounded bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{configKey}: true</code> in your FileMom config to enable this feature.
          </p>
        </div>
      </div>
    </div>
  );
}

function EnrichResultsPanel({ result }: { result: EnrichmentResult }) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enrichment Results</h3>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div><p className="text-2xl font-bold text-green-600">{result.enriched}</p><p className="text-xs text-gray-500 dark:text-gray-400">Enriched</p></div>
        <div><p className="text-2xl font-bold text-gray-400 dark:text-gray-500">{result.skipped}</p><p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p></div>
        <div><p className="text-2xl font-bold text-red-500">{result.errors.length}</p><p className="text-xs text-gray-500 dark:text-gray-400">Errors</p></div>
        <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCost(result.cost)}</p><p className="text-xs text-gray-500 dark:text-gray-400">API Cost</p></div>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">Completed in {formatDuration(result.durationMs)}</p>
      {result.errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded border border-red-100 bg-red-50 p-3">
          <p className="text-xs font-medium text-red-700">Errors:</p>
          {result.errors.slice(0, 10).map((err, i) => (
            <p key={i} className="mt-1 truncate font-mono text-xs text-red-600">{err.path}: {err.error}</p>
          ))}
          {result.errors.length > 10 && <p className="mt-1 text-xs text-red-500">...and {result.errors.length - 10} more</p>}
        </div>
      )}
    </div>
  );
}

function EmbedResultsPanel({ result }: { result: EmbeddingResult }) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Embedding Results</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div><p className="text-2xl font-bold text-green-600">{result.embedded}</p><p className="text-xs text-gray-500 dark:text-gray-400">Embedded</p></div>
        <div><p className="text-2xl font-bold text-gray-400 dark:text-gray-500">{result.skipped}</p><p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p></div>
        <div><p className="text-2xl font-bold text-red-500">{result.errors.length}</p><p className="text-xs text-gray-500 dark:text-gray-400">Errors</p></div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">Completed in {formatDuration(result.durationMs)}</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Free — no API cost</span>
      </div>
    </div>
  );
}

export function Enrich() {
  const { data: status, isLoading } = useEnrichStatus();
  const enrichBatch = useEnrichBatch();
  const embed = useEmbed();
  const [limit, setLimit] = useState(50);
  const [enrichResult, setEnrichResult] = useState<EnrichmentResult | null>(null);
  const [embedResult, setEmbedResult] = useState<EmbeddingResult | null>(null);

  function handleEnrichBatch() {
    setEnrichResult(null);
    enrichBatch.mutate({ limit }, {
      onSuccess: (result) => {
        setEnrichResult(result);
        if (result.enriched > 0) {
          toast.success(`Enriched ${formatNumber(result.enriched)} images. Cost: ${formatCost(result.cost)}.`);
        }
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Unknown error');
      },
    });
  }

  function handleEmbed() {
    setEmbedResult(null);
    embed.mutate(undefined, {
      onSuccess: (result) => {
        setEmbedResult(result);
        if (result.embedded > 0) {
          toast.success(`Embedded ${formatNumber(result.embedded)} files in ${formatDuration(result.durationMs)}.`);
        }
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Unknown error');
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Enrich & Embed</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enhance your files with AI vision analysis and semantic embeddings</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {isLoading ? <><StatsCardSkeleton /><StatsCardSkeleton /></> : status ? (
          <>
            <StatsCard title="Images Need Enrichment" value={formatNumber(status.unenrichedCount)} icon={Eye}
              subtitle={status.enableVisionEnrichment ? undefined : 'Feature disabled'} />
            <StatsCard title="Files Need Embeddings" value={formatNumber(status.unembeddedCount)} icon={Cpu}
              subtitle={status.enableEmbeddings ? undefined : 'Feature disabled'} />
          </>
        ) : null}
      </div>

      {/* Vision Enrichment */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-50 p-2"><Eye className="h-5 w-5 text-purple-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Vision Enrichment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">AI-powered image analysis using Qwen VL</p>
          </div>
        </div>

        {status && !status.enableVisionEnrichment ? (
          <FeatureDisabledBanner feature="Vision Enrichment" configKey="enableVisionEnrichment" />
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch size:</label>
              <input type="range" min={1} max={200} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-48" />
              <span className="w-12 text-right text-sm font-medium text-gray-900 dark:text-gray-100">{limit}</span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-700">Vision enrichment uses the OpenRouter API and incurs costs.</p>
            </div>
            <button onClick={handleEnrichBatch} disabled={enrichBatch.isPending || (status?.unenrichedCount ?? 0) === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">
              {enrichBatch.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enriching...</> : <><Eye className="h-4 w-4" /> Enrich Batch</>}
            </button>
            {enrichResult && <EnrichResultsPanel result={enrichResult} />}
          </div>
        )}
      </section>

      {/* Embeddings */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2"><Cpu className="h-5 w-5 text-emerald-600" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Embeddings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Semantic search powered by local Transformers.js</p>
          </div>
        </div>

        {status && !status.enableEmbeddings ? (
          <FeatureDisabledBanner feature="Embeddings" configKey="enableEmbeddings" />
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-700">Runs locally using Transformers.js — no API cost.</p>
            </div>
            <button onClick={handleEmbed} disabled={embed.isPending || (status?.unembeddedCount ?? 0) === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {embed.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Cpu className="h-4 w-4" /> Generate Embeddings</>}
            </button>
            {embedResult && <EmbedResultsPanel result={embedResult} />}
          </div>
        )}
      </section>
    </div>
  );
}
