import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :root {
    /* Background Colors */
    --bg-gradient-start: #0F0F23;
    --bg-gradient-mid: #1A1A2E;
    --bg-gradient-end: #16213E;

    /* Text Colors */
    --text-primary: #FFFFFF;
    --text-secondary: #8B8B9F;
    --text-accent: #667EEA;

    /* Gradient */
    --gradient-primary: linear-gradient(135deg, #667EEA, #764BA2);
    --gradient-secondary: linear-gradient(135deg, #F093FB, #F5576C);

    /* Glass Effect */
    --glass-bg: rgba(255, 255, 255, 0.05);
    --glass-border: rgba(255, 255, 255, 0.1);
    --glass-shadow: rgba(0, 0, 0, 0.2);

    /* Accent Colors */
    --accent-primary: #667EEA;
    --accent-secondary: #764BA2;
    --accent-success: #10B981;
    --accent-warning: #F59E0B;
    --accent-error: #EF4444;

    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    --spacing-2xl: 48px;

    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-full: 9999px;

    /* Transitions */
    --transition-fast: 150ms ease;
    --transition-normal: 250ms ease;
    --transition-slow: 350ms ease;

    /* Z-Index */
    --z-dropdown: 1000;
    --z-sticky: 1020;
    --z-fixed: 1030;
    --z-modal-backdrop: 1040;
    --z-modal: 1050;
    --z-popover: 1060;
    --z-tooltip: 1070;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: var(--text-primary);
    background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-mid), var(--bg-gradient-end));
    background-attachment: fixed;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    min-height: 100vh;
  }

  a {
    color: var(--text-accent);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  a:hover {
    color: var(--accent-secondary);
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

  /* Scrollbar Styles */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--glass-bg);
    border-radius: var(--radius-full);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--glass-border);
    border-radius: var(--radius-full);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* Selection */
  ::selection {
    background: var(--accent-primary);
    color: var(--text-primary);
  }

  /* Focus Styles */
  :focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  /* Utility Classes */
  .glass {
    background: var(--glass-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--glass-border);
  }

  .gradient-text {
    background: var(--gradient-primary);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
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
