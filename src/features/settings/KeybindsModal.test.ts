import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import KeybindsModal from './KeybindsModal.svelte';

vi.stubGlobal('chrome', {
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
});

describe('KeybindsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    const { container } = render(KeybindsModal, { props: { isOpen: false } });
    expect(container.querySelector('.bp-keybinds-modal')).toBeNull();
  });

  it('renders when open', () => {
    const { container } = render(KeybindsModal, { props: { isOpen: true } });
    expect(container.querySelector('.bp-keybinds-modal')).not.toBeNull();
  });

  it('shows the three sections', () => {
    render(KeybindsModal, { props: { isOpen: true } });
    expect(screen.getByText('Open Overlay')).toBeDefined();
    expect(screen.getByText('Navigation')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();
  });

  it('shows all configurable action rows', () => {
    render(KeybindsModal, { props: { isOpen: true } });
    expect(screen.getByText('Open / close overlay')).toBeDefined();
    expect(screen.getByText('Navigate down')).toBeDefined();
    expect(screen.getByText('Navigate up')).toBeDefined();
    expect(screen.getByText('Search')).toBeDefined();
    expect(screen.getByText('Add bookmark')).toBeDefined();
    expect(screen.getByText('Delete selected')).toBeDefined();
    expect(screen.getByText('Edit / rename')).toBeDefined();
    expect(screen.getByText('Open settings')).toBeDefined();
  });

  it('shows Reset to Defaults and Done buttons', () => {
    render(KeybindsModal, { props: { isOpen: true } });
    expect(screen.getByText('Reset to Defaults')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
  });
});
