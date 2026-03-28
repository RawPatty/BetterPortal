import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './types';

describe('DEFAULT_SETTINGS.overlayKeybinds', () => {
  it('has all expected keybind fields with correct defaults', () => {
    const kb = DEFAULT_SETTINGS.overlayKeybinds;
    expect(kb.navDown).toEqual({ key: 'j', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.navUp).toEqual({ key: 'k', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.search).toEqual({ key: '/', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.add).toEqual({ key: 'a', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.delete).toEqual({ key: 'd', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.edit).toEqual({ key: 'e', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.settings).toEqual({ key: '?', ctrl: false, shift: true, alt: false, meta: false });
    expect(kb.yank).toEqual({ key: 'y', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.openNewTab).toEqual({ key: 't', ctrl: false, shift: false, alt: false, meta: false });
    expect(kb.halfPageDown).toEqual({ key: 'd', ctrl: true, shift: false, alt: false, meta: false });
    expect(kb.halfPageUp).toEqual({ key: 'u', ctrl: true, shift: false, alt: false, meta: false });
  });
});
