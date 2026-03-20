import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScanResult, SearchResult, ActionPlan, IndexStats } from '@filemom/engine';

/**
 * Format a byte count into a human-readable string.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Print a scan result summary.
 */
export function printScanResult(result: ScanResult): void {
  console.log();
  console.log(chalk.green.bold('Scan complete'));
  console.log(chalk.green(`  Total files scanned: ${result.totalFiles}`));
  console.log(chalk.green(`  New files:           ${result.newFiles}`));
  console.log(chalk.green(`  Updated files:       ${result.updatedFiles}`));
  console.log(chalk.green(`  Deleted files:       ${result.deletedFiles}`));
  console.log(chalk.green(`  Duration:            ${(result.durationMs / 1000).toFixed(2)}s`));

  if (result.errors.length > 0) {
    console.log();
    console.log(chalk.yellow(`  Errors: ${result.errors.length}`));
    for (const err of result.errors.slice(0, 10)) {
      console.log(chalk.yellow(`    ${err.path}: ${err.error}`));
    }
    if (result.errors.length > 10) {
      console.log(chalk.yellow(`    ... and ${result.errors.length - 10} more`));
    }
  }
  console.log();
}

/**
 * Print search results as a table.
 */
export function printSearchResults(results: SearchResult[]): void {
  if (results.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('Name'),
      chalk.cyan('Path'),
      chalk.cyan('Size'),
      chalk.cyan('Score'),
    ],
    colWidths: [30, 50, 12, 10],
    wordWrap: true,
  });

  for (const r of results) {
    table.push([
      r.name,
      r.path,
      formatSize(r.size),
      r.score.toFixed(3),
    ]);
  }

  console.log();
  console.log(chalk.bold(`Found ${results.length} result(s):`));
  console.log(table.toString());
  console.log();
}

/**
 * Color-code a confidence value.
 */
function colorConfidence(confidence: number): string {
  const text = confidence.toFixed(2);
  if (confidence >= 0.8) return chalk.green(text);
  if (confidence >= 0.5) return chalk.yellow(text);
  return chalk.red(text);
}

/**
 * Print an action plan with intent, actions table, warnings, and review items.
 */
export function printActionPlan(plan: ActionPlan): void {
  console.log();
  console.log(chalk.bold.blue('Intent: ') + plan.intent);
  console.log();

  if (plan.actions.length === 0) {
    console.log(chalk.yellow('  No actions in this plan.'));
  } else {
    const table = new Table({
      head: [
        chalk.cyan('Type'),
        chalk.cyan('Source'),
        chalk.cyan('Destination'),
        chalk.cyan('Confidence'),
      ],
      colWidths: [16, 38, 38, 14],
      wordWrap: true,
    });

    for (const action of plan.actions) {
      table.push([
        action.type,
        action.source,
        action.destination,
        colorConfidence(action.confidence),
      ]);
    }

    console.log(table.toString());
  }

  console.log();
  console.log(
    chalk.dim(
      `  Files affected: ${plan.summary.filesAffected}  |  ` +
      `Folders created: ${plan.summary.foldersCreated}  |  ` +
      `Total size: ${formatSize(plan.summary.totalSizeBytes)}`
    )
  );

  if (plan.warnings.length > 0) {
    console.log();
    console.log(chalk.yellow.bold('  Warnings:'));
    for (const w of plan.warnings) {
      console.log(chalk.yellow(`    - ${w}`));
    }
  }

  if (plan.needsReview.length > 0) {
    console.log();
    console.log(chalk.magenta.bold(`  Needs review (${plan.needsReview.length}):`));
    for (const item of plan.needsReview) {
      console.log(chalk.magenta(`    - ${item}`));
    }
  }

  console.log();
}

/**
 * Print index statistics.
 */
export function printStats(stats: IndexStats): void {
  console.log();
  console.log(chalk.bold('Index Statistics'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log(`  Total files:    ${chalk.bold(String(stats.totalFiles))}`);
  console.log(`  Total size:     ${chalk.bold(formatSize(stats.totalSize))}`);
  console.log(`  Oldest file:    ${stats.oldestFile.toLocaleDateString()}`);
  console.log(`  Newest file:    ${stats.newestFile.toLocaleDateString()}`);
  console.log(`  Last scan:      ${stats.lastScanAt ? stats.lastScanAt.toLocaleString() : chalk.dim('never')}`);

  if (Object.keys(stats.byExtension).length > 0) {
    console.log();
    console.log(chalk.bold('  By Extension:'));
    const sorted = Object.entries(stats.byExtension).sort((a, b) => b[1] - a[1]);
    for (const [ext, count] of sorted) {
      console.log(`    .${ext.padEnd(10)} ${String(count).padStart(6)} files`);
    }
  }

  if (stats.watchedFolders.length > 0) {
    console.log();
    console.log(chalk.bold('  Watched Folders:'));
    for (const folder of stats.watchedFolders) {
      const scanInfo = folder.lastScanAt
        ? `scanned ${folder.lastScanAt.toLocaleString()}`
        : chalk.dim('not yet scanned');
      console.log(`    ${folder.path} (${folder.fileCount} files, ${scanInfo})`);
    }
  }

  console.log();
}

/**
 * Print AI cost formatted as dollars.
 */
export function printCost(cost: number): void {
  console.log(chalk.dim(`  AI cost: $${cost.toFixed(4)}`));
}
