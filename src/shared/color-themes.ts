// Color themes: other sets of phase colors in place of the classic orange,
// green and blue. Light colors carry white text and dark ones dark text at
// 4.5:1 or more, like the classic set. The popup's stylesheet repeats these
// (see styles.css); this copy colors the toolbar badge.

import type { Phase } from './timer';

export type ColorThemeId = 'classic' | 'forest' | 'ocean' | 'sunset' | 'lavender';

export interface ColorTheme {
  label: string;
  /** Focus, short break and long break, on a light background. */
  light: Record<Phase, string>;
}

export const COLOR_THEMES: Record<ColorThemeId, ColorTheme> = {
  classic: {
    label: 'Classic',
    light: { work: '#c2410c', shortBreak: '#2b7a3b', longBreak: '#1971c2' },
  },
  forest: {
    label: 'Forest',
    light: { work: '#2b6e3f', shortBreak: '#8b5a2b', longBreak: '#2f6f8f' },
  },
  ocean: {
    label: 'Ocean',
    light: { work: '#0b6e99', shortBreak: '#0f7c74', longBreak: '#4a5bb5' },
  },
  sunset: {
    label: 'Sunset',
    light: { work: '#c2255c', shortBreak: '#a85400', longBreak: '#7048a8' },
  },
  lavender: {
    label: 'Lavender',
    light: { work: '#7e3fb0', shortBreak: '#a23b72', longBreak: '#3d5fa8' },
  },
};
