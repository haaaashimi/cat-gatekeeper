#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const [attemptsArg, command, ...args] = process.argv.slice(2);
const attempts = Number.parseInt(attemptsArg, 10);

if (!Number.isInteger(attempts) || attempts < 1 || !command) {
  console.error('Usage: run-with-retries.js <attempts> <command> [...args]');
  process.exit(2);
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    process.exit(0);
  }

  if (attempt === attempts) {
    process.exit(result.status ?? 1);
  }

  const delayMs = attempt * 5000;
  console.error(
    `Command failed on attempt ${attempt}/${attempts}; retrying in ${delayMs / 1000}s...`
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}
