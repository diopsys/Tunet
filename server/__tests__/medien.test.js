// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { playlistBereinigen } from '../routes/medien.js';

describe('playlistBereinigen', () => {
  it('keeps only titles with an uri and the known fields', () => {
    expect(playlistBereinigen({
      items: [{ uri: 'library://track/1', name: 'Eins', artist: 'Band', dauer: 200, extra: 'x' }, { name: 'ohne uri' }, null],
      index: 0,
    })).toEqual({ items: [{ uri: 'library://track/1', name: 'Eins', artist: 'Band', dauer: 200, media_type: 'track' }], index: 0 });
  });

  it('falls back to the first title for an invalid position', () => {
    const items = [{ uri: 'a' }, { uri: 'b' }];
    expect(playlistBereinigen({ items, index: 1 }).index).toBe(1);
    expect(playlistBereinigen({ items, index: 5 }).index).toBe(0);
    expect(playlistBereinigen({ items, index: '1' }).index).toBe(0);
    expect(playlistBereinigen(null)).toEqual({ items: [], index: 0 });
  });
});
