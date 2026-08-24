/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#18332B',
    tint: '#2F765B',

    // Core surfaces
    background: '#F4F7F0',
    foreground: '#18332B',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#18332B',

    // Primary action color (buttons, links, active states)
    primary: '#2F765B',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E6EFE5',
    secondaryForeground: '#285641',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EAF0E7',
    mutedForeground: '#6C7E70',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#F2C76E',
    accentForeground: '#5F4613',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#DCE6D9',
    input: '#DCE6D9',
  },

  dark: {
    text: '#EAF4E8',
    tint: '#8AC7A4',
    background: '#10201A',
    foreground: '#EAF4E8',
    card: '#193027',
    cardForeground: '#EAF4E8',
    primary: '#8AC7A4',
    primaryForeground: '#10201A',
    secondary: '#244137',
    secondaryForeground: '#EAF4E8',
    muted: '#1C352B',
    mutedForeground: '#A5B9A9',
    accent: '#E8BA61',
    accentForeground: '#2E2109',
    destructive: '#F07D70',
    destructiveForeground: '#2A100D',
    border: '#2A493B',
    input: '#2A493B',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
