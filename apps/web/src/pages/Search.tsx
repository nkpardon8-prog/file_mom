import { useState, useMemo } from 'react';
import { Search as SearchIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearch, useStats, useSettings } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { FileDetail } from '../components/FileDetail';
import { formatSize, formatRelativeTime } from '../lib/utils';
import type { SearchResult } from '../lib/api';

type SortField = 'score' | 'name' | 'size' | 'mtime';

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

export function Search() {
  const [query, setQuery] = useState('');
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(20);
  const [semantic, setSemantic] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const debouncedQuery = useDebounce(query, 300);

  const extParam = selectedExtensions.size > 0 ? Array.from(selectedExtensions).join(',') : undefined;
  const { data, isLoading, isError, error } = useSearch({
    q: debouncedQuery,
    limit,
    ext: extParam,
    semantic,
  });

  const { data: stats } = useStats();
  const { data: settings } = useSettings();

  const topExtensions = useMemo(() => {
    if (!stats?.byExtension) return [];
    return Object.entries(stats.byExtension)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ext]) => ext);
  }, [stats]);

  const sortedResults = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'score': cmp = a.score - b.score; break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'size': cmp = a.size - b.size; break;
        case 'mtime': cmp = a.mtime - b.mtime; break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, sortField, sortDirection]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'score' ? 'desc' : 'asc');
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

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  const showInitial = debouncedQuery.length === 0;
  const showLoading = isLoading && debouncedQuery.length > 0;
  const showEmpty = !isLoading && data && data.length === 0 && debouncedQuery.length > 0;
  const showResults = !isLoading && data && data.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Search</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Search across your indexed files</p>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Extension chips */}
        <div className="flex flex-wrap gap-1.5">
          {topExtensions.map((ext) => (
            <button
              key={ext}
              onClick={() => toggleExtension(ext)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedExtensions.has(ext)
                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                  : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              .{ext}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Limit */}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value={10}>10 results</option>
            <option value={20}>20 results</option>
            <option value={50}>50 results</option>
            <option value={100}>100 results</option>
          </select>

          {/* Semantic toggle */}
          <div className="inline-flex rounded-lg border border-gray-300 text-sm">
            <button
              onClick={() => setSemantic(false)}
              className={`rounded-l-lg px-3 py-1.5 ${!semantic ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
            >
              Keyword
            </button>
            <button
              onClick={() => setSemantic(true)}
              disabled={!settings?.enableEmbeddings}
              title={!settings?.enableEmbeddings ? 'Embeddings not enabled' : undefined}
              className={`rounded-r-lg px-3 py-1.5 ${semantic ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Semantic
            </button>
          </div>
        </div>
      </div>

      {/* Initial state */}
      {showInitial && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchIcon className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">Enter a search query to find files</p>
        </div>
      )}

      {/* Loading */}
      {showLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="flex-1" />
                <div className="h-4 w-16 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && debouncedQuery.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Search failed: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Empty */}
      {showEmpty && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchIcon className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">
            No results found for "<span className="font-medium text-gray-700">{debouncedQuery}</span>". Try different search terms.
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Path</th>
                <SortHeader field="size" label="Size" />
                <SortHeader field="mtime" label="Modified" />
                <SortHeader field="score" label="Score" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedResults.map((result) => (
                <tr
                  key={result.id}
                  onClick={() => setSelectedFilePath(result.path)}
                  className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${extensionColor(result.extension)}`} />
                      <span className="text-sm font-medium text-gray-900">{result.name}</span>
                    </div>
                    {result.snippet && (
                      <p className="mt-0.5 truncate pl-[18px] text-xs text-gray-400" title={result.snippet}>
                        {result.snippet.slice(0, 120)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500" title={result.path}>
                    {truncatePath(result.path)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{formatSize(result.size)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatRelativeTime(new Date(result.mtime).toISOString())}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                    {result.score.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
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
