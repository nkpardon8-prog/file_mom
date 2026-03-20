import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printScanResult } from '../utils/output.js';

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Scan watched folders and update the file index')
    .option('--folders <paths...>', 'Specific folders to scan (overrides config)')
    .option('--full', 'Force full rescan (ignore incremental cache)', false)
    .option('--embed', 'Generate embeddings after scanning (requires enableEmbeddings)', false)
    .action(async (opts: { folders?: string[]; full: boolean; embed: boolean }) => {
      const spinner = ora('Loading configuration...').start();
      let fm: FileMom | undefined;

      try {
        const config = await loadConfig();

        // Determine folders to scan
        const folders = opts.folders ?? config.watchedFolders;
        if (!folders || folders.length === 0) {
          spinner.fail('No watched folders configured.');
          console.log(chalk.dim('Run "filemom add <folder>" to add a folder first.'));
          process.exitCode = 1;
          return;
        }

        // Validate required fields
        if (!config.openRouterApiKey) {
          spinner.fail('Missing OPENROUTER_API_KEY. Set it in your environment or config.');
          process.exitCode = 1;
          return;
        }

        const fullConfig: FileMomConfig = {
          ...config,
          watchedFolders: folders,
          openRouterApiKey: config.openRouterApiKey,
          dataDir: config.dataDir!,
        } as FileMomConfig;

        fm = new FileMom(fullConfig);
        await fm.initialize();

        spinner.text = 'Scanning files...';
        let fileCount = 0;

        const result = await fm.scan({
          folders,
          fullRescan: opts.full,
          onProgress: (event) => {
            if (event.type === 'scan:progress') {
              fileCount = event.scanned;
              spinner.text = `Scanning files... (${fileCount} found)`;
            }
          },
        });

        spinner.succeed(`Scan finished (${result.totalFiles} files processed)`);
        printScanResult(result);

        if (opts.embed) {
          const embedSpinner = ora('Generating embeddings...').start();
          try {
            const embedResult = await fm.embedFiles();
            embedSpinner.succeed(`Embedded ${embedResult.embedded} files`);
          } catch (err) {
            embedSpinner.warn(err instanceof Error ? err.message : 'Embedding generation failed');
          }
        }
      } catch (error) {
        spinner.fail('Scan failed');
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
