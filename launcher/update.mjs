/** Keep ordinary launches current without overwriting a user's source changes. */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const OFFICIAL = /^(?:https:\/\/github\.com\/goosnav\/gsnv-paint(?:\.git)?\/?|git@github\.com:goosnav\/gsnv-paint(?:\.git)?|ssh:\/\/git@github\.com\/goosnav\/gsnv-paint(?:\.git)?)$/i;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export function updateSource(root, { required = false, log = console.log } = {}) {
  const timeout = required ? 45_000 : 10_000;
  const git = (args, network = false) => spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: network ? timeout : 10_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, maxBuffer: 4 * 1024 * 1024,
  });
  const stop = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const keep = (code, message) => {
    if (required) stop(code, message);
    log(`gsnv-paint [${code}]: ${message}\nStarting this folder's installed source. Use --offline to skip update checks.`);
    return false;
  };
  if (!existsSync(join(root, '.git'))) return keep('UPDATE-SOURCE',
    'This is a downloaded source folder. To get new releases, replace it with the latest complete main ZIP from https://github.com/goosnav/gsnv-paint/archive/refs/heads/main.zip. Git clones update automatically.');
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return keep('UPDATE-GIT', 'Git could not read this checkout. Install Git or update this folder manually.');
  if (realpathSync(top.stdout.trim()) !== realpathSync(root)) return keep('UPDATE-SOURCE', 'This folder is not the root of its own Git checkout. Update it with your normal Git workflow.');
  const branch = git(['symbolic-ref', '--short', 'HEAD']), status = git(['status', '--porcelain', '--untracked-files=normal']), remote = git(['remote', 'get-url', 'origin']);
  if (branch.status !== 0 || branch.stdout.trim() !== 'main') return keep('UPDATE-BRANCH', 'Automatic update requires main. Your current branch was kept.');
  if (status.status !== 0 || status.stdout.trim()) return keep('UPDATE-CHANGES', 'This source folder has local changes or untracked files. Commit or move them to enable automatic updates; nothing was overwritten.');
  if (remote.status !== 0 || !OFFICIAL.test(remote.stdout.trim())) return keep('UPDATE-ORIGIN', 'Automatic update only accepts the official goosnav/gsnv-paint GitHub origin. Your remote was kept.');
  const before = git(['rev-parse', 'HEAD']);
  if (before.status !== 0 || !SHA.test(before.stdout.trim())) return keep('UPDATE-GIT', 'The installed Git revision could not be verified.');
  log('Checking the official main branch for updates…');
  const fetched = git(['-c', 'credential.interactive=false', '-c', 'core.askPass=', '-c', 'core.sshCommand=ssh -oBatchMode=yes -oConnectTimeout=8',
    'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], true);
  if (fetched.status !== 0) return keep('UPDATE-NETWORK', `The update check failed or exceeded ${timeout / 1000} seconds. Your installed files were kept. Check your connection or Git access to update.`);
  const target = git(['rev-parse', 'refs/remotes/origin/main']);
  if (target.status !== 0 || !SHA.test(target.stdout.trim())) return keep('UPDATE-GIT', 'The fetched main revision could not be verified.');
  if (target.stdout.trim() === before.stdout.trim()) { log('gsnv-paint is up to date with main.'); return false; }
  if (git(['merge-base', '--is-ancestor', before.stdout.trim(), target.stdout.trim()]).status !== 0)
    return keep('UPDATE-DIVERGED', 'Local main contains commits that cannot fast-forward to official main. Update it with your normal Git workflow; no commits were discarded.');
  const again = git(['status', '--porcelain', '--untracked-files=normal']);
  if (again.status !== 0 || again.stdout.trim() || git(['rev-parse', 'HEAD']).stdout.trim() !== before.stdout.trim()
    || git(['symbolic-ref', '--short', 'HEAD']).stdout.trim() !== 'main')
    return keep('UPDATE-CHANGES', 'The source folder changed during the update check. No merge was attempted.');
  // Use the exact inspected commit, even if another Git process moves origin/main.
  const merged = git(['merge', '--ff-only', target.stdout.trim()]);
  if (merged.status !== 0) stop('UPDATE-MERGE', `The fast-forward could not complete. No reset or forced update was attempted.\n${merged.stderr.trim()}`);
  log(`Updated main: ${before.stdout.trim().slice(0, 12)} → ${target.stdout.trim().slice(0, 12)}. Restarting the updated launcher…`);
  return true;
}
