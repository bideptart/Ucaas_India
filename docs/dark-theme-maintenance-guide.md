# Dark Theme — maintenance guide for future development

Read [dark-theme-architecture.md](dark-theme-architecture.md) first for the
token reference and the CSS precedence rules — this document is the
process checklist; that one is the "why."

## The six rules

**1. Always use existing `--mcm-*` design tokens.** `bg-mcm-surface`,
`text-mcm-ink`, `border-mcm-line`, etc. (or the raw `var(--mcm-surface)` in
CSS). Check the token table in the architecture doc before reaching for a
literal — there is almost certainly already a token for what you need.

**2. Never introduce hardcoded colors.** No new `bg-[#xxxxxx]`,
`background: rgba(...)`, or literal hex in a `style` prop. Every hardcoded
color found during this project eventually became a Dark Mode bug — most of
them shipped and went unnoticed for a while first.

**3. Avoid inline styles for themed properties.** `style={{ background,
color, borderColor }}` cannot be reached by any CSS-based dark-mode
mechanism — not the `.dark` class, not the compatibility layer. If you must
use inline `style` for something non-color (layout, `backdropFilter`,
computed values), keep color out of it and put color in `className`
instead. This exact mistake caused the global header and sidebar bugs found
during Phase 4 QA.

**4. Prefer reusable shared components.** A shared, already-themed
component (a `Button`, a `Table`, a shadcn primitive) is dark-mode-correct
by construction. A bespoke one-off `<div style={...}>` is not, and won't be
caught by anything automated.

**5. Ensure every new component supports both Light and Dark modes before
it ships.** Concretely, before calling a component done:
   - Toggle `.dark` on `<html>` (or use the app's own theme switch) and
     look at the component with no other changes.
   - Check computed `background-color`/`color` on its root and any inner
     surfaces — not just a glance, since a `transition` on a hidden/
     backgrounded tab can freeze a computed-style read at its pre-change
     value (see the architecture doc's testing note if writing an
     automated check). A real screenshot is the reliable fallback.
   - Hover/focus/active/disabled states specifically — these are the ones
     a static screenshot misses and the ones most likely to have been
     broken by an `!important` catch-all rule with no `:hover` guard.
   - If the component opens a portal (dialog, dropdown, tooltip, toast),
     check the portaled content too — it's a separate DOM subtree and easy
     to miss.

**6. Avoid page-specific themes unless absolutely necessary.** Every
`*-glass.css`/`*-theme.css` file that redefines the bare `.mcm-page` token
names (`--ink`, `--surface`, `--line`, `--accent`) instead of using the
shared `--mcm-*` tokens is a new place a future `.dark` fix can be silently
shadowed (see Pitfall 3 in the architecture doc). The one standing
exception is `.mcm-warm-glass` (Chat/Agent Chat) — a deliberate, fully
dark-aware, self-contained design already reviewed and accepted; don't use
it as precedent for a new one-off page theme.

## Before you open a PR touching color or theming

- [ ] No new literal hex/rgb color outside a `var(--mcm-*)`/token reference
- [ ] No color set via inline `style`
- [ ] Every new `.dark` override checked against *CSS precedence rules* in
      the architecture doc — if it overrides an `!important` rule inside
      `@layer base`, it lives in that same layer
- [ ] Hover/focus/disabled states checked in both themes
- [ ] Portaled content (dialogs/dropdowns/tooltips) checked in both themes
- [ ] Light Mode confirmed unchanged (toggle `.dark` off, compare)
- [ ] `npx tsc -b` — exit code 0

## When you find a new hardcoded-color file

Don't reach for the compatibility layer as the default fix — it's a
catch-all for the ~100+ files that predate this project, not a template for
new code. For a **new** instance, fix it directly (token-based class or
`dark:` variant) at the source. Only add to the compatibility layer's
literal list if you're deliberately re-theming an old, already-shipped
file the same way the rest of the catch-all does, and follow the existing
base/hover-split pattern exactly (see the architecture doc) — an
unconditional `!important` match will re-introduce the hover-state bug this
project already fixed once.
