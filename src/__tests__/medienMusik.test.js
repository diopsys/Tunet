import { describe, expect, it } from 'vitest';
import { eintippenIndex, interpretenText, maTitel } from '../modals/medien/musik';

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

describe('eintippenIndex', () => {
  const liste = [
    { artist: 'Atomic Kitten', name: 'You are' },
    { artist: 'Band Ohne Namen', name: 'Take My Heart' },
    { artist: 'The Bangles', name: 'Eternal Flame' },
    { artist: 'Bastille', name: 'Pompeii' },
    { artist: 'Ärzte', name: 'Schrei nach Liebe' },
  ];

  it('jumps to the first entry with that beginning, ignoring a leading "The"', () => {
    expect(eintippenIndex(liste, 'bang')).toBe(2);
    expect(eintippenIndex(liste, 'BAS')).toBe(3);
    expect(eintippenIndex(liste, 'band o')).toBe(1);
    expect(eintippenIndex(liste, 'xyz')).toBe(-1);
  });

  it('moves on to the next entry when the same single letter is typed again', () => {
    expect(eintippenIndex(liste, 'b')).toBe(1);
    expect(eintippenIndex(liste, 'b', 1)).toBe(2);
    expect(eintippenIndex(liste, 'b', 3)).toBe(1);
  });

  it('searches the titles when no artist fits', () => {
    const mit = [...liste, { artist: 'Xavier Naidoo', name: 'Holt die Seeleute heim' }, { artist: 'Helge and the Firefuckers', name: 'Hey Joe' }];
    expect(eintippenIndex(mit, 'holt')).toBe(5);
    expect(eintippenIndex(mit, 'holt d')).toBe(5);
    // Interpret geht vor: „he“ = Helge, nicht „Heart“ im Titel
    expect(eintippenIndex(mit, 'he')).toBe(6);
    expect(eintippenIndex(mit, 'holt ein')).toBe(-1);
  });

  it('ignores accents', () => {
    expect(eintippenIndex(liste, 'a', 0)).toBe(4);
  });
});
