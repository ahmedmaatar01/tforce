import { IReadonlyTheme } from '@microsoft/sp-component-base';

/** Passes the SharePoint theme colours to the CSS variables used by the web parts. */
export function applyTheme(el: HTMLElement, theme: IReadonlyTheme | undefined): void {
  if (!theme || !theme.semanticColors) return;
  const c = theme.semanticColors;
  el.style.setProperty('--bodyText', c.bodyText || null);
  el.style.setProperty('--link', c.link || null);
  el.style.setProperty('--linkHovered', c.linkHovered || null);
}
