import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import type { Command } from 'commander';
import { FileMom } from '@filemom/engine';
import type { FileMomConfig, ActionPlan } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printActionPlan, printCost } from '../utils/output.js';

const MAX_REFINEMENT_ROUNDS = 3;
const COST_WARNING_THRESHOLD = 1.0;

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Generate an AI-powered file organization plan')
    .argument('<command>', 'Natural language description of what to organize')
    .option('--save <file>', 'Save the plan to a JSON file')
    .option('--preview', 'Preview file matches without calling AI', false)
    .option('--model <model>', 'Override the AI model to use')
    .action(async (command: string, opts: { save?: string; preview: boolean; model?: string }) => {
      const spinner = ora('Loading configuration...').start();
      let fm: FileMom | undefined;

      try {
        // Step 1: Check API key
        const config = await loadConfig();

        if (!config.openRouterApiKey) {
          spinner.fail('Missing OPENROUTER_API_KEY.');
          console.error(chalk.red('Set OPENROUTER_API_KEY in your environment or ~/.filemom/config.json'));
          process.exitCode = 1;
          return;
        }

        if (!config.watchedFolders || config.watchedFolders.length === 0) {
          spinner.fail('No watched folders configured. Run "filemom add <folder>" first.');
          process.exitCode = 1;
          return;
        }

        // Apply model override if provided
        if (opts.model) {
          config.model = opts.model;
        }

        const fullConfig = {
          ...config,
          watchedFolders: config.watchedFolders,
          openRouterApiKey: config.openRouterApiKey,
          dataDir: config.dataDir!,
        } as FileMomConfig;

        // Step 2: Create and initialize FileMom
        fm = new FileMom(fullConfig);
        await fm.initialize();

        // Step 3: Generate plan
        spinner.text = opts.preview
          ? 'Finding matching files...'
          : 'Generating plan with AI...';

        let plan = await fm.plan(command, {
          previewOnly: opts.preview,
        });

        spinner.succeed(opts.preview ? 'Preview ready' : 'Plan generated');

        // Show query expansion results
        const expansion = fm.getLastExpansion();
        if (expansion) {
          console.log(chalk.dim('\n  Query Expansion:'));
          console.log(chalk.dim(`    Keywords:  ${expansion.keywords.join(', ')}`));
          if (expansion.folderPatterns.length > 0) {
            console.log(chalk.dim(`    Folders:   ${expansion.folderPatterns.join(', ')}`));
          }
          if (expansion.extensions.length > 0) {
            console.log(chalk.dim(`    Types:     ${expansion.extensions.join(', ')}`));
          }
          console.log(chalk.dim(`    Reasoning: ${expansion.reasoning}`));
        }

        // Step 4: Print plan + cost
        printActionPlan(plan);
        if (!opts.preview) {
          printCost(fm.getAICost());
        }

        // Step 5: If --save, write to file and exit
        if (opts.save) {
          await writeFile(opts.save, JSON.stringify(plan, null, 2) + '\n', 'utf-8');
          console.log(chalk.green(`Plan saved to ${opts.save}`));
          return;
        }

        // Step 6: If --preview, exit
        if (opts.preview) {
          return;
        }

        // Step 7: Interactive refinement loop
        const history: string[] = [command];
        let rounds = 0;

        while (rounds < MAX_REFINEMENT_ROUNDS) {
          const { response } = await inquirer.prompt<{ response: string }>([
            {
              type: 'input',
              name: 'response',
              message: 'Approve? (y/n/feedback):',
            },
          ]);

          const trimmed = response.trim().toLowerCase();

          if (trimmed === 'y' || trimmed === 'yes') {
            console.log(chalk.green.bold('Plan approved.') + chalk.dim(' (Execution not yet implemented)'));
            return;
          }

          if (trimmed === 'n' || trimmed === 'no') {
            console.log(chalk.yellow('Plan cancelled.'));
            return;
          }

          // Treat any other input as feedback
          rounds++;
          const feedback = response.trim();
          history.push(feedback);

          const refineSpinner = ora(`Refining plan (round ${rounds}/${MAX_REFINEMENT_ROUNDS})...`).start();

          plan = await fm.refinePlan({
            plan,
            feedback,
            history,
          });

          refineSpinner.succeed(`Plan refined (round ${rounds}/${MAX_REFINEMENT_ROUNDS})`);
          printActionPlan(plan);

          const cumulativeCost = fm.getAICost();
          printCost(cumulativeCost);

          if (cumulativeCost > COST_WARNING_THRESHOLD) {
            console.log(chalk.yellow.bold('  Warning: Approaching $1 budget threshold'));
          }
        }

        console.log(chalk.yellow(`Maximum refinement rounds (${MAX_REFINEMENT_ROUNDS}) reached.`));
        console.log(chalk.dim('Save the current plan with --save or start fresh.'));
      } catch (error) {
        spinner.fail('Plan generation failed');
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
