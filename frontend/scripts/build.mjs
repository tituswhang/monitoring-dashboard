#!/usr/bin/env node
/**
 * Runs `ng build` and makes sure the process actually exits.
 *
 * **Why this exists.** `@angular/build` spawns esbuild as a child process and does not
 * stop it when the bundle is finished. The child's IPC handle keeps Node's event loop
 * alive, so `ng build` writes its output, prints "Application bundle generation
 * complete", and then hangs forever. Locally that only wastes a terminal; on CI it is
 * fatal — Netlify killed the deploy after 18 minutes for a build that had finished in 15
 * seconds, and reported it as a build failure even though `dist/` was complete.
 *
 * This wrapper watches the CLI's own output, and once the build has demonstrably
 * finished it gives the process a grace period to exit on its own before terminating it.
 * The exit code still reflects the real result: a build that reports errors fails here
 * too, and one that exits cleanly is passed through untouched.
 *
 * Remove this the moment `ng build` exits on its own — check by running
 * `timeout 60 npx ng build; echo $?` and looking for something other than 124.
 */
import { spawn } from 'node:child_process';

/**
 * The CLI's two terminal states. It hangs after *either*, so both have to be watched —
 * matching only on success would leave a broken build sitting until the hard timeout,
 * failing CI with a misleading "timed out" instead of the actual compile error.
 */
const DONE = 'Application bundle generation complete';
const FAILED = 'Application bundle generation failed';
/** How long to let the CLI exit by itself after finishing, before we step in. */
const GRACE_MS = 5_000;
/** Backstop for a build that reaches neither terminal state. */
const HARD_TIMEOUT_MS = 5 * 60_000;

const child = spawn('ng', ['build', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

let finished = false;
let sawError = false;
let graceTimer;

function watch(stream, sink) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    sink.write(text);
    if (text.includes('ERROR')) sawError = true;
    if (finished) return;

    const failed = text.includes(FAILED);
    if (!failed && !text.includes(DONE)) return;
    finished = true;
    if (failed) sawError = true;

    // The build has reached a terminal state. Wait briefly in case a future CLI version
    // cleans up after itself, then stop the orphaned esbuild service by killing the tree.
    graceTimer = setTimeout(() => {
      console.log('\n[build.mjs] ng build finished but did not exit; terminating.');
      child.kill('SIGTERM');
      finish(sawError ? 1 : 0);
    }, GRACE_MS);
  });
}

watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);

const hardTimer = setTimeout(() => {
  console.error(`\n[build.mjs] no completion after ${HARD_TIMEOUT_MS / 60000}m; failing.`);
  child.kill('SIGKILL');
  finish(1);
}, HARD_TIMEOUT_MS);

function finish(code) {
  clearTimeout(graceTimer);
  clearTimeout(hardTimer);
  process.exit(code);
}

// If the CLI ever does exit on its own, its own status wins.
child.on('exit', (code) => finish(code ?? (sawError ? 1 : 0)));
child.on('error', (err) => {
  console.error('[build.mjs] failed to start ng:', err.message);
  finish(1);
});
