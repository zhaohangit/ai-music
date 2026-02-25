export const theme = {
  // Colors - Apple Music Style
  colors: {
    // Background - Light mode like Apple Music
    background: {
      primary: '#FFFFFF',
      secondary: '#F5F5F7',
      tertiary: '#FAFAFA',
      elevated: '#FFFFFF',
    },
    // Text - Dark on light
    text: {
      primary: '#1D1D1F',
      secondary: '#86868B',
      tertiary: '#6E6E73',
      disabled: '#AEAEB2',
      inverse: '#FFFFFF',
    },
    // Primary - Apple Music Red
    primary: {
      main: '#FA2D48',
      light: '#FF6B7F',
      dark: '#D91E36',
      gradient: 'linear-gradient(135deg, #FA2D48, #FC3C44)',
    },
    // Secondary
    secondary: {
      main: '#FC3C44',
      light: '#FF6B7F',
      dark: '#D91E36',
    },
    // Semantic
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',

    // Card & Surface
    surface: {
      card: '#FFFFFF',
      cardHover: '#F9F9F9',
      border: 'rgba(0, 0, 0, 0.08)',
      divider: 'rgba(0, 0, 0, 0.06)',
    },

    // Overlay
    overlay: {
      light: 'rgba(0, 0, 0, 0.3)',
      medium: 'rgba(0, 0, 0, 0.5)',
      dark: 'rgba(0, 0, 0, 0.7)',
    },
  },

  // Typography - Apple SF Pro Style
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    fontSize: {
      xs: '0.6875rem',   // 11px
      sm: '0.8125rem',   // 13px
      base: '1rem',      // 16px
      lg: '1.125rem',    // 18px
      xl: '1.3125rem',   // 21px
      '2xl': '1.625rem', // 26px
      '3xl': '2rem',     // 32px
      '4xl': '2.5rem',   // 40px
      '5xl': '3.25rem',  // 52px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6,
    },
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
    '4xl': '96px',
  },

  // Border Radius - Apple rounded corners
  borderRadius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '28px',
    full: '9999px',
  },

  // Shadows - Apple style soft shadows
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 2px 8px rgba(0, 0, 0, 0.06)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.1)',
    xl: '0 12px 40px rgba(0, 0, 0, 0.12)',
    card: '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    cardHover: '0 4px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    button: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },

  // Transitions - Apple smooth animations
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
    spring: '400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Z-Index
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
};

export type Theme = typeof theme;
