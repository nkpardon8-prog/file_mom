import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import { FileMom, ActionPlanSchema } from '@filemom/engine';
import type { FileMomConfig } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printActionPlan } from '../utils/output.js';

export function registerExecute(program: Command): void {
  program
    .command('execute')
    .description('Execute a saved action plan')
    .argument('[plan-file]', 'Path to a saved plan JSON file')
    .option('--dry-run', 'Validate plan without executing', false)
    .option('--yes', 'Skip confirmation prompt', false)
    .action(async (planFile: string | undefined, opts: { dryRun: boolean; yes: boolean }) => {
      if (!planFile) {
        console.error(chalk.red('Usage: filemom execute <plan-file>'));
        console.error(chalk.dim('  Generate a plan first: filemom plan "..." --save plan.json'));
        process.exitCode = 1;
        return;
      }

      const planPath = resolve(planFile);
      if (!existsSync(planPath)) {
        console.error(chalk.red(`Plan file not found: ${planPath}`));
        process.exitCode = 1;
        return;
      }

      let fm: FileMom | undefined;
      try {
        // Load and validate plan
        const raw = JSON.parse(await readFile(planPath, 'utf-8'));
        const plan = ActionPlanSchema.parse(raw);

        // Show the plan
        printActionPlan(plan);

        if (opts.dryRun) {
          console.log(chalk.yellow('\n  Dry run mode — validating without executing...'));
        }

        // Confirm unless --yes
        if (!opts.yes && !opts.dryRun) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Execute this plan? (${plan.actions.length} actions)`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('Cancelled.'));
            return;
          }
        }

        // Initialize engine
        const config = await loadConfig();
        fm = new FileMom(config as FileMomConfig);
        await fm.initialize();

        // Execute
        const spinner = ora('Executing plan...').start();
        let completed = 0;

        const result = await fm.execute(plan, {
          dryRun: opts.dryRun,
          onProgress: (event) => {
            if (event.type === 'execute:success' || event.type === 'execute:failed') {
              completed++;
              spinner.text = `Executing... ${completed}/${plan.actions.length}`;
            }
          },
        });

        if (result.success) {
          spinner.succeed(
            opts.dryRun
              ? `Dry run complete: ${result.summary.succeeded} actions would succeed`
              : `Execution complete: ${result.summary.succeeded} actions succeeded`,
          );
        } else {
          spinner.warn(
            `Execution finished with issues: ${result.summary.succeeded} succeeded, ${result.summary.failed} failed`,
          );
        }

        // Show results
        console.log();
        console.log(`  Succeeded: ${chalk.green(String(result.summary.succeeded))}`);
        if (result.summary.failed > 0) {
          console.log(`  Failed:    ${chalk.red(String(result.summary.failed))}`);
          for (const r of result.results.filter((r) => !r.success)) {
            console.log(chalk.red(`    ${r.actionId}: ${r.error}`));
          }
        }
        if (result.summary.skipped > 0) {
          console.log(`  Skipped:   ${chalk.yellow(String(result.summary.skipped))}`);
        }

        if (!opts.dryRun && result.summary.succeeded > 0) {
          console.log();
          console.log(chalk.dim(`  Batch ID: ${result.batchId}`));
          console.log(chalk.dim(`  Undo available for 30 minutes: filemom undo ${result.batchId}`));
        }
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exitCode = 1;
      } finally {
        await fm?.shutdown();
      }
    });
}
