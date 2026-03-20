import chalk from 'chalk';
import ora from 'ora';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig, WatcherEvent } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';

export function registerWatch(program: Command): void {
  program
    .command('watch')
    .description('Watch folders for file changes and update index in real time')
    .action(async () => {
      const spinner = ora('Loading configuration...').start();
      let fm: FileMom | undefined;

      try {
        const config = await loadConfig();

        const folders = config.watchedFolders;
        if (!folders || folders.length === 0) {
          spinner.fail('No watched folders configured.');
          console.log(chalk.dim('Run "filemom add <folder>" to add a folder first.'));
          process.exitCode = 1;
          return;
        }

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

        spinner.text = 'Starting file watcher...';

        const eventHandler = (event: WatcherEvent): void => {
          const timestamp = new Date().toLocaleTimeString();
          switch (event.type) {
            case 'file:created':
              console.log(chalk.green(`  ${timestamp}  + ${event.path}`));
              break;
            case 'file:modified':
              console.log(chalk.yellow(`  ${timestamp}  ~ ${event.path}`));
              break;
            case 'file:deleted':
              console.log(chalk.red(`  ${timestamp}  - ${event.path}`));
              break;
            case 'file:renamed':
              console.log(chalk.blue(`  ${timestamp}  > ${event.oldPath} → ${event.newPath}`));
              break;
            case 'error':
              console.log(chalk.red(`  ${timestamp}  ! ${event.error.message}`));
              break;
          }
        };

        await fm.startWatching(eventHandler);

        spinner.succeed('Watching for file changes');
        console.log();
        console.log(chalk.dim('  Folders:'));
        for (const folder of folders) {
          console.log(chalk.dim(`    ${folder}`));
        }
        console.log();
        console.log(chalk.dim('  Press Ctrl+C to stop'));
        console.log();

        await new Promise<void>((resolve) => {
          const handler = async () => {
            console.log();
            const stopSpinner = ora('Stopping watcher...').start();
            await fm!.shutdown();
            stopSpinner.succeed('Watcher stopped');
            resolve();
          };
          process.on('SIGINT', () => void handler());
          process.on('SIGTERM', () => void handler());
        });
      } catch (error) {
        spinner.fail('Watch failed');
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(msg));
        process.exitCode = 1;
        if (fm) {
          await fm.shutdown();
        }
      }
    });
}
