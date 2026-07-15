/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file publishing (add / remove / list / fetch).
 *
 * These are pure filesystem tests — the controller has no git and no daemon in it.
 */

import { mkdtemp, rm, readdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  addStatusFile,
  removeStatusFile,
  listStatusFiles,
  readStatusFile,
  getStatusDir,
  MAX_STATUS_BYTES
} from '../../src/controllers/statusFileController.js';

const NUL = String.fromCharCode(0);

let baseDir;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'sparkle-statusfile-'));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe('addStatusFile', () => {
  it('creates the status directory on first publish', async () => {
    const result = await addStatusFile(baseDir, 'build-report.json', '{"build":"green"}');

    expect(result).toMatchObject({ name: 'build-report.json', created: true });
    expect(await readStatusFile(baseDir, 'build-report.json')).toBe('{"build":"green"}');
  });

  it('replaces existing content wholesale rather than merging it', async () => {
    // The core invariant: what is on disk is always exactly what a publisher submitted.
    await addStatusFile(baseDir, 'ci.json', '{\n  "build": "green",\n  "deploy": "green"\n}');
    const second = await addStatusFile(baseDir, 'ci.json', '{\n  "build": "RED"\n}');

    expect(second.created).toBe(false);
    expect(await readStatusFile(baseDir, 'ci.json')).toBe('{\n  "build": "RED"\n}');
    // Nothing of the first report may survive.
    expect(await readStatusFile(baseDir, 'ci.json')).not.toMatch(/deploy/);
  });

  it('reports created:false when updating', async () => {
    expect((await addStatusFile(baseDir, 'a.txt', 'one')).created).toBe(true);
    expect((await addStatusFile(baseDir, 'a.txt', 'two')).created).toBe(false);
  });

  it('stores the file under its encoded name', async () => {
    await addStatusFile(baseDir, 'Build Report.json', 'x');
    const onDisk = await readdir(getStatusDir(baseDir));

    expect(onDisk).toEqual(['%42uild%20%52eport.json']);
    // ...but the caller only ever sees the real name.
    expect((await listStatusFiles(baseDir))[0].name).toBe('Build Report.json');
  });

  it('keeps names that differ only by case as separate files', async () => {
    // On case-insensitive APFS/NTFS these would otherwise be one file.
    await addStatusFile(baseDir, 'build', 'lower');
    await addStatusFile(baseDir, 'Build', 'upper');

    expect(await readStatusFile(baseDir, 'build')).toBe('lower');
    expect(await readStatusFile(baseDir, 'Build')).toBe('upper');
    expect((await readdir(getStatusDir(baseDir))).length).toBe(2);
  });

  it.each(['ci/build.json', '../escape', '..', '.'])('refuses path attempt %j', async (name) => {
    await expect(addStatusFile(baseDir, name, 'x')).rejects.toThrow();
  });

  it('never writes outside the status directory', async () => {
    await addStatusFile(baseDir, 'safe.txt', 'x');
    await expect(addStatusFile(baseDir, '../../escaped.txt', 'pwned')).rejects.toThrow(/path separator/i);

    expect(await readdir(baseDir)).toEqual(['status']);
    expect(await readdir(getStatusDir(baseDir))).toEqual(['safe.txt']);
  });

  it('rejects binary content', async () => {
    await expect(addStatusFile(baseDir, 'b.bin', 'a' + NUL + 'b')).rejects.toThrow(/text/i);
  });

  it('rejects content over the size cap', async () => {
    const tooBig = 'a'.repeat(MAX_STATUS_BYTES + 1);
    await expect(addStatusFile(baseDir, 'big.txt', tooBig)).rejects.toThrow(/too large/i);
  });

  it('accepts content exactly at the size cap', async () => {
    const exact = 'a'.repeat(MAX_STATUS_BYTES);
    await expect(addStatusFile(baseDir, 'exact.txt', exact)).resolves.toMatchObject({
      bytes: MAX_STATUS_BYTES
    });
  });

  it('leaves no temp file behind', async () => {
    await addStatusFile(baseDir, 'report.txt', 'content');
    const onDisk = await readdir(getStatusDir(baseDir));

    expect(onDisk).toEqual(['report.txt']);
    expect(onDisk.some(f => f.includes('.tmp.'))).toBe(false);
  });

  it('preserves content byte-for-byte, including unicode and trailing newline', async () => {
    const content = '{"status":"héllo 😀","n":1}\n';
    await addStatusFile(baseDir, 'unicode.json', content);

    expect(await readStatusFile(baseDir, 'unicode.json')).toBe(content);
  });
});

describe('removeStatusFile', () => {
  it('removes a published file', async () => {
    await addStatusFile(baseDir, 'gone.txt', 'x');
    await expect(removeStatusFile(baseDir, 'gone.txt')).resolves.toEqual({ name: 'gone.txt' });

    expect(await listStatusFiles(baseDir)).toEqual([]);
  });

  it('errors when the file does not exist', async () => {
    await expect(removeStatusFile(baseDir, 'never-existed.txt')).rejects.toThrow(/not found/i);
  });

  it('errors when removing the same file twice', async () => {
    await addStatusFile(baseDir, 'once.txt', 'x');
    await removeStatusFile(baseDir, 'once.txt');

    await expect(removeStatusFile(baseDir, 'once.txt')).rejects.toThrow(/not found/i);
  });
});

describe('listStatusFiles', () => {
  it('returns empty when nothing has ever been published', async () => {
    expect(await listStatusFiles(baseDir)).toEqual([]);
  });

  it('reports decoded name, size and modified time', async () => {
    await addStatusFile(baseDir, 'report.json', '12345');
    const [entry] = await listStatusFiles(baseDir);

    expect(entry.name).toBe('report.json');
    expect(entry.size).toBe(5);
    expect(() => new Date(entry.modified).toISOString()).not.toThrow();
  });

  it('lists every published file', async () => {
    await addStatusFile(baseDir, 'a.txt', 'a');
    await addStatusFile(baseDir, 'b.txt', 'b');
    await addStatusFile(baseDir, 'c.txt', 'c');

    const names = (await listStatusFiles(baseDir)).map(f => f.name).sort();
    expect(names).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('ignores in-flight temp files', async () => {
    await addStatusFile(baseDir, 'real.txt', 'x');
    await writeFile(join(getStatusDir(baseDir), 'real.txt.tmp.999.abc'), 'half-written');

    expect((await listStatusFiles(baseDir)).map(f => f.name)).toEqual(['real.txt']);
  });
});

describe('readStatusFile', () => {
  it('errors when the file does not exist', async () => {
    await expect(readStatusFile(baseDir, 'nope.txt')).rejects.toThrow(/not found/i);
  });

  it('round-trips an awkward name', async () => {
    await addStatusFile(baseDir, 'CON', 'reserved-on-windows');
    expect(await readStatusFile(baseDir, 'CON')).toBe('reserved-on-windows');
  });
});
