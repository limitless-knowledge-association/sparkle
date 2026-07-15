/**
 * Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.
 *
 * Status file name encoding.
 *
 * The encoder exists because encodeURIComponent is not safe across macOS/Linux/Windows.
 * Each hazard below is a real, measured failure of encodeURIComponent, so these tests
 * are written to fail if anyone ever "simplifies" the encoder back to it.
 */

import { encodeStatusName, decodeStatusName, validateStatusName } from '../../src/statusFileName.js';

/** Illegal in a Windows filename. */
const WINDOWS_ILLEGAL = /[<>:"/\\|?*]/;
/** Reserved device names; uncreatable on Windows even with an extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

const HAZARDS = [
  '..', '.', '../../etc/passwd', 'a/b', 'CON', 'con.txt', 'NUL', 'aux', 'COM1', 'LPT9',
  'star*name', "quote'name", 'tilde~name', 'bang!name', 'paren(1)', 'trailingdot.',
  'trailing space ', 'Build', 'build', 'BUILD', 'héllo', 'back\\slash', 'colon:name',
  'pipe|name', 'quest?name', 'lt<gt>name', 'build-report.json', 'nightly.html',
  'a b', '.hidden', 'emoji\u{1F600}', '%2e%2e', 'already%20encoded'
];

/** Names a caller may legitimately publish; these must survive untouched. */
const READABLE = ['build-report.json', 'nightly.html', 'coverage.txt', 'ci-status', 'a.b.c'];

describe('encodeStatusName', () => {
  describe.each(HAZARDS.filter(n => !n.includes('/') && !n.includes('\\') && n !== '.' && n !== '..'))(
    'encoding %j',
    (name) => {
      const encoded = () => encodeStatusName(name);

      it('never yields a path separator or dot segment', () => {
        const e = encoded();
        expect(e).not.toMatch(/[/\\]/);
        expect(e).not.toBe('.');
        expect(e).not.toBe('..');
      });

      it('never yields a character Windows forbids', () => {
        expect(encoded()).not.toMatch(WINDOWS_ILLEGAL);
      });

      it('never yields a Windows reserved device name', () => {
        expect(encoded()).not.toMatch(WINDOWS_RESERVED);
      });

      it('never yields a trailing dot or space (Windows strips them)', () => {
        expect(encoded()).not.toMatch(/[. ]$/);
      });

      it('yields no uppercase, so it cannot collide on a case-insensitive filesystem', () => {
        expect(encoded()).not.toMatch(/[A-Z]/);
      });

      it('round-trips back to the original name', () => {
        expect(decodeStatusName(encoded())).toBe(name);
      });
    }
  );

  it('keeps ordinary names readable', () => {
    for (const name of READABLE) {
      expect(encodeStatusName(name)).toBe(name);
    }
  });

  it('maps names differing only by case to distinct files', () => {
    // The real hazard: on APFS/NTFS 'Build' and 'build' are the SAME file.
    const encodings = ['Build', 'build', 'BUILD'].map(encodeStatusName);
    const caseFolded = encodings.map(e => e.toLowerCase());
    expect(new Set(caseFolded).size).toBe(3);
  });

  it.each(['..', '.', 'ci/build.json'])('refuses traversal attempt %j outright', (name) => {
    // Policy: a path attempt fails loudly rather than being silently encoded into
    // something inert. Encoding is the second line of defence, not the first.
    expect(() => encodeStatusName(name)).toThrow();
  });

  it('still neutralises leading/trailing dots on names that ARE legal', () => {
    // '.hidden' and 'trailingdot.' are legitimate names, but a leading dot makes a
    // hidden file and Windows silently strips a trailing dot (aliasing two names
    // onto one file). Both must survive as distinct, visible, round-tripping files.
    expect(encodeStatusName('.hidden')).toBe('%2ehidden');
    expect(encodeStatusName('trailingdot.')).toBe('trailingdot%2e');
    expect(decodeStatusName(encodeStatusName('.hidden'))).toBe('.hidden');
    expect(decodeStatusName(encodeStatusName('trailingdot.'))).toBe('trailingdot.');
    expect(encodeStatusName('trailingdot.')).not.toBe(encodeStatusName('trailingdot'));
  });

  it('distinguishes a literal percent from an encoding artifact', () => {
    // '%2e%2e' as a NAME must not decode back to '..'
    const encoded = encodeStatusName('%2e%2e');
    expect(decodeStatusName(encoded)).toBe('%2e%2e');
  });

  it('rejects a name that is too long once encoded', () => {
    expect(() => encodeStatusName('é'.repeat(100))).toThrow(/too long/i);
  });
});

describe('validateStatusName', () => {
  it.each(['ci/build.json', 'a/b', '../../etc/passwd', 'back\\slash', 'dir\\file.txt'])(
    'rejects sub-directory attempt %j with a clear message',
    (name) => {
      expect(() => validateStatusName(name)).toThrow(/path separator/i);
    }
  );

  it.each(['.', '..'])('rejects dot segment %j', (name) => {
    expect(() => validateStatusName(name)).toThrow(/invalid/i);
  });

  it.each([['', 'empty'], [undefined, 'undefined'], [null, 'null'], [42, 'a number']])(
    'rejects %s name',
    (name) => {
      expect(() => validateStatusName(name)).toThrow(/required/i);
    }
  );

  it('rejects control characters', () => {
    expect(() => validateStatusName('a' + String.fromCharCode(0) + 'b')).toThrow(/control/i);
    expect(() => validateStatusName('a' + String.fromCharCode(31) + 'b')).toThrow(/control/i);
    expect(() => validateStatusName('a' + String.fromCharCode(127) + 'b')).toThrow(/control/i);
  });

  it('accepts ordinary published names', () => {
    for (const name of READABLE) {
      expect(() => validateStatusName(name)).not.toThrow();
    }
  });
});
