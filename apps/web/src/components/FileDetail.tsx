import { useState } from 'react';
import { FileText, X, ChevronUp, ChevronDown, Copy, Check, Loader2 } from 'lucide-react';
import { useFile } from '../hooks/useApi';
import { formatSize, formatRelativeTime, formatDate } from '../lib/utils';

interface FileDetailProps {
  path: string;
  onClose: () => void;
}

function MetaRow({ label, value, mono, copyable }: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className={`text-right text-sm text-gray-900 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {copyable && (
          <button onClick={handleCopy} className="ml-2 text-gray-400 hover:text-gray-600" title="Copy">
            {copied ? <Check className="inline h-3.5 w-3.5 text-green-500" /> : <Copy className="inline h-3.5 w-3.5" />}
          </button>
        )}
      </dd>
    </div>
  );
}

function CollapsibleSection({ title, badge, defaultOpen, children }: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <section className="border-b border-gray-100 px-6 py-4">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {badge && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{badge}</span>}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </section>
  );
}

function tsToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function FileDetail({ path, onClose }: FileDetailProps) {
  const { data: file, isLoading, isError, error } = useFile(path);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-[480px] bg-white shadow-xl overflow-y-auto dark:bg-gray-800">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 shrink-0 text-gray-400" />
            <h2 className="truncate text-lg font-semibold text-gray-900">{file?.name ?? 'Loading...'}</h2>
            {file?.extension && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                .{file.extension}
              </span>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-red-600">Failed to load file details</p>
            <p className="mt-1 text-xs text-gray-500">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        )}

        {/* Content */}
        {file && (
          <>
            {/* Metadata */}
            <section className="border-b border-gray-100 px-6 py-5">
              <h3 className="text-sm font-semibold text-gray-900">Metadata</h3>
              <dl className="mt-3 space-y-3">
                <MetaRow label="Path" value={file.path} mono />
                <MetaRow label="Size" value={formatSize(file.size)} />
                <MetaRow label="Modified" value={`${formatRelativeTime(tsToIso(file.mtime))} (${formatDate(tsToIso(file.mtime))})`} />
                <MetaRow label="Created" value={`${formatRelativeTime(tsToIso(file.ctime))} (${formatDate(tsToIso(file.ctime))})`} />
                <MetaRow label="Hash" value={file.quickHash} mono copyable />
                {file.detectedMimeType && <MetaRow label="MIME Type" value={file.detectedMimeType} />}
                <MetaRow label="Indexed" value={formatRelativeTime(tsToIso(file.indexedAt))} />
              </dl>
            </section>

            {/* Extracted Text */}
            {file.extractedText && (
              <CollapsibleSection title="Extracted Text" badge={`${file.extractedText.length.toLocaleString()} chars`}>
                <div className="max-h-[200px] overflow-y-auto rounded-lg bg-gray-50 p-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-700">{file.extractedText}</pre>
                </div>
              </CollapsibleSection>
            )}

            {/* EXIF */}
            {file.exifJson && (() => {
              try {
                const exif = JSON.parse(file.exifJson);
                const fields: [string, string | undefined][] = [
                  ['Camera', exif.camera],
                  ['Lens', exif.lens],
                  ['Date Taken', exif.dateTaken],
                  ['Dimensions', exif.dimensions ? `${exif.dimensions.width} × ${exif.dimensions.height}` : undefined],
                  ['GPS', exif.gps ? `${exif.gps.latitude.toFixed(4)}, ${exif.gps.longitude.toFixed(4)}` : undefined],
                  ['Orientation', exif.orientation ? String(exif.orientation) : undefined],
                ];
                const visible = fields.filter(([, v]) => v !== undefined);
                if (visible.length === 0) return null;
                return (
                  <CollapsibleSection title="EXIF Data" badge={`${visible.length} fields`}>
                    <dl className="space-y-2">
                      {visible.map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between">
                          <dt className="text-sm text-gray-500">{label}</dt>
                          <dd className="text-sm text-gray-900">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </CollapsibleSection>
                );
              } catch { return null; }
            })()}

            {/* Vision */}
            {file.visionDescription && (
              <CollapsibleSection title="Vision Analysis">
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">{file.visionDescription}</p>
                  {file.visionCategory && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Category:</span>
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">{file.visionCategory}</span>
                    </div>
                  )}
                  {file.visionTags && (
                    <div className="flex flex-wrap gap-1.5">
                      {(() => { try { return JSON.parse(file.visionTags); } catch { return file.visionTags.split(','); } })()
                        .map((tag: string) => (
                          <span key={tag.trim()} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag.trim()}</span>
                        ))}
                    </div>
                  )}
                  {file.enrichedAt && (
                    <p className="text-xs text-gray-400">Enriched {formatRelativeTime(tsToIso(file.enrichedAt))}</p>
                  )}
                </div>
              </CollapsibleSection>
            )}

            {/* AI Description */}
            {file.aiDescription && (
              <CollapsibleSection title="AI Description" badge={file.aiConfidence != null ? `${Math.round(file.aiConfidence * 100)}%` : undefined} defaultOpen>
                <div className="space-y-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{file.aiDescription}</p>
                  <div className="flex flex-wrap gap-2">
                    {file.aiCategory && (
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{file.aiCategory}</span>
                    )}
                    {file.aiSubcategory && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">{file.aiSubcategory}</span>
                    )}
                    {file.aiContentType && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">{file.aiContentType}</span>
                    )}
                  </div>
                  {file.aiTags && (
                    <div className="flex flex-wrap gap-1.5">
                      {(() => { try { return JSON.parse(file.aiTags); } catch { return []; } })()
                        .map((tag: string) => (
                          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">{tag}</span>
                        ))}
                    </div>
                  )}
                  {file.aiSensitive && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                      <span className="font-medium">Sensitive</span>
                      {file.aiSensitiveType && <span>({file.aiSensitiveType})</span>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
                    {file.aiDateContext && <span>Date: {file.aiDateContext}</span>}
                    {file.aiSource && <span>Source: {file.aiSource}</span>}
                    {file.aiDescriptionModel && <span>Model: {file.aiDescriptionModel}</span>}
                    {file.aiDescribedAt && <span>Described {formatRelativeTime(tsToIso(file.aiDescribedAt))}</span>}
                  </div>
                  {file.aiConfidence != null && file.aiConfidence < 0.5 && (
                    <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">AI unsure — low confidence classification</p>
                  )}
                </div>
              </CollapsibleSection>
            )}
          </>
        )}
      </div>
    </div>
  );
}
