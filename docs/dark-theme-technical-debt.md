# Dark Theme — technical debt register

These are **future enhancements, not open bugs.** The Dark Theme project
itself is closed (see [dark-theme-architecture.md](dark-theme-architecture.md)
for status). Nothing below blocks production use of Dark Mode today — the
compatibility layer covers every item here where it applies. Pick items up
opportunistically or schedule them as a separate initiative.

| # | Item | Priority | Est. effort | Risk | Notes |
|---|---|---|---|---|---|
| 1 | Dialpad overlay Dark Theme migration | High | Large (3–5 days) | Medium | `src/components/dialpad/` — 40 files, ~10K lines, 51+ hardcoded `bg-white` instances, zero `.dark` handling. The single largest visible gap: the softphone/dialer panel is used constantly and currently renders as a stock-white panel regardless of theme. Highest user-visible impact of anything left — flagged High priority despite the effort, because it's the one place Dark Mode still visibly "breaks." Medium risk only because of surface area (40 files); the fix pattern itself (className + `dark:` variants, reusing existing `--mcm-*` tokens) is already proven elsewhere in the app. |
| 2 | Storage Billing page inline styles | Low | Medium (1 day) | Low | `src/pages/admin-settings/billing/plan/storage/index.tsx` — 28 inline `style={{}}` blocks, effectively unstyled by the design system from the start (predates Dark Theme entirely). Low traffic, single settings sub-page. Needs a light rewrite to Tailwind classes, not just a `dark:` patch, since it has no class-based styling to extend. |
| 3 | OTP input styling | Low | Small (<1 hr) | Low | `src/pages/signup/otp-verification.tsx` — one inline `backgroundColor: '#ffffff'` on the OTP digit boxes. Pre-authentication page; low exposure. Simple `className` conversion, same pattern as items already fixed on the header/sidebar. |
| 4 | Remaining pages relying on the compatibility layer | Low | Large (spread across ~100+ files) | Low | Every file still using a literal Tailwind arbitrary-value class (`bg-[rgba(251,249,246,0.88)]`, `text-[#2E2D35]`, etc.) instead of a `--mcm-*` token is, today, correctly themed *only* because the catch-all in `index.css` matches that literal. Functionally fine and stable; migrating these to token-based classes is pure hygiene, not a fix. Do incrementally, page by page, whenever a file is touched for other reasons — no need for a dedicated sweep. |
| 5 | Consolidate `*-glass.css` / `*-theme.css` duplication | Low | Medium (2–3 days) | Low | 22 page-specific stylesheets each carry their own near-identical `.dark` token-override block (see Pitfall 3 in the architecture doc). Consolidating into a shared mixin/base class would reduce duplicated CSS and the chance of a future page missing its `.dark` companion block entirely. Not urgent — each file works correctly on its own today. |
| 6 | Opportunistic audit of remaining global/shared components | Medium | Small (a few hours) | Low | Five real bugs (global header, sidebar rail, global search bar, Templates table cluster, react-select control) were found *after* Phase 3 was believed complete, all via the same two blind spots (inline `style`, `@layer base` + `!important`). Worth a focused pass over any other shared component under `src/components/custom/` and `src/components/ui/` specifically for those two patterns before assuming full coverage — the Dialpad overlay (item 1) is the only one confirmed to still have the problem, but it was found by testing, not by a systematic search of every shared component. |

## How to graduate an item off this list

1. Confirm the specific page/component and the exact literal(s)/inline
   style(s) involved (re-check — this list may drift from the code).
2. Apply the same pattern used elsewhere in this project: move color out of
   `style` into `className` with a `dark:` variant, or add a `--mcm-*`
   token-based class; place any `!important` override in the same
   `@layer` as the rule it replaces (see *CSS precedence rules* in the
   architecture doc).
3. Verify in both themes: computed styles at rest, a real mouse hover if
   the element has one, and a screenshot. Confirm Light Mode is
   byte-for-byte unaffected.
4. Run `npx tsc -b` — expect exit code 0.
5. Remove the row from this table in the same change.
