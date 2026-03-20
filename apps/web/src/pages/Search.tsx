import { useState, useMemo } from 'react';
import { Search as SearchIcon, X, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { useBrowse, useFilterOptions, useStats, useSettings } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { FileDetail } from '../components/FileDetail';
import { formatSize, formatRelativeTime } from '../lib/utils';
import type { BrowseParams, BrowseResult } from '../lib/api';

type SortField = 'name' | 'size' | 'mtime' | 'score' | 'description';

function truncatePath(path: string, maxLen = 45): string {
  if (path.length <= maxLen) return path;
  return '\u2026' + path.slice(-(maxLen - 1));
}

function extensionColor(ext: string): string {
  const colors: Record<string, string> = {
    pdf: 'bg-red-400', doc: 'bg-blue-400', docx: 'bg-blue-400',
    txt: 'bg-gray-400', md: 'bg-gray-400',
    jpg: 'bg-amber-400', jpeg: 'bg-amber-400', png: 'bg-emerald-400',
    xls: 'bg-green-400', xlsx: 'bg-green-400', csv: 'bg-green-400',
    mp3: 'bg-purple-400', mp4: 'bg-purple-400', flac: 'bg-purple-400',
    zip: 'bg-yellow-400', gz: 'bg-yellow-400',
  };
  return colors[ext.toLowerCase()] ?? 'bg-indigo-400';
}

const categoryColors: Record<string, string> = {
  financial: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  work: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  personal: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  medical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  legal: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  education: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  creative: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
  communication: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  reference: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  media: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300',
};

export function Search() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [contentType, setContentType] = useState('');
  const [dateContext, setDateContext] = useState('');
  const [source, setSource] = useState('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(20);
  const [semantic, setSemantic] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('mtime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const debouncedQuery = useDebounce(query, 300);
  const { data: filterOpts } = useFilterOptions();
  const { data: stats } = useStats();
  const { data: settings } = useSettings();

  const browseParams: BrowseParams = useMemo(() => ({
    q: debouncedQuery || undefined,
    category: category || undefined,
    contentType: contentType || undefined,
    dateContext: dateContext || undefined,
    source: source || undefined,
    sensitive: sensitiveOnly || undefined,
    ext: selectedExtensions.size > 0 ? Array.from(selectedExtensions).join(',') : undefined,
    limit,
  }), [debouncedQuery, category, contentType, dateContext, source, sensitiveOnly, selectedExtensions, limit]);

  const { data, isLoading, isError, error } = useBrowse(browseParams);

  const topExtensions = useMemo(() => {
    if (!stats?.byExtension) return [];
    return Object.entries(stats.byExtension)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ext]) => ext);
  }, [stats]);

  const hasQuery = !!debouncedQuery;

  const sortedResults = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'score': cmp = (a.score ?? 0) - (b.score ?? 0); break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'size': cmp = a.size - b.size; break;
        case 'mtime': cmp = a.mtime - b.mtime; break;
        case 'description': cmp = (a.aiDescription ?? '').localeCompare(b.aiDescription ?? ''); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, sortField, sortDirection]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'score' ? 'desc' : field === 'mtime' ? 'desc' : 'asc');
    }
  }

  function toggleExtension(ext: string) {
    setSelectedExtensions((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  }

  const hasActiveFilters = category || contentType || dateContext || source || sensitiveOnly || selectedExtensions.size > 0;

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  function FilterSelect({ value, onChange, placeholder, options }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: Array<{ value: string; count: number }>;
  }) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.value} ({opt.count})
          </option>
        ))}
      </select>
    );
  }

  const showEmpty = !isLoading && data && data.length === 0 && (hasQuery || hasActiveFilters);
  const showResults = !isLoading && data && data.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Search & Browse</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse files by AI metadata or search with keywords</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {query.length > 0 && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        {filterOpts && (
          <>
            <FilterSelect value={category} onChange={setCategory} placeholder="All Categories" options={filterOpts.categories} />
            <FilterSelect value={contentType} onChange={setContentType} placeholder="All Types" options={filterOpts.contentTypes} />
            <FilterSelect value={dateContext} onChange={setDateContext} placeholder="All Dates" options={filterOpts.dateContexts} />
            <FilterSelect value={source} onChange={setSource} placeholder="All Sources" options={filterOpts.sources} />
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value={10}>10 results</option>
            <option value={20}>20 results</option>
            <option value={50}>50 results</option>
            <option value={100}>100 results</option>
          </select>
        </div>
      </div>

      {/* Extension chips + toggles */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {topExtensions.map((ext) => (
            <button
              key={ext}
              onClick={() => toggleExtension(ext)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedExtensions.has(ext)
                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              .{ext}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Sensitive toggle */}
          <button
            onClick={() => setSensitiveOnly(!sensitiveOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              sensitiveOnly
                ? 'border-red-300 bg-red-100 text-red-700 dark:border-red-600 dark:bg-red-900 dark:text-red-300'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            Sensitive
          </button>

          {/* Semantic toggle */}
          <div className="inline-flex rounded-lg border border-gray-300 text-sm dark:border-gray-600">
            <button
              onClick={() => setSemantic(false)}
              className={`rounded-l-lg px-3 py-1.5 ${!semantic ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              Keyword
            </button>
            <button
              onClick={() => setSemantic(true)}
              disabled={!settings?.enableEmbeddings}
              title={!settings?.enableEmbeddings ? 'Embeddings not enabled' : undefined}
              className={`rounded-r-lg px-3 py-1.5 ${semantic ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Semantic
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-4">
                <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1" />
                <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          Search failed: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Empty */}
      {showEmpty && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No files match the current filters. Try adjusting your criteria.
          </p>
        </div>
      )}

      {/* Results table */}
      {showResults && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <SortHeader field="name" label="Name" />
                <SortHeader field="description" label="Description" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Category</th>
                <SortHeader field="size" label="Size" />
                <SortHeader field="mtime" label="Modified" />
                {hasQuery && <SortHeader field="score" label="Score" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedResults.map((result: BrowseResult) => (
                <tr
                  key={result.id}
                  onClick={() => setSelectedFilePath(result.path)}
                  className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${extensionColor(result.extension)}`} />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.name}</span>
                    </div>
                    {result.snippet && (
                      <p className="mt-0.5 truncate pl-[18px] text-xs text-gray-400" title={result.snippet}>
                        {result.snippet.slice(0, 120)}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    {result.aiDescription ? (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={result.aiDescription}>
                        {result.aiDescription}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {result.aiCategory && (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[result.aiCategory] ?? 'bg-gray-100 text-gray-800'}`}>
                        {result.aiCategory}
                      </span>
                    )}
                    {result.aiConfidence != null && result.aiConfidence < 0.5 && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">unsure</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{formatSize(result.size)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatRelativeTime(new Date(result.mtime).toISOString())}
                  </td>
                  {hasQuery && (
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                      {result.score?.toFixed(2) ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </div>
        </div>
      )}

      {/* File detail panel */}
      {selectedFilePath && (
        <FileDetail path={selectedFilePath} onClose={() => setSelectedFilePath(null)} />
      )}
    </div>
  );
}
