// Isolated database recovery primitive; no CLI and no default authorization.
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const execFile = promisify(execFileCallback);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function restoreDesignedS07({source, target, port, outputDir, binaries,
  authorize = async () => false}) {
  if (![source, target].every(v => /^s07_[a-z0-9_]+$/.test(v)) || source === target ||
      !Number.isInteger(port) || port < 1024 || port > 65535) throw Error('ISOLATED_DATABASE_REQUIRED');
  const binaryHashes = {};
  for (const name of ['pg_dump', 'pg_restore', 'psql']) {
    if (!binaries?.[name]?.startsWith('/')) throw Error('PINNED_BINARY_REQUIRED');
    binaryHashes[name] = sha(await readFile(binaries[name]));
  }
  const request = {operation: 'S07_DESIGNED_EXPORT_RESTORE', source, target, port, binaryHashes};
  if (await authorize(request) !== true) throw Error('BLOCKED_PREREGISTRATION_ANCHOR');
  const directory = await mkdtemp(join(outputDir, 's07-recovery-'));
  const env = {PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 's07_runner',
    PGCONNECT_TIMEOUT: '5', PGPASSFILE: '/dev/null', LANG: 'C'};
  const run = (name, args) => execFile(binaries[name], args, {env, timeout: 120000, maxBuffer: 1048576});
  const receipt = {request, status: 'STARTED', startedAt: new Date().toISOString()};
  await writeFile(join(directory, 'request.json'), JSON.stringify(receipt, null, 2), {flag: 'wx'});
  try {
    const {stdout} = await run('psql', ['-X', '--no-password', '-d', target, '-At', '-v', 'ON_ERROR_STOP=1', '-c',
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"]);
    if (stdout.trim() !== '0') throw Error('TARGET_NOT_EMPTY');
    const archive = join(directory, 'state.dump');
    await run('pg_dump', ['--no-password', '-Fc', '--no-owner', '--no-acl', '-d', source, '-f', archive]);
    receipt.archiveSha256 = sha(await readFile(archive));
    await run('pg_restore', ['--no-password', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '-d', target, archive]);
    receipt.status = 'RESTORED_NOT_SEMANTICALLY_VERIFIED';
  } catch (error) {
    receipt.status = 'FAILED'; receipt.errorCode = String(error.code || error.message).slice(0, 160);
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await writeFile(join(directory, 'result.json'), JSON.stringify(receipt, null, 2), {flag: 'wx'});
  }
  return {directory, receipt};
}
