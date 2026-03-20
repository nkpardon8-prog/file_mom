import { useState, useMemo } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import type { FolderInfo } from '../lib/api';

interface FolderTreeProps {
  folders: FolderInfo[];
  currentFolder: string;
  onNavigate: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  fileCount: number;
  children: TreeNode[];
}

function buildTree(folders: FolderInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort folders so parents come before children
  const sorted = [...folders].sort((a, b) => a.path.localeCompare(b.path));

  for (const folder of sorted) {
    const parts = folder.path.split('/').filter(Boolean);
    let currentPath = '';
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      let existing = nodeMap.get(currentPath);

      if (!existing) {
        existing = {
          name: parts[i],
          path: currentPath,
          fileCount: 0,
          children: [],
        };
        nodeMap.set(currentPath, existing);
        currentLevel.push(existing);
      }

      // Set file count on the leaf node that matches the folder
      if (currentPath === folder.path) {
        existing.fileCount = folder.fileCount;
      }

      currentLevel = existing.children;
    }
  }

  return root;
}

function FolderNode({ node, currentFolder, onNavigate, depth }: {
  node: TreeNode;
  currentFolder: string;
  onNavigate: (path: string) => void;
  depth: number;
}) {
  const isActive = currentFolder === node.path;
  const isParentOfActive = currentFolder.startsWith(node.path + '/');
  const [expanded, setExpanded] = useState(isActive || isParentOfActive);

  const hasChildren = node.children.length > 0;
  const Icon = expanded && hasChildren ? FolderOpen : Folder;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        onClick={() => {
          onNavigate(node.path);
          if (hasChildren) setExpanded(!expanded);
        }}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <Chevron className="h-3 w-3 flex-shrink-0 text-gray-400" />
        ) : (
          <span className="w-3" />
        )}
        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
        <span className="flex-1 truncate">{node.name}</span>
        {node.fileCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{node.fileCount}</span>
        )}
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderNode
              key={child.path}
              node={child}
              currentFolder={currentFolder}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ folders, currentFolder, onNavigate }: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);

  return (
    <div className="space-y-0.5 py-2">
      <button
        onClick={() => onNavigate('')}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
          currentFolder === ''
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
      >
        <span className="w-3" />
        <Folder className={`h-4 w-4 ${currentFolder === '' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
        <span className="flex-1">All Files</span>
      </button>
      {tree.map((node) => (
        <FolderNode
          key={node.path}
          node={node}
          currentFolder={currentFolder}
          onNavigate={onNavigate}
          depth={0}
        />
      ))}
    </div>
  );
}
