import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAddSelected } from '../services/cardActions';

describe('handleAddSelected medien card', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds an unconfigured media card from the add menu', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const ctx = {
      pagesConfig: { home: [] },
      persistConfig: vi.fn(),
      addCardTargetPage: 'home',
      addCardType: 'medien',
      selectedEntities: [],
      cardSettings: {},
      persistCardSettings: vi.fn(),
      getCardSettingsKey: vi.fn((id) => id),
      setSelectedEntities: vi.fn(),
      setShowAddCardModal: vi.fn(),
      setShowEditCardModal: vi.fn(),
      setEditCardSettingsKey: vi.fn(),
    };

    handleAddSelected(ctx);

    expect(ctx.persistConfig).toHaveBeenCalledWith({ home: ['medien_card_1234'] });
    expect(ctx.persistCardSettings).toHaveBeenCalledWith({ medien_card_1234: {} });
    expect(ctx.setShowAddCardModal).toHaveBeenCalledWith(false);
  });
});
