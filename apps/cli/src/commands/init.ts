import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { CONFIG_DIR, CONFIG_FILE, saveConfig } from '../utils/config.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize FileMom configuration and data directory')
    .option('-d, --dir <path>', 'Custom data directory path', CONFIG_DIR)
    .action(async (opts: { dir: string }) => {
      try {
        const dataDir = resolve(opts.dir);

        // Create the data directory
        await mkdir(dataDir, { recursive: true });

        if (existsSync(CONFIG_FILE)) {
          console.log(chalk.yellow(`Config file already exists at ${CONFIG_FILE}`));
          console.log(chalk.yellow('Use "filemom add <folder>" to add watched folders.'));
          return;
        }

        // Write default config
        await saveConfig({
          dataDir,
          watchedFolders: [],
          model: 'anthropic/claude-sonnet-4',
        });

        console.log(chalk.green.bold('FileMom initialized!'));
        console.log(chalk.green(`  Config:    ${CONFIG_FILE}`));
        console.log(chalk.green(`  Data dir:  ${dataDir}`));
        console.log();
        console.log(chalk.dim('Next steps:'));
        console.log(chalk.dim('  1. filemom add ~/Documents   # add a folder to watch'));
        console.log(chalk.dim('  2. filemom scan              # scan your files'));
        console.log(chalk.dim('  3. filemom plan "organize by type"  # generate a plan'));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Failed to initialize: ${msg}`));
        process.exitCode = 1;
      }
    });
}
