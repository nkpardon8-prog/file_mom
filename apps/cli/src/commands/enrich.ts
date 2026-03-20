import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { FileMom } from '@filemom/engine';
import { loadConfig } from '../utils/config.js';
import { printCost } from '../utils/output.js';

export function registerEnrich(program: Command): void {
  program
    .command('enrich [file]')
    .description('Enrich files with AI vision analysis (Qwen VL)')
    .option('-l, --limit <n>', 'Max files to enrich in batch mode', '50')
    .option('--model <model>', 'Vision model to use')
    .action(async (file: string | undefined, opts: { limit: string; model?: string }) => {
      const config = await loadConfig();

      if (!config.openRouterApiKey) {
        console.error(chalk.red('OPENROUTER_API_KEY not set. Add it to .env or environment.'));
        process.exit(1);
      }

      // Enable vision enrichment
      config.enableVisionEnrichment = true;
      if (opts.model) {
        config.visionModel = opts.model;
      }

      let fm: FileMom | undefined;
      try {
        fm = new FileMom(config as any);
        await fm.initialize();

        if (file) {
          // Single file mode
          const filePath = resolve(file);
          if (!existsSync(filePath)) {
            console.error(chalk.red(`File not found: ${filePath}`));
            process.exit(1);
          }

          const spinner = ora(`Analyzing ${filePath}...`).start();
          const result = await fm.enrichFile(filePath);
          spinner.succeed('Analysis complete');

          console.log();
          console.log(chalk.bold('Description:'), result.description);
          console.log(chalk.bold('Category:'), result.category);
          console.log(chalk.bold('Tags:'), result.tags.join(', '));
          console.log(chalk.bold('Confidence:'), result.confidence.toFixed(2));
          console.log(chalk.bold('Model:'), result.model);
          printCost(fm.getVisionCost());
        } else {
          // Batch mode
          const limit = parseInt(opts.limit, 10);
          const spinner = ora('Finding files to enrich...').start();

          const result = await fm.enrichFiles({
            limit,
            onProgress: (done, total) => {
              spinner.text = `Enriching files... ${done}/${total}`;
            },
          });

          spinner.succeed(`Enrichment complete`);

          console.log();
          console.log(`  Enriched:  ${chalk.green(String(result.enriched))}`);
          if (result.skipped > 0) {
            console.log(`  Skipped:   ${chalk.yellow(String(result.skipped))}`);
          }
          if (result.errors.length > 0) {
            console.log(`  Errors:    ${chalk.red(String(result.errors.length))}`);
            for (const err of result.errors.slice(0, 5)) {
              console.log(`    ${err.path}: ${err.error}`);
            }
            if (result.errors.length > 5) {
              console.log(`    ... and ${result.errors.length - 5} more`);
            }
          }
          console.log(`  Duration:  ${(result.durationMs / 1000).toFixed(1)}s`);
          printCost(result.cost);

          if (result.enriched === 0 && result.errors.length === 0) {
            console.log(chalk.yellow('\nNo files needed enrichment. All images already have metadata or have been enriched.'));
          }
        }
      } catch (err) {
        console.error(chalk.red('Error:'), err instanceof Error ? err.message : err);
        process.exit(1);
      } finally {
        await fm?.shutdown();
      }
    });
}
