import { describe, expect, it } from 'vitest';
import { interpretenText, maTitel } from '../modals/medien/musik';

describe('interpretenText', () => {
  it('names the album artists first and the others as guests', () => {
    const artists = [{ name: 'Beginner' }, { name: 'Das Bo' }, { name: 'Ferris MC' }];
    expect(interpretenText(artists, 1)).toBe('Beginner feat. Das Bo, Ferris MC');
  });

  it('joins all artists with a comma without a known album artist', () => {
    const artists = [{ name: 'Samy Deluxe' }, { name: 'Beginner' }];
    expect(interpretenText(artists)).toBe('Samy Deluxe, Beginner');
    expect(interpretenText(artists, 0)).toBe('Samy Deluxe, Beginner');
    expect(interpretenText(artists, 2)).toBe('Samy Deluxe, Beginner');
    expect(interpretenText(null, 1)).toBe('');
  });

  it('is used for titles from Music Assistant', () => {
    expect(maTitel({ uri: 'library://track/1', name: 'Füchse', artists: [{ name: 'Beginner' }, { name: 'Samy Deluxe' }], hauptanzahl: 1 }).artist)
      .toBe('Beginner feat. Samy Deluxe');
  });
});
