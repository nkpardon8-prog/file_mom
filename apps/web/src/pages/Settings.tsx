import { useState, useEffect } from 'react';
import {
  Key, FolderOpen, Bot, ScanSearch, Eye, Cpu, SlidersHorizontal,
  Loader2, AlertTriangle, X, Plus, Trash2, Check, XCircle, ChevronDown, ChevronUp,
  Eye as EyeIcon, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSettings, useUpdateSettings, useAddFolder, useRemoveFolder, useTestApiKey, useStats } from '../hooks/useApi';
import { formatNumber } from '../lib/utils';

function SectionCard({ icon: Icon, iconBg, title, description, children }: {
  icon: React.ElementType; iconBg: string; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className={`rounded-lg p-2 ${iconBg}`}><Icon className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled || saving}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={`h-6 w-11 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
        <div className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: stats } = useStats();
  const updateMutation = useUpdateSettings();
  const addFolder = useAddFolder();
  const removeFolder = useRemoveFolder();
  const testKey = useTestApiKey();

  const [showRestart, setShowRestart] = useState(false);

  // Section states
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [excludePatterns, setExcludePatterns] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [followSymlinks, setFollowSymlinks] = useState(false);
  const [enableVision, setEnableVision] = useState(false);
  const [visionModel, setVisionModel] = useState('');
  const [visionBatchSize, setVisionBatchSize] = useState(50);
  const [enableEmbeddings, setEnableEmbeddings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState({
    maxFilesPerRequest: 500, requestTimeoutMs: 30000, retryAttempts: 3,
    retryDelayMs: 1000, maxConcurrentOps: 20, undoTTLMinutes: 30, maxRefinementRounds: 3,
  });

  // Initialize from settings data
  useEffect(() => {
    if (!settings) return;
    setModel(settings.model ?? 'anthropic/claude-sonnet-4');
    setExcludePatterns(settings.excludePatterns ?? []);
    setIncludeHidden(settings.includeHidden ?? false);
    setFollowSymlinks(settings.followSymlinks ?? false);
    setEnableVision(settings.enableVisionEnrichment ?? false);
    setVisionModel(settings.visionModel ?? 'qwen/qwen-2.5-vl-7b-instruct');
    setVisionBatchSize(settings.visionBatchSize ?? 50);
    setEnableEmbeddings(settings.enableEmbeddings ?? false);
    setAdvanced({
      maxFilesPerRequest: settings.maxFilesPerRequest ?? 500,
      requestTimeoutMs: settings.requestTimeoutMs ?? 30000,
      retryAttempts: settings.retryAttempts ?? 3,
      retryDelayMs: settings.retryDelayMs ?? 1000,
      maxConcurrentOps: settings.maxConcurrentOps ?? 20,
      undoTTLMinutes: settings.undoTTLMinutes ?? 30,
      maxRefinementRounds: settings.maxRefinementRounds ?? 3,
    });
  }, [settings]);

  const PRESET_MODELS = ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash'];
  const isCustomModel = !PRESET_MODELS.includes(model);

  function handleSave(updates: Record<string, unknown>) {
    updateMutation.mutate(updates as any, {
      onSuccess: () => { setShowRestart(true); toast.success('Settings saved. Restart the API server to apply changes.'); },
      onError: (err) => { toast.error(err instanceof Error ? err.message : 'Unknown error'); },
    });
  }

  if (isLoading) {
    return <div className="mx-auto max-w-4xl py-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure FileMom — changes require an API server restart</p>
      </div>

      {showRestart && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">Settings saved. Restart the API server to apply changes.</p>
            </div>
            <button onClick={() => setShowRestart(false)} className="text-amber-400 hover:text-amber-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* API Key */}
      <SectionCard icon={Key} iconBg="bg-yellow-50 text-yellow-600" title="API Key" description="OpenRouter API key for AI features">
        <div className="space-y-3">
          {settings?.hasApiKey && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Current: <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{settings.openRouterApiKey}</code></p>
          )}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..." className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                {showKey ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
            <SaveButton onClick={() => handleSave({ openRouterApiKey: apiKey })} disabled={!apiKey.trim()} saving={updateMutation.isPending} />
            <button onClick={() => testKey.mutate(apiKey || undefined)} disabled={testKey.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
              {testKey.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
            </button>
          </div>
          {testKey.data && (
            <p className={`text-sm ${testKey.data.valid ? 'text-green-600' : 'text-red-600'}`}>
              {testKey.data.valid ? '✓ API key is valid' : `✗ ${testKey.data.error ?? 'Invalid key'}`}
            </p>
          )}
        </div>
      </SectionCard>

      {/* Watched Folders */}
      <SectionCard icon={FolderOpen} iconBg="bg-blue-50 text-blue-600" title="Watched Folders" description="Directories to scan and index">
        <div className="space-y-3">
          {(settings?.watchedFolders ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No folders configured</p>
          ) : (
            <div className="space-y-2">
              {(settings?.watchedFolders ?? []).map((folder) => {
                const folderStats = stats?.watchedFolders?.find((f) => f.path === folder);
                return (
                  <div key={folder} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-2.5">
                    <div>
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{folder}</p>
                      {folderStats && <p className="text-xs text-gray-500 dark:text-gray-400">{formatNumber(folderStats.fileCount)} files</p>}
                    </div>
                    <button onClick={() => removeFolder.mutate(folder, {
                      onSuccess: () => setShowRestart(true),
                      onError: (err) => toast.error(err instanceof Error ? err.message : 'Error'),
                    })} disabled={removeFolder.isPending}
                      className="rounded p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="/path/to/folder"
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => {
              addFolder.mutate(newFolder.trim(), {
                onSuccess: () => { setNewFolder(''); setShowRestart(true); },
                onError: (err) => toast.error(err instanceof Error ? err.message : 'Error'),
              });
            }} disabled={!newFolder.trim() || addFolder.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {addFolder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </div>
        </div>
      </SectionCard>

      {/* AI Model */}
      <SectionCard icon={Bot} iconBg="bg-indigo-50 text-indigo-600" title="AI Model" description="Model used for plan generation">
        <div className="space-y-3">
          <select value={isCustomModel ? '__custom__' : model} onChange={(e) => {
            if (e.target.value === '__custom__') { setModel(customModel || ''); } else { setModel(e.target.value); }
          }} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm">
            {PRESET_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__custom__">Custom model...</option>
          </select>
          {isCustomModel && (
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="organization/model-name"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          )}
          <SaveButton onClick={() => handleSave({ model })} disabled={!model.trim() || model === settings?.model} saving={updateMutation.isPending} />
        </div>
      </SectionCard>

      {/* Scan Settings */}
      <SectionCard icon={ScanSearch} iconBg="bg-cyan-50 text-cyan-600" title="Scan Settings" description="File scanning behavior">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exclude Patterns</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {excludePatterns.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                  {p}
                  <button onClick={() => setExcludePatterns(excludePatterns.filter((x) => x !== p))} className="text-gray-400 dark:text-gray-500 hover:text-red-500"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder="**/*.log"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm" />
              <button onClick={() => { if (newPattern.trim() && !excludePatterns.includes(newPattern.trim())) { setExcludePatterns([...excludePatterns, newPattern.trim()]); setNewPattern(''); }}}
                disabled={!newPattern.trim()} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Add</button>
            </div>
          </div>
          <Toggle checked={includeHidden} onChange={setIncludeHidden} label="Include hidden files" />
          <Toggle checked={followSymlinks} onChange={setFollowSymlinks} label="Follow symlinks" />
          <SaveButton onClick={() => handleSave({ excludePatterns, includeHidden, followSymlinks })} disabled={false} saving={updateMutation.isPending} />
        </div>
      </SectionCard>

      {/* Vision */}
      <SectionCard icon={Eye} iconBg="bg-purple-50 text-purple-600" title="Vision Enrichment" description="AI image analysis with Qwen VL">
        <div className="space-y-4">
          <Toggle checked={enableVision} onChange={setEnableVision} label="Enable vision enrichment" />
          {enableVision && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vision Model</label>
                <input type="text" value={visionModel} onChange={(e) => setVisionModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch size:</label>
                <input type="range" min={1} max={200} value={visionBatchSize} onChange={(e) => setVisionBatchSize(Number(e.target.value))} className="w-48" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{visionBatchSize}</span>
              </div>
            </>
          )}
          <SaveButton onClick={() => handleSave({ enableVisionEnrichment: enableVision, visionModel, visionBatchSize })} disabled={false} saving={updateMutation.isPending} />
        </div>
      </SectionCard>

      {/* Embeddings */}
      <SectionCard icon={Cpu} iconBg="bg-emerald-50 text-emerald-600" title="Embeddings" description="Semantic search with local Transformers.js">
        <div className="space-y-3">
          <Toggle checked={enableEmbeddings} onChange={setEnableEmbeddings} label="Enable embeddings" />
          <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <span>Model: <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{settings?.embeddingModel ?? 'all-MiniLM-L6-v2'}</code></span>
            <span>Dimensions: <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs">{settings?.embeddingDimensions ?? 384}</code></span>
          </div>
          <SaveButton onClick={() => handleSave({ enableEmbeddings })} disabled={enableEmbeddings === (settings?.enableEmbeddings ?? false)} saving={updateMutation.isPending} />
        </div>
      </SectionCard>

      {/* Advanced */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between p-6 text-left">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 dark:bg-gray-700 p-2"><SlidersHorizontal className="h-5 w-5 text-gray-600 dark:text-gray-400" /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Advanced</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Timeouts, retries, concurrency</p>
            </div>
          </div>
          {showAdvanced ? <ChevronUp className="h-5 w-5 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-400 dark:text-gray-500" />}
        </button>
        {showAdvanced && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-6 pb-6 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {([
                ['maxFilesPerRequest', 'Max files per request', 10, 1000],
                ['requestTimeoutMs', 'Request timeout (ms)', 5000, 120000],
                ['retryAttempts', 'Retry attempts', 0, 10],
                ['retryDelayMs', 'Retry delay (ms)', 100, 10000],
                ['maxConcurrentOps', 'Max concurrent ops', 1, 50],
                ['undoTTLMinutes', 'Undo TTL (minutes)', 5, 1440],
                ['maxRefinementRounds', 'Max refinement rounds', 1, 10],
              ] as const).map(([key, label, min, max]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="number" min={min} max={max} value={advanced[key as keyof typeof advanced]}
                    onChange={(e) => setAdvanced({ ...advanced, [key]: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm" />
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{min}–{max}</p>
                </div>
              ))}
            </div>
            <SaveButton onClick={() => handleSave(advanced)} disabled={false} saving={updateMutation.isPending} />
          </div>
        )}
      </section>
    </div>
  );
}
