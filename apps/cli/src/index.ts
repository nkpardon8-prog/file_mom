#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { registerInit } from './commands/init.js';
import { registerAdd } from './commands/add.js';
import { registerScan } from './commands/scan.js';
import { registerSearch } from './commands/search.js';
import { registerStatus } from './commands/status.js';
import { registerPlan } from './commands/plan.js';
import { registerEnrich } from './commands/enrich.js';
import { registerExecute } from './commands/execute.js';
import { registerUndo } from './commands/undo.js';
import { registerWatch } from './commands/watch.js';

const program = new Command();

program
  .name('filemom')
  .description('AI-powered file organization tool')
  .version('0.1.0');

// Register all commands
registerInit(program);
registerAdd(program);
registerScan(program);
registerSearch(program);
registerStatus(program);
registerPlan(program);
registerEnrich(program);
registerExecute(program);
registerUndo(program);
registerWatch(program);

program.parse();
