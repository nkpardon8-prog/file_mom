import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search as SearchIcon, X, ChevronDown, ChevronUp, Shield, FolderPlus, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useBrowse, useFilterOptions, useFolders, useStats, useSettings, useMoveFile, useCopyFile, useRenameFile, useDeleteFile, useDescribeFile } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { FolderTree } from '../components/FolderTree';
import { Breadcrumb } from '../components/Breadcrumb';
import { ContextMenu } from '../components/ContextMenu';
import { FileDetail } from '../components/FileDetail';
import { SmartFolderModal } from '../components/SmartFolderModal';
import { formatSize, formatRelativeTime } from '../lib/utils';
import type { BrowseParams, BrowseResult } from '../lib/api';

type SortField = 'name' | 'size' | 'mtime' | 'description';

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

export function Browser() {
  const [currentFolder, setCurrentFolder] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [contentType, setContentType] = useState('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [limit, setLimit] = useState(50);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [sortField, setSortField] = useState<SortField>('mtime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showSmartFolder, setShowSmartFolder] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  const { data: folders } = useFolders();
  const { data: filterOpts } = useFilterOptions();
  const { data: stats } = useStats();

  const browseParams: BrowseParams = useMemo(() => ({
    q: debouncedQuery || undefined,
    category: category || undefined,
    contentType: contentType || undefined,
    sensitive: sensitiveOnly || undefined,
    folder: currentFolder || undefined,
    limit,
  }), [debouncedQuery, category, contentType, sensitiveOnly, currentFolder, limit]);

  const { data, isLoading, isError } = useBrowse(browseParams);

  const moveFileMut = useMoveFile();
  const copyFileMut = useCopyFile();
  const renameFileMut = useRenameFile();
  const deleteFileMut = useDeleteFile();
  const describeFileMut = useDescribeFile();

  const sortedResults = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'size': cmp = a.size - b.size; break;
        case 'mtime': cmp = a.mtime - b.mtime; break;
        case 'description': cmp = (a.aiDescription ?? '').localeCompare(b.aiDescription ?? ''); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, sortField, sortDirection]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDirection(field === 'mtime' ? 'desc' : 'asc'); }
  }

  function handleContextMenu(e: React.MouseEvent, path: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  }

  function handleMove(path: string) {
    const dest = prompt('Move to folder:', currentFolder || '/');
    if (!dest) return;
    const fileName = path.split('/').pop() ?? '';
    moveFileMut.mutate({ source: path, destination: dest.endsWith('/') ? dest + fileName : dest + '/' + fileName }, {
      onSuccess: () => toast.success(`Moved ${fileName}`),
      onError: (err) => toast.error(`Move failed: ${err.message}`),
    });
  }

  function handleCopy(path: string) {
    const dest = prompt('Copy to folder:', currentFolder || '/');
    if (!dest) return;
    const fileName = path.split('/').pop() ?? '';
    copyFileMut.mutate({ source: path, destination: dest.endsWith('/') ? dest + fileName : dest + '/' + fileName }, {
      onSuccess: () => toast.success(`Copied ${fileName}`),
      onError: (err) => toast.error(`Copy failed: ${err.message}`),
    });
  }

  function handleRename(path: string) {
    const currentName = path.split('/').pop() ?? '';
    const newName = prompt('New name:', currentName);
    if (!newName || newName === currentName) return;
    renameFileMut.mutate({ path, newName }, {
      onSuccess: () => toast.success(`Renamed to ${newName}`),
      onError: (err) => toast.error(`Rename failed: ${err.message}`),
    });
  }

  function handleDelete(path: string) {
    const fileName = path.split('/').pop() ?? '';
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    deleteFileMut.mutate(path, {
      onSuccess: () => toast.success(`Deleted ${fileName}`),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    });
  }

  // Reset focus when browse params change
  useEffect(() => { setFocusedIndex(null); }, [browseParams]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (contextMenu || showSmartFolder || selectedFilePath) return;
    if (!sortedResults.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => Math.min((i ?? -1) + 1, sortedResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max((i ?? 1) - 1, 0));
        break;
      case 'Enter':
        if (focusedIndex != null && sortedResults[focusedIndex]) {
          setSelectedFilePath(sortedResults[focusedIndex].path);
        }
        break;
      case 'Escape':
        setFocusedIndex(null);
        break;
    }
  }, [sortedResults, contextMenu, showSmartFolder, selectedFilePath, focusedIndex]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function handleRedescribe(path: string) {
    describeFileMut.mutate(path, {
      onSuccess: () => toast.success(`Re-described ${path.split('/').pop()}`),
      onError: (err) => toast.error(`Re-describe failed: ${err.message}`),
    });
  }

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <th className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700 dark:text-gray-400" onClick={() => handleSort(field)}>
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  const totalSize = data?.reduce((sum, f) => sum + f.size, 0) ?? 0;

  return (
    <div className="flex h-full">
      {/* Folder Tree Panel */}
      <div className="hidden w-64 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:block">
        <div className="px-3 pt-4 pb-2">
          <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Folders</h2>
        </div>
        {folders && <FolderTree folders={folders} currentFolder={currentFolder} onNavigate={setCurrentFolder} />}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Breadcrumb + filters */}
        <div className="space-y-3 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <Breadcrumb path={currentFolder} onNavigate={setCurrentFolder} />

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search in folder..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter dropdowns */}
            {filterOpts && (
              <>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                  <option value="">All Categories</option>
                  {filterOpts.categories.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
                </select>
                <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                  <option value="">All Types</option>
                  {filterOpts.contentTypes.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
                </select>
              </>
            )}

            <button
              onClick={() => setSensitiveOnly(!sensitiveOnly)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                sensitiveOnly
                  ? 'border-red-300 bg-red-100 text-red-700 dark:border-red-600 dark:bg-red-900 dark:text-red-300'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Sensitive
            </button>

            <button
              onClick={() => setShowSmartFolder(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Smart Folder
            </button>

            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1" />
                    <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              Failed to load files.
            </div>
          )}

          {!isLoading && data && data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <FolderOpen className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                {currentFolder ? 'This folder is empty.' : 'No files indexed yet.'}
              </p>
              {currentFolder && (
                <button
                  onClick={() => setShowSmartFolder(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
                >
                  <FolderPlus className="h-4 w-4" />
                  Create Smart Subfolder
                </button>
              )}
            </div>
          )}

          {!isLoading && sortedResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <SortHeader field="name" label="Name" />
                    <SortHeader field="description" label="Description" />
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Category</th>
                    <SortHeader field="size" label="Size" />
                    <SortHeader field="mtime" label="Modified" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {sortedResults.map((file: BrowseResult, rowIdx: number) => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedFilePath(file.path)}
                      onContextMenu={(e) => handleContextMenu(e, file.path)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${focusedIndex === rowIdx ? 'ring-2 ring-inset ring-indigo-500' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${extensionColor(file.extension)}`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</span>
                        </div>
                        {file.snippet && (
                          <p className="mt-0.5 truncate pl-[18px] text-xs text-gray-400">{file.snippet.slice(0, 120)}</p>
                        )}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        {file.aiDescription ? (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={file.aiDescription}>{file.aiDescription}</p>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {file.aiCategory && (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[file.aiCategory] ?? 'bg-gray-100 text-gray-800'}`}>
                            {file.aiCategory}
                          </span>
                        )}
                        {file.aiConfidence != null && file.aiConfidence < 0.5 && (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">unsure</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{formatSize(file.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(new Date(file.mtime).toISOString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          {sortedResults.length} file{sortedResults.length !== 1 ? 's' : ''}
          {totalSize > 0 && ` \u2022 ${formatSize(totalSize)}`}
          {stats && ` \u2022 ${stats.totalFiles} total indexed`}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={contextMenu.path}
          onClose={() => setContextMenu(null)}
          onMove={handleMove}
          onCopy={handleCopy}
          onRename={handleRename}
          onDelete={handleDelete}
          onViewDetails={(path) => setSelectedFilePath(path)}
          onRedescribe={handleRedescribe}
        />
      )}

      {/* File Detail Panel */}
      {selectedFilePath && (
        <FileDetail path={selectedFilePath} onClose={() => setSelectedFilePath(null)} />
      )}

      {/* Smart Folder Modal */}
      {showSmartFolder && (
        <SmartFolderModal parentFolder={currentFolder} onClose={() => setShowSmartFolder(false)} />
      )}
    </div>
  );
}
