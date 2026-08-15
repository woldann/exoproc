import { themeDark } from 'dockview-react';

/**
 * dockview's built-in dark theme already uses this codebase's exact palette
 * (`--dv-group-view-background-color: #1e1e1e`,
 * `--dv-tabs-and-actions-container-background-color: #252526`) -- these
 * overrides only add what the built-in theme doesn't cover: a monospace tab
 * font (matching every other panel header in the debugger) and the
 * `#007acc` active-tab accent used throughout `chrome.tsx`'s `PanelTab`.
 */
export const DOCKVIEW_THEME_CSS = `
  .dockview-theme-dark {
    --dv-tabs-and-actions-container-font-size: 11px;
  }
  .dockview-theme-dark .dv-tab {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .dockview-theme-dark .dv-groupview.dv-active-group > .dv-tabs-and-actions-container .dv-tab.dv-active-tab {
    border-top: 2px solid #007acc;
  }
  .dockview-theme-dark .dv-groupview.dv-inactive-group > .dv-tabs-and-actions-container .dv-tab.dv-active-tab {
    border-top: 2px solid #3c3c3c;
  }
`;

export { themeDark };
