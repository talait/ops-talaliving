/** Identity — ONE place.
 *
 *  The name here appears in the sidebar, the browser tab and the sign-in page.
 *  The colour lives in `tailwind.config.ts` (the `brand` scale). They are kept
 *  out of components deliberately, so changing the brand is not a hunt through
 *  fifty files.
 *
 *  The colour is still a placeholder. When the real one arrives, derive the
 *  WHOLE 50–950 scale from it rather than swapping `700` alone — a scale whose
 *  steps disagree shows up immediately on buttons and the sidebar — and update
 *  `BRAND` in `src/components/charts/charts.tsx` and `themeColor` in
 *  `src/app/layout.tsx` to match.
 */
export const BRAND = {
  name: "OPS TALALIVING",
  tagline: "PT TALAHOME",
  /** Used in <title>. */
  documentTitle: "Ops Talaliving",
} as const;
