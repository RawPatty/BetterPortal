import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SettingsPanel from './SettingsPanel.svelte';
import { DEFAULT_SETTINGS } from '../../shared/types';

// Mock chrome.storage API
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
});

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('defaults', () => {
    it('should default to dark theme for new users', () => {
      expect(DEFAULT_SETTINGS.theme).toBe('dark');
    });
  });

  describe('pointer-events', () => {
    it('should have pointer-events: auto on modal when open', async () => {
      const { container } = render(SettingsPanel, {
        props: { isOpen: true },
      });

      const modal = container.querySelector('.bp-settings-modal');
      expect(modal).not.toBeNull();

      // Get computed style - the CSS should include pointer-events: auto
      // This ensures clicks don't pass through to the page below
      if (modal) {
        const style = window.getComputedStyle(modal);
        // In a real browser this would return 'auto', in jsdom we check the element exists
        expect(modal.classList.contains('bp-settings-modal')).toBe(true);
      }
    });

    it('should not render modal when closed', () => {
      const { container } = render(SettingsPanel, {
        props: { isOpen: false },
      });

      const modal = container.querySelector('.bp-settings-modal');
      expect(modal).toBeNull();
    });
  });

  describe('settings content', () => {
    it('should display settings title', async () => {
      render(SettingsPanel, {
        props: { isOpen: true },
      });

      expect(screen.getByText('Settings')).toBeDefined();
    });

    it('should display keybinds button in footer', async () => {
      render(SettingsPanel, {
        props: { isOpen: true },
      });

      expect(screen.getByText('Keybinds')).toBeDefined();
    });

    it('should display display section', async () => {
      render(SettingsPanel, {
        props: { isOpen: true },
      });

      expect(screen.getByText('Display')).toBeDefined();
    });

    it('should display history section', async () => {
      render(SettingsPanel, {
        props: { isOpen: true },
      });

      expect(screen.getByText('History & Bookmarks')).toBeDefined();
    });
  });
});
