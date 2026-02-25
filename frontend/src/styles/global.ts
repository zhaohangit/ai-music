import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    /* Background Colors - Apple Music Light Theme */
    --bg-primary: #FFFFFF;
    --bg-secondary: #F5F5F7;
    --bg-tertiary: #FAFAFA;
    --bg-elevated: #FFFFFF;

    /* Text Colors */
    --text-primary: #1D1D1F;
    --text-secondary: #86868B;
    --text-tertiary: #6E6E73;
    --text-disabled: #AEAEB2;
    --text-inverse: #FFFFFF;

    /* Primary - Apple Music Red */
    --accent-primary: #FA2D48;
    --accent-light: #FF6B7F;
    --accent-dark: #D91E36;
    --gradient-primary: linear-gradient(135deg, #FA2D48, #FC3C44);

    /* Semantic Colors */
    --accent-success: #34C759;
    --accent-warning: #FF9500;
    --accent-error: #FF3B30;
    --accent-info: #007AFF;

    /* Surface */
    --surface-card: #FFFFFF;
    --surface-card-hover: #F9F9F9;
    --surface-border: rgba(0, 0, 0, 0.08);
    --surface-divider: rgba(0, 0, 0, 0.06);

    /* Overlay */
    --overlay-light: rgba(0, 0, 0, 0.3);
    --overlay-medium: rgba(0, 0, 0, 0.5);
    --overlay-dark: rgba(0, 0, 0, 0.7);

    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    --spacing-2xl: 48px;

    /* Border Radius - Apple rounded corners */
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-2xl: 20px;
    --radius-full: 9999px;

    /* Shadows - Apple soft shadows */
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.1);
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);

    /* Transitions */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);

    /* Z-Index */
    --z-dropdown: 1000;
    --z-sticky: 1020;
    --z-fixed: 1030;
    --z-modal-backdrop: 1040;
    --z-modal: 1050;
    --z-popover: 1060;
    --z-tooltip: 1070;
  }

  html {
    font-size: 16px;
    scroll-behavior: smooth;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
    font-size: 1rem;
    line-height: 1.4;
    color: var(--text-primary);
    background: var(--bg-secondary);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  a {
    color: var(--accent-primary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  a:hover {
    color: var(--accent-dark);
  }

  button {
    font-family: inherit;
    cursor: pointer;
    border: none;
    background: none;
    outline: none;
  }

  input,
  textarea,
  select {
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
  }

  /* Scrollbar Styles - Apple style */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-full);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.35);
  }

  /* Selection */
  ::selection {
    background: rgba(250, 45, 72, 0.2);
    color: var(--text-primary);
  }

  /* Focus Styles */
  :focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  /* Utility Classes */
  .card {
    background: var(--surface-card);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-card);
    border: 1px solid var(--surface-border);
  }

  .card-hover:hover {
    background: var(--surface-card-hover);
    box-shadow: var(--shadow-card-hover);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;
