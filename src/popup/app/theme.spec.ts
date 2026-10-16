import { DEFAULT_SETTINGS } from '../../shared/timer';
import { a11yAttributes, applyA11y, restoreTheme } from './theme';

describe('accessibility settings on <html>', () => {
  const root = document.documentElement;
  afterEach(() => {
    localStorage.clear();
    for (const key of ['contrast', 'palette', 'text', 'font', 'motion']) delete root.dataset[key];
  });

  it('sets nothing for the defaults', () => {
    expect(Object.values(a11yAttributes(DEFAULT_SETTINGS)).every((v) => v === undefined)).toBe(
      true,
    );
  });

  it('sets one attribute per choice, and clears them again', () => {
    applyA11y({
      highContrast: true,
      colorSafe: true,
      textSize: 'xlarge',
      easyFont: true,
      reduceMotion: true,
    });
    expect({ ...root.dataset }).toMatchObject({
      contrast: 'high',
      palette: 'safe',
      text: 'xlarge',
      font: 'easy',
      motion: 'reduce',
    });
    applyA11y(DEFAULT_SETTINGS);
    expect(root.dataset['contrast']).toBeUndefined();
    expect(root.dataset['text']).toBeUndefined();
  });

  it('remembers the choices so the next open starts with them', () => {
    applyA11y({ ...DEFAULT_SETTINGS, textSize: 'large', highContrast: true });
    delete root.dataset['text'];
    delete root.dataset['contrast'];
    restoreTheme();
    expect(root.dataset['text']).toBe('large');
    expect(root.dataset['contrast']).toBe('high');
  });
});
