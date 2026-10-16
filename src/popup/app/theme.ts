import type { Settings, ThemeId } from '../../shared/timer';

// Settings load asynchronously, so the last theme and accessibility choices are
// also kept in localStorage and applied before Angular starts. Without it,
// someone who picked Dark would see a white flash every time the popup opens,
// and someone who picked large text would see it jump.
const KEY = 'tomomomento.theme';
const A11Y_KEY = 'tomomomento.a11y';

/** The page background for each theme, for the browser's own UI (address bar, title bar). */
const THEME_COLORS = { light: '#ffffff', dark: '#1c1f24' };

/** Sets <html data-theme>, which the stylesheets use to override the system preference. */
export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;

  // The web app's <meta name="theme-color"> tags follow the system by default.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.dataset['systemColor'] ??= meta.content;
    meta.content = theme === 'system' ? meta.dataset['systemColor'] : THEME_COLORS[theme];
  });

  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the theme still applies once settings load.
  }
}

export type A11ySettings = Pick<
  Settings,
  'highContrast' | 'colorSafe' | 'textSize' | 'easyFont' | 'reduceMotion'
>;

/** <html> data attributes the stylesheets key off, one per accessibility setting. */
export function a11yAttributes(a: A11ySettings): Record<string, string | undefined> {
  return {
    contrast: a.highContrast ? 'high' : undefined,
    palette: a.colorSafe ? 'safe' : undefined,
    text: a.textSize === 'normal' ? undefined : a.textSize,
    font: a.easyFont ? 'easy' : undefined,
    motion: a.reduceMotion ? 'reduce' : undefined,
  };
}

/** Sets the accessibility choices on <html> for the stylesheets. */
export function applyA11y(a: A11ySettings): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(a11yAttributes(a))) {
    if (value === undefined) delete root.dataset[key];
    else root.dataset[key] = value;
  }
  try {
    const { highContrast, colorSafe, textSize, easyFont, reduceMotion } = a;
    localStorage.setItem(
      A11Y_KEY,
      JSON.stringify({ highContrast, colorSafe, textSize, easyFont, reduceMotion }),
    );
  } catch {
    // Storage blocked: the choices still apply once settings load.
  }
}

/** Applies the theme and accessibility choices saved last time. Call before bootstrapping the app. */
export function restoreTheme(): void {
  let saved: string | null = null;
  let a11y: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
    a11y = localStorage.getItem(A11Y_KEY);
  } catch {
    return;
  }
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
  if (a11y) {
    try {
      applyA11y(JSON.parse(a11y) as A11ySettings);
    } catch {
      // A damaged copy: settings will apply the real values in a moment.
    }
  }
}
