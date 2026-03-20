import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';

export function registerUndo(program: Command): void {
  program
    .command('undo')
    .description('Undo a previous operation batch')
    .argument('[batch-id]', 'Batch ID to undo (shows list if omitted)')
    .action(async (batchId: string | undefined) => {
      let fm: FileMom | undefined;
      try {
        const config = await loadConfig();
        fm = new FileMom(config as FileMomConfig);
        await fm.initialize();

        if (!batchId) {
          // Show list of undoable batches
          const batches = await fm.getUndoableBatches();

          if (batches.length === 0) {
            console.log(chalk.yellow('No undoable operations found.'));
            console.log(chalk.dim('Operations can be undone within 30 minutes of execution.'));
            return;
          }

          console.log(chalk.bold('Undoable batches:\n'));
          for (const batch of batches) {
            const expiresIn = Math.max(0, Math.round((batch.expiresAt - Date.now()) / 60000));
            console.log(`  ${chalk.cyan(batch.batchId.slice(0, 8))}  ${batch.intent}`);
            console.log(`    ${batch.actionCount} actions  |  Expires in ${expiresIn} min`);
            console.log();
          }

          // Prompt to select
          const { selected } = await inquirer.prompt<{ selected: string }>([
            {
              type: 'list',
              name: 'selected',
              message: 'Select a batch to undo:',
              choices: [
                ...batches.map((b) => ({
                  name: `${b.batchId.slice(0, 8)} — ${b.intent} (${b.actionCount} actions)`,
                  value: b.batchId,
                })),
                { name: 'Cancel', value: '__cancel__' },
              ],
            },
          ]);

          if (selected === '__cancel__') {
            console.log(chalk.yellow('Cancelled.'));
            return;
          }

          batchId = selected;
        }

        // Confirm undo
        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Undo batch ${batchId.slice(0, 8)}? This will reverse all file operations.`,
            default: false,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow('Cancelled.'));
          return;
        }

        // Execute undo
        const spinner = ora('Undoing operations...').start();
        const result = await fm.undo(batchId);

        if (result.success) {
          spinner.succeed(`Undo complete: ${result.restored} operations reversed`);
        } else {
          spinner.warn(`Undo finished with issues: ${result.restored} reversed, ${result.errors.length} errors`);
          for (const err of result.errors) {
            console.log(chalk.red(`  ${err}`));
          }
        }
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exitCode = 1;
      } finally {
        await fm?.shutdown();
      }
    });
}
