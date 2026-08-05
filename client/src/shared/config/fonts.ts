/**
 * Fonts.
 *
 * System font stacks are used instead of `next/font/google` so production
 * builds never depend on an outbound fetch to Google Fonts (offline/CI builds
 * fail hard on that). The actual stacks are defined in `globals.css` under
 * `:root` (`--font-sans`, `--font-mono`, `--font-body`); `fontVariables` is
 * kept as a no-op so `layout.tsx` stays unchanged.
 */
export const fontVariables = "";
