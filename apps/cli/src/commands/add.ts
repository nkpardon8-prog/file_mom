import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import chalk from 'chalk';
import type { Command } from 'commander';
import { readStoredConfig, saveConfig, CONFIG_FILE } from '../utils/config.js';

export function registerAdd(program: Command): void {
  program
    .command('add')
    .description('Add a folder to the watched folders list')
    .argument('<folder>', 'Folder path to add')
    .action(async (folder: string) => {
      try {
        const absolutePath = resolve(folder);

        // Validate folder exists and is a directory
        if (!existsSync(absolutePath)) {
          console.error(chalk.red(`Folder does not exist: ${absolutePath}`));
          process.exitCode = 1;
          return;
        }

        const stats = await stat(absolutePath);
        if (!stats.isDirectory()) {
          console.error(chalk.red(`Not a directory: ${absolutePath}`));
          process.exitCode = 1;
          return;
        }

        // Read existing config or create a default one
        let config = await readStoredConfig();
        if (!config) {
          config = {
            dataDir: undefined,
            watchedFolders: [],
            model: 'anthropic/claude-sonnet-4',
          };
        }

        // Ensure watchedFolders is an array
        if (!Array.isArray(config.watchedFolders)) {
          config.watchedFolders = [];
        }

        // Check for duplicates
        if (config.watchedFolders.includes(absolutePath)) {
          console.log(chalk.yellow(`Folder already watched: ${absolutePath}`));
          return;
        }

        config.watchedFolders.push(absolutePath);
        await saveConfig(config);

        console.log(chalk.green(`Added: ${absolutePath}`));
        console.log(chalk.dim(`Config saved to ${CONFIG_FILE}`));
        console.log(chalk.dim(`Total watched folders: ${config.watchedFolders.length}`));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Failed to add folder: ${msg}`));
        process.exitCode = 1;
      }
    });
}
