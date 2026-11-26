/**
 * Tema claro / oscuro de MotoRide.
 *
 * - El tema efectivo vive en <html data-theme="light|dark">; los tokens están en src/index.css.
 * - La elección del usuario va en localStorage («motoride_theme»): light | dark | system.
 *   Sin elección o con «system», sigue prefers-color-scheme.
 * - public/boot.js aplica el mismo criterio antes del primer render. Si cambia aquí, cambia allí.
 * - Sin provider: el atributo en <html> basta. useTheme (src/hooks/useTheme.ts) lee y escribe.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'motoride_theme';

/** Color de la barra del navegador y del fondo de <html> por tema (mismo que --mr-page). */
const THEME_BAR_COLORS: Record<ResolvedTheme, string> = {
  light: '#f4efe6',
  dark: '#0d0c0b',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Elección guardada por el usuario. Sin dato, o si localStorage falla (modo privado), «system». */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Convierte la elección (incluida «system») en el tema real que se pinta. */
export function resolveTheme(choice: ThemeChoice = readThemeChoice()): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemPrefersDark() ? 'dark' : 'light';
}

/** Pone data-theme en <html> y actualiza las metas de la barra del navegador. */
export function applyTheme(theme: ResolvedTheme = resolveTheme()): void {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  root.style.backgroundColor = THEME_BAR_COLORS[theme];

  const bar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (bar) bar.content = THEME_BAR_COLORS[theme];
  const scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (scheme) scheme.content = theme;
}

const listeners = new Set<() => void>();
let watching = false;

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Guarda la elección, la aplica y avisa a los componentes suscritos. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale para esta sesión.
  }
  applyTheme(resolveTheme(choice));
  notify();
}

/** Escucha el cambio del sistema (si el usuario no ha elegido) y el cambio desde otra pestaña. */
function startWatching(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  try {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (readThemeChoice() === 'system') {
        applyTheme();
        notify();
      }
    });
  } catch {
    // Navegadores sin matchMedia: se queda con el tema del arranque.
  }
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme();
      notify();
    }
  });
}

export function subscribeTheme(listener: () => void): () => void {
  startWatching();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
