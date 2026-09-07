# Dark Theme — architecture overview

## Project status

| Track | Status |
|---|---|
| Implementation | Complete |
| Verification | Complete |
| Regression testing | Complete |
| Production ready | Yes |

Closed as of 2026-09-04. Remaining items are tracked as a backlog, not open
bugs — see [dark-theme-technical-debt.md](dark-theme-technical-debt.md). Any
new dark-mode issue found after this date should be filed as a fresh bug
against the specific page/component, not reopened against this project.

---

## What this covers

A full-application dark theme: a `<html class="dark">` toggle (top-right
`ThemeToggle`, persisted to `localStorage['mcm-theme']`), a palette defined
once and consumed everywhere, and a compatibility layer that catches the
pages which predate the token system.

## The token system

Three token families exist side by side. All three are legitimate; know
which one a given piece of UI is actually reading before you touch it.

**1. `--mcm-*` — the primary design tokens.** Defined in `src/index.css`
under `:root` (light) and `.dark` (dark), and aliased into Tailwind via
`@theme inline` (e.g. `--color-mcm-surface: var(--mcm-surface)`, giving
`bg-mcm-surface` etc). This is the one to reach for in new code.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--mcm-ground` | — | `#0f172a` | Page background |
| `--mcm-surface` | `#ffffff` | `#1e293b` | Card / panel background |
| `--mcm-surface-2` | — | `#1e293b` | Secondary surface |
| `--mcm-surface-3` | — | `#334155` | Raised surface (inputs, table headers) |
| `--mcm-ink` | — | `#f8fafc` | Primary text |
| `--mcm-ink-2` | — | `#cbd5e1` | Secondary text |
| `--mcm-ink-3` | — | `#94a3b8` | Placeholder / tertiary text |
| `--mcm-ink-4` | — | `#64748b` | Disabled text |
| `--mcm-line` | — | `#475569` | Primary border |
| `--mcm-line-2` | — | `#334155` | Secondary border / divider |
| `--mcm-accent` / `--mcm-accent-ink` | `#f2994a` / `#c96f1f` | `#ffab5e` / `#ffc98a` | Orange brand accent |
| `--mcm-live` / `--mcm-warn` / `--mcm-crit` / `--mcm-hold` / `--mcm-ai` | — | — | Status colors (green/amber/red/blue-ish/purple), each with a `-wash` and some with an `-edge` variant |
| `--mcm-r` / `--mcm-r-sm` / `--mcm-r-lg` | — | — | Border-radius scale (theme-independent) |
| `--mcm-shadow` / `--mcm-shadow-sm` / `--mcm-shadow-lg` | — | — | Shadow scale (theme-independent) |
| `--mcm-sans` / `--mcm-mono` | — | — | Font stacks (theme-independent) |

34 `--mcm-*` tokens are defined in total; all are referenced at least once —
none are dead.

**2. shadcn tokens** (`--background`, `--card`, `--border`, `--popover`,
`--primary`, etc). Also defined in `:root`/`.dark` in `index.css`, also
aliased via `@theme inline`. shadcn/Radix components (dialogs, dropdowns,
tooltips) read these automatically — you generally don't set them by hand.

**3. The bare `.mcm-page` token set** (`--ink`, `--surface`, `--line`,
`--accent`, `--ground`, `--accent-ink`, …) — a *separate*, deliberately
short-named set scoped to `.mcm-page` in `src/components/mcm/mcm-page.css`,
with its own `.dark .mcm-page { … }` override block. Used by
`.mcm-adminnav`, `.mcm-adminpage`, `.panel-card`, `.mcm-stickyfoot`, and any
CSS file that opts into the `.mcm-page` shell (most admin pages, including
Templates via `.mcm-adminpage:has(.templates-table)`). Because these are
bare names, a page-specific `*-glass.css`/`*-theme.css` file can — and
several did — silently redefine `--surface`/`--ink`/etc with its own
light-only literals, which locally wins over the shared `.dark .mcm-page`
block. See **Pitfall 3** below.

There is also **`.mcm-warm-glass`** (`src/styles/warm-glass.css`) — a
fourth, fully self-contained dark-aware theme scoped to Chat/Agent Chat only,
with its own `--cg-*` token names. It predates this project, is unrelated to
the compatibility-layer work, and should not be touched by future dark-theme
changes elsewhere.

## The compatibility layer

**What it is.** A block of attribute-selector rules at the end of
`src/index.css` (`.dark [class^="bg-[rgba(251,249,246"], .dark [class*=" bg-[rgba(251,249,246"] { … !important }`,
and similarly for ~8 other literal colors). Tailwind arbitrary-value classes
like `bg-[rgba(251,249,246,0.88)]` put the literal value directly into the
`class` attribute string, so an attribute selector can match — and
retheme — every file using that exact literal, present or future, without
editing the source file.

**Why it exists.** ~100+ files across the app still use light-mode literal
Tailwind classes rather than `--mcm-*` tokens. Rewriting all of them was out
of scope for this project; the catch-all is what makes those files render
correctly in Dark Mode today.

**How it's structured — base/hover split.** An early version applied
`!important` unconditionally, which also matched inside `hover:`/`focus:`-
prefixed classes (since `hover:bg-[X]` contains `bg-[X]` as a literal
substring) and made hover-only tints permanent. The fix: anchor the base
rule so it can only match the bare, unprefixed class —
`[class^="bg-[X"], [class*=" bg-[X"]` (never preceded by a space inside
`"hover:bg-[X"`) — plus a separate `[class*="hover:bg-[X"]:hover` rule with
a real `:hover` guard for the prefixed variant. Follow this same split for
any new literal added to the catch-all.

**Its limits — two categories of code it cannot reach:**
- **Inline `style` props.** The catch-all only matches the `class`
  attribute. `style={{ background: '#fff' }}` always wins regardless.
- **Anything living inside `@layer base` and marked `!important`.** See
  *CSS precedence rules* below.

## CSS precedence rules

Tailwind v4's `@import "tailwindcss"` puts Preflight/utilities into named
CSS cascade layers. This project also wraps a large amount of hand-written
CSS in `@layer base` (roughly index.css lines 333–1093). Two non-obvious
consequences follow, both discovered the hard way during this project:

1. **Without `!important`, unlayered rules always win over layered ones,**
   regardless of specificity or source order. This is why the compatibility
   layer, `.global-search-input-wrapper`'s dark block, and
   `templates-table.css`'s dark block are all placed *outside* any
   `@layer` — they only need to out-rank plain Tailwind utility classes,
   which aren't `!important`.

2. **With `!important` on both sides, the priority reverses:** a layered
   `!important` rule wins over an unlayered `!important` rule of equal or
   even higher specificity, because unlayered content is treated as the
   *lowest*-priority implicit layer once importance is being compared.
   `.custom-react-select__control { background-color: var(--color-white) !important; }`
   lives inside `@layer base`. An unlayered
   `.dark .custom-react-select__control { background-color: … !important; }`
   placed at the end of the file would silently lose to it. The fix that
   shipped instead adds the `.dark` override *inside* `@layer base`,
   immediately next to the rule it overrides — at that point normal
   specificity decides, and it wins.

**Rule of thumb:** find whichever rule you're overriding first. If it is
**not** `!important`, add your `.dark` rule anywhere with equal-or-higher
specificity — the unlayered convention (end of file, or the relevant
page's own CSS file) is fine. If it **is** `!important` and sits inside a
named `@layer`, your override must go inside that same layer, or it will
compile, look correct in the source, and still lose at runtime.

## Common pitfalls discovered during implementation

Every one of these caused a real, shipped bug during this project — each is
worth checking for specifically before marking a component "done."

**1. Inline `style` props.** Found on the global header (`style={{ background: 'rgba(255,255,255,0.78)' }}`)
and the sidebar rail (`style={{ background: '#fffaf4' }}`) — both global,
both rendered on every page, both invisible to every tool above because
none of them can see past a `style` attribute. Fix pattern: move the
color(s) out of `style` and into `className` as
`bg-[<light>] dark:bg-[<dark>]`, keeping only non-color properties
(`backdropFilter`, etc.) inline.

**2. `@layer base` + `!important`.** See *CSS precedence rules* above. This
one is easy to get backwards — adding the override in a place that looks
more prominent (end of file, its own clearly-commented block) can be
*exactly* the placement that loses.

**3. Page-specific `*-glass.css` / `*-theme.css` files.** ~22 files across
the app (`people-glass.css`, `perf-glass-theme.css`, `campaigns-theme.css`,
…) redefine the bare `.mcm-page` token names with page-specific light-only
literals. Because the names are identical to the shared token set, these
locally out-rank the shared `.dark .mcm-page` block (equal specificity,
later in source order — or, in one case, an explicit prior decision to
never respond to `.dark` at all). Each one needs its own
`.dark .gp-<page>` / `.dark .mcm-page.<page-class>` companion block. Check
for one before assuming a page is themed.

**4. Hardcoded Tailwind arbitrary color values.** `bg-[rgba(251,249,246,0.88)]`,
`text-[#2E2D35]`, `border-[#EEE7DD]`, etc, with no `dark:` counterpart. This
is what the compatibility layer exists to paper over — but a *new* instance
of this pattern in future code will not automatically pick up the
catch-all unless its exact literal is already one of the ~9 covered there.
Prefer `bg-mcm-surface`/`text-mcm-ink`/etc, or at minimum pair every
arbitrary literal with an explicit `dark:` variant.
