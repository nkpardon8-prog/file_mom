import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printSearchResults } from '../utils/output.js';

export function registerSearch(program: Command): void {
  program
    .command('search')
    .description('Search indexed files by keyword')
    .argument('<query>', 'Search query')
    .option('-l, --limit <n>', 'Maximum number of results', '20')
    .option('-e, --ext <extensions...>', 'Filter by file extensions (e.g., pdf txt)')
    .option('-s, --semantic', 'Use hybrid semantic + keyword search (requires enableEmbeddings)', false)
    .action(async (query: string, opts: { limit: string; ext?: string[]; semantic: boolean }) => {
      const spinner = ora('Searching...').start();
      let fm: FileMom | undefined;

      try {
        const config = await loadConfig();

        if (!config.openRouterApiKey) {
          spinner.fail('Missing OPENROUTER_API_KEY. Set it in your environment or config.');
          process.exitCode = 1;
          return;
        }

        if (!config.watchedFolders || config.watchedFolders.length === 0) {
          spinner.fail('No watched folders configured. Run "filemom add <folder>" first.');
          process.exitCode = 1;
          return;
        }

        const fullConfig = {
          ...config,
          watchedFolders: config.watchedFolders,
          openRouterApiKey: config.openRouterApiKey,
          dataDir: config.dataDir!,
        } as FileMomConfig;

        fm = new FileMom(fullConfig);
        await fm.initialize();

        const limit = parseInt(opts.limit, 10) || 20;

        if (opts.semantic) {
          const results = await fm.semanticSearch(query, {
            limit,
            extensions: opts.ext,
          });
          spinner.succeed(`Semantic search complete`);
          printSearchResults(results.map((r) => ({
            id: r.id, path: r.path, name: r.name, extension: r.extension,
            size: r.size, mtime: r.mtime, score: r.combinedScore, snippet: r.snippet,
          })));
        } else {
          const results = await fm.search(query, {
            limit,
            extensions: opts.ext,
          });
          spinner.succeed(`Search complete`);
          printSearchResults(results);
        }
      } catch (error) {
        spinner.fail('Search failed');
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(msg));
        process.exitCode = 1;
      } finally {
        if (fm) {
          await fm.shutdown();
        }
      }
    });
}
