import { mkdir, open, readdir, unlink, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const validRecord = value => value && Object.getPrototypeOf(value) === Object.prototype && typeof value.projectId === 'string' && value.projectId.length > 0 && typeof value.text === 'string' && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
function validateKey(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{20}$/.test(key)) throw new TypeError('Invalid answer cache key.');
}

export function createAnswerStore({ directory, maxEntries = 150 }) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be a positive integer.');
  const memory = new Map();
  let pending = Promise.resolve();
  function mutate(action) {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  }
  const filename = key => path.join(directory, `${key}.json`);
  async function checkDirectory(create = false) {
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      if (create) await handle.chmod(0o700);
    } catch (error) {
      if (error.code === 'ENOENT') throw error;
      throw new Error('Answer cache directory must be a real accessible directory.', { cause: error });
    } finally { await handle?.close(); }
  }
  const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key);
  const remove = async key => {
    if (directory === null) memory.delete(key);
    else await unlink(filename(key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  };
  async function records(discardInvalid = false) {
    let keys;
    if (directory === null) keys = [...memory.keys()];
    else {
      try {
        await checkDirectory();
        keys = (await readdir(directory, { withFileTypes: true }))
          .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && /^[a-f0-9]{20}\.json$/.test(entry.name))
          .map(entry => entry.name.slice(0, -5));
      }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    const values = [];
    for (const key of keys) {
      const value = await store.get(key);
      if (value) values.push({ ...value, key });
      else if (discardInvalid) await remove(key);
    }
    return values.sort(newestFirst);
  }
  const store = {
    async get(key) {
      validateKey(key);
      if (directory === null) return memory.has(key) ? JSON.parse(memory.get(key)) : null;
      let file;
      try {
        await checkDirectory();
        file = await open(filename(key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const info = await file.stat();
        if (!info.isFile() || info.size > MAX_BYTES) return null;
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_BYTES) return null;
        const value = JSON.parse(buffer.toString('utf8', 0, bytesRead));
        return validRecord(value) ? value : null;
      } catch { return null; }
      finally { await file?.close(); }
    },
    async set(key, value) {
      validateKey(key);
      if (!validRecord(value)) throw new TypeError('Invalid answer record.');
      const serialized = JSON.stringify(value);
      if (Buffer.byteLength(serialized) > MAX_BYTES) throw new RangeError('Answer record is too large.');
      return mutate(async () => {
        if (directory === null) memory.set(key, serialized);
        else {
          await checkDirectory(true);
          const temporary = path.join(directory, `.${key}-${randomUUID()}.tmp`);
          let file;
          try {
            file = await open(temporary, 'wx', 0o600);
            await file.writeFile(serialized);
            await file.sync();
            await file.close();
            file = null;
            await rename(temporary, filename(key));
          } finally {
            await file?.close();
            await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
          }
        }
        for (const record of (await records(true)).slice(maxEntries)) await remove(record.key);
        return JSON.parse(serialized);
      });
    },
    async list(projectId) {
      return (await records()).filter(record => record.projectId === projectId).slice(0, maxEntries);
    },
    async clear(projectId) {
      return mutate(async () => {
        const matching = (await records()).filter(record => record.projectId === projectId);
        for (const { key } of matching) await remove(key);
        return matching.length;
      });
    },
  };
  return store;
}
