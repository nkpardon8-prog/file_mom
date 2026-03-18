#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program.name('filemom').description('AI-powered file organization tool').version('0.1.0');

// TODO: Register commands in Phase 3

program.parse();
