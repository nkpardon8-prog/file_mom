import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchHealth, fetchStats, triggerScan, fetchSearchResults, fetchFile, fetchSettings,
  generatePlan, refinePlan, executePlan, fetchUndoBatches, undoBatch,
  fetchEnrichStatus, triggerEnrichBatch, triggerEnrichFile, triggerEmbed,
  updateSettings, addWatchedFolder, removeWatchedFolder, testApiKey,
  watcherStart, watcherStop, fetchWatcherStatus,
  fetchDescribeStatus, triggerDescribeBatch, triggerDescribeFile, fetchDescribeCost,
  fetchBrowseResults, fetchFilterOptions, type BrowseParams,
  fetchFolders, moveFile, copyFile, renameFile, deleteFile,
  smartFolderAsk, smartFolderPreview, smartFolderCreate,
  type SmartFolderMessage, type SmartFolderCriteria,
  type ScanParams, type SearchParams, type GeneratePlanParams, type RefinePlanParams, type ExecutePlanParams,
  type SettingsData,
} from '../lib/api';

export const queryKeys = {
  health: ['health'] as const,
  stats: ['stats'] as const,
  search: (params: SearchParams) => ['search', params] as const,
  file: (path: string) => ['file', path] as const,
  settings: ['settings'] as const,
  undoBatches: ['undoBatches'] as const,
  enrichStatus: ['enrichStatus'] as const,
  describeStatus: ['describeStatus'] as const,
  browse: (params: BrowseParams) => ['browse', params] as const,
  filterOptions: ['filterOptions'] as const,
  folders: ['folders'] as const,
  watcherStatus: ['watcherStatus'] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth, refetchInterval: 60_000, retry: false });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: fetchStats });
}

export function useScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: ScanParams) => triggerScan(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.filterOptions });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: queryKeys.search(params),
    queryFn: () => fetchSearchResults(params),
    enabled: params.q.length > 0,
    staleTime: 10_000,
  });
}

export function useFile(path: string | null) {
  return useQuery({
    queryKey: queryKeys.file(path ?? ''),
    queryFn: () => fetchFile(path!),
    enabled: path !== null && path.length > 0,
    staleTime: 30_000,
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings, staleTime: 60_000 });
}

export function useGeneratePlan() {
  return useMutation({ mutationFn: (params: GeneratePlanParams) => generatePlan(params) });
}

export function useRefinePlan() {
  return useMutation({ mutationFn: (params: RefinePlanParams) => refinePlan(params) });
}

export function useExecutePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ExecutePlanParams) => executePlan(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.undoBatches });
    },
  });
}

export function useUndoBatches() {
  return useQuery({ queryKey: queryKeys.undoBatches, queryFn: fetchUndoBatches, refetchInterval: 30_000 });
}

export function useUndoBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => undoBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.undoBatches });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useEnrichStatus() {
  return useQuery({ queryKey: queryKeys.enrichStatus, queryFn: fetchEnrichStatus, staleTime: 30_000 });
}

export function useEnrichBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { limit?: number }) => triggerEnrichBatch(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useEnrichFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => triggerEnrichFile(path),
    onSuccess: (_data, path) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.file(path) });
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichStatus });
    },
  });
}

export function useEmbed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { limit?: number }) => triggerEmbed(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.enrichStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useDescribeStatus() {
  return useQuery({
    queryKey: queryKeys.describeStatus,
    queryFn: fetchDescribeStatus,
    staleTime: 30_000,
  });
}

export function useDescribeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { limit?: number }) => triggerDescribeBatch(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.describeStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['describeCost'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useDescribeCost() {
  return useQuery({
    queryKey: ['describeCost'] as const,
    queryFn: fetchDescribeCost,
    staleTime: 30_000,
  });
}

export function useDescribeFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => triggerDescribeFile(path),
    onSuccess: (_data, path) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.file(path) });
      queryClient.invalidateQueries({ queryKey: queryKeys.describeStatus });
    },
  });
}

export function useBrowse(params: BrowseParams) {
  return useQuery({
    queryKey: queryKeys.browse(params),
    queryFn: () => fetchBrowseResults(params),
    staleTime: 10_000,
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: queryKeys.filterOptions,
    queryFn: fetchFilterOptions,
    staleTime: 60_000,
  });
}

export function useFolders() {
  return useQuery({
    queryKey: queryKeys.folders,
    queryFn: fetchFolders,
    staleTime: 30_000,
  });
}

export function useMoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, destination }: { source: string; destination: string }) => moveFile(source, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useCopyFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ source, destination }: { source: string; destination: string }) => copyFile(source, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, newName }: { path: string; newName: string }) => renameFile(path, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => deleteFile(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useSmartFolderAsk() {
  return useMutation({
    mutationFn: (params: { folderName: string; description: string; messages: SmartFolderMessage[] }) =>
      smartFolderAsk(params.folderName, params.description, params.messages),
  });
}

export function useSmartFolderPreview() {
  return useMutation({
    mutationFn: (criteria: SmartFolderCriteria) => smartFolderPreview(criteria),
  });
}

export function useSmartFolderCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { folderPath: string; filePaths: string[] }) =>
      smartFolderCreate(params.folderPath, params.filePaths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.undoBatches });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<SettingsData>) => updateSettings(updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.settings }); },
  });
}

export function useAddFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => addWatchedFolder(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useRemoveFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => removeWatchedFolder(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useTestApiKey() {
  return useMutation({ mutationFn: (apiKey?: string) => testApiKey(apiKey) });
}

export function useWatcherStatus() {
  return useQuery({ queryKey: queryKeys.watcherStatus, queryFn: fetchWatcherStatus, refetchInterval: 5_000 });
}

export function useWatcherStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => watcherStart(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.watcherStatus }); },
  });
}

export function useWatcherStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => watcherStop(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.watcherStatus }); },
  });
}
