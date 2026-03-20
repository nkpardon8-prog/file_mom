import { useState } from 'react';
import { X, FolderPlus, Send, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useSmartFolderAsk, useSmartFolderPreview, useSmartFolderCreate } from '../hooks/useApi';
import { formatSize, formatCost } from '../lib/utils';
import type { SmartFolderMessage, SmartFolderCriteria, BrowseResult, ExecutionResult } from '../lib/api';

type Step = 'setup' | 'chatting' | 'preview' | 'creating' | 'done';

interface SmartFolderModalProps {
  parentFolder: string;
  onClose: () => void;
}

export function SmartFolderModal({ parentFolder, onClose }: SmartFolderModalProps) {
  const [step, setStep] = useState<Step>('setup');
  const [folderName, setFolderName] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<SmartFolderMessage[]>([]);
  const [criteria, setCriteria] = useState<SmartFolderCriteria | null>(null);
  const [previewFiles, setPreviewFiles] = useState<BrowseResult[]>([]);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  const [userInput, setUserInput] = useState('');
  const [cost, setCost] = useState(0);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [targetDir, setTargetDir] = useState(parentFolder || '');

  const askMutation = useSmartFolderAsk();
  const previewMutation = useSmartFolderPreview();
  const createMutation = useSmartFolderCreate();

  const folderPath = targetDir
    ? `${targetDir}/${folderName}`
    : '';

  function handleStart() {
    if (!folderName.trim() || !description.trim() || !targetDir.trim()) return;
    setStep('chatting');
    askMutation.mutate({ folderName: folderName.trim(), description: description.trim(), messages: [] }, {
      onSuccess: (data) => {
        setMessages([{ role: 'assistant', content: data.message }]);
        setCost(data.cost);
        if (data.done && data.criteria) {
          setCriteria(data.criteria);
          loadPreview(data.criteria);
        }
      },
      onError: (err) => {
        toast.error(`AI error: ${err.message}`);
        setStep('setup');
      },
    });
  }

  function handleSend() {
    if (!userInput.trim()) return;
    const newMessages: SmartFolderMessage[] = [...messages, { role: 'user', content: userInput.trim() }];
    setMessages(newMessages);
    setUserInput('');

    askMutation.mutate({ folderName, description, messages: newMessages }, {
      onSuccess: (data) => {
        setMessages([...newMessages, { role: 'assistant', content: data.message }]);
        setCost(data.cost);
        if (data.done && data.criteria) {
          setCriteria(data.criteria);
          loadPreview(data.criteria);
        }
      },
      onError: (err) => toast.error(`AI error: ${err.message}`),
    });
  }

  function loadPreview(c: SmartFolderCriteria) {
    previewMutation.mutate(c, {
      onSuccess: (files) => {
        setPreviewFiles(files);
        setExcludedPaths(new Set());
        setStep('preview');
      },
      onError: (err) => toast.error(`Preview failed: ${err.message}`),
    });
  }

  function toggleFile(path: string) {
    setExcludedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleCreate() {
    const selectedPaths = previewFiles.filter((f) => !excludedPaths.has(f.path)).map((f) => f.path);
    if (selectedPaths.length === 0) return;
    setStep('creating');
    createMutation.mutate({ folderPath, filePaths: selectedPaths }, {
      onSuccess: (result) => {
        setExecutionResult(result);
        setStep('done');
      },
      onError: (err) => {
        toast.error(`Create failed: ${err.message}`);
        setStep('preview');
      },
    });
  }

  const selectedCount = previewFiles.length - excludedPaths.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-[600px] flex-col rounded-xl bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {step === 'done' ? 'Folder Created' : 'Create Smart Folder'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Setup Step */}
          {step === 'setup' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Folder Name</label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Tax 2024"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="All tax-related documents from 2024"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
                <input
                  type="text"
                  value={targetDir}
                  onChange={(e) => setTargetDir(e.target.value)}
                  placeholder="/Users/you/Documents"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              {folderPath && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Will be created at: <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">{folderPath}</code>
                </p>
              )}
            </div>
          )}

          {/* Chat Step */}
          {step === 'chatting' && (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {askMutation.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-700">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedCount} of {previewFiles.length} files selected for <strong>{folderName}</strong>
              </p>
              <div className="max-h-[40vh] space-y-1 overflow-y-auto">
                {previewFiles.map((file) => (
                  <label
                    key={file.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={!excludedPaths.has(file.path)}
                      onChange={() => toggleFile(file.path)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                      {file.aiDescription && (
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{file.aiDescription}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Creating Step */}
          {step === 'creating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-4 text-sm text-gray-500">Creating folder and moving files...</p>
            </div>
          )}

          {/* Done Step */}
          {step === 'done' && executionResult && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Smart folder created
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Moved {executionResult.summary.succeeded} file{executionResult.summary.succeeded !== 1 ? 's' : ''} to <strong>{folderName}</strong>
                {executionResult.summary.failed > 0 && ` (${executionResult.summary.failed} failed)`}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Batch ID: {executionResult.batchId} — undo available for 30 minutes
              </p>
              {cost > 0 && (
                <p className="mt-1 text-xs text-gray-400">AI cost: {formatCost(cost)}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          {step === 'setup' && (
            <button
              onClick={handleStart}
              disabled={!folderName.trim() || !description.trim() || !targetDir.trim()}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Find Matching Files
            </button>
          )}

          {step === 'chatting' && !askMutation.isPending && (
            <div className="flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type your answer..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <button
                onClick={handleSend}
                disabled={!userInput.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('chatting')}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Back to Chat
              </button>
              <button
                onClick={handleCreate}
                disabled={selectedCount === 0}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Create & Move {selectedCount} File{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
