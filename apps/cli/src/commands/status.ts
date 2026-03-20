import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printStats } from '../utils/output.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show index statistics and system status')
    .action(async () => {
      const spinner = ora('Loading index stats...').start();
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

        const stats = await fm.getStats();
        spinner.succeed('Index loaded');
        printStats(stats);
      } catch (error) {
        spinner.fail('Failed to load status');
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
