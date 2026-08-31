// remotion/theme.ts
//
// Brand tokens for Remotion compositions.
//
// Remotion renders in its own bundle (its own webpack config, no Tailwind and
// no access to src/index.css), so the app's CSS custom properties are not
// available here. These are the hex equivalents of the light-theme tokens in
// src/index.css — keep them in sync by hand if the brand palette changes.

export const theme = {
  /** --primary: 175 85% 37% */
  primary: "#0eafa1",
  /** --sidebar-background: 213 38% 12% */
  ink: "#131d2a",
  /** --background: 210 20% 97% */
  paper: "#f5f7f9",
  white: "#ffffff",
  /** --muted-foreground: 215 16% 47% */
  muted: "#67788a",
} as const;

export const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';
