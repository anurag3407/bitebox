# BiteBox Design System

Minimal, spacious and calm. Food photography carries the colour; the interface stays out of the way.
Tokens live in `apps/web/tailwind.config.ts`; component classes live in `apps/web/src/app/globals.css`.

## Principles

1. **One primary action per screen.** It is the only near-black filled button in view.
2. **Space over lines.** Sections are separated by whitespace and a single hairline, not boxes inside boxes.
3. **Colour means something.** Neutrals for everything; the accent for brand moments only; green/red/amber only for status.
4. **Phone first.** Bottom sheets instead of centred dialogs, a sticky pay bar in checkout, 44px+ tap targets.
5. **No native dialogs.** `window.confirm`/`prompt` are replaced by `ActionDialog`.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#111111` | Text, primary buttons, selected chips/tabs |
| `ink-soft` | `#4A4A4A` | Secondary body text |
| `ink-muted` | `#8A8A8A` | Metadata, hints, placeholders |
| `line` / `line-strong` | `#ECECEC` / `#D6D6D6` | Hairlines, input borders |
| `subtle` | `#F6F6F4` | Panels, skeletons, secondary buttons |
| `accent` / `accent-soft` | `#F0532D` / `#FFF2ED` | Logo, bestseller labels, offers, unread badges |
| `success` / `danger` / `warn` (+ `-soft`) | `#15803D` / `#C62828` / `#A15C07` | Veg marks, status, destructive actions, notices |

- **Type:** Inter (self-hosted via `next/font`). Weights 400/500/600 only. Headings `font-semibold tracking-tight`.
- **Radius:** inputs `rounded-2xl`, cards and panels `rounded-3xl`, buttons and chips fully round.
- **Elevation:** `shadow-soft` for floating controls; `shadow-pop` for menus, toasts, sheets and the cart bar.

## Component classes

| Class | Purpose |
| --- | --- |
| `page`, `page-narrow` | Content width (72rem / 42rem) with 20–32px gutters |
| `h-display`, `h-page`, `h-section`, `eyebrow`, `link` | Type scale |
| `btn` + `btn-primary` / `btn-secondary` / `btn-outline` / `btn-ghost` / `btn-success` / `btn-danger` / `btn-danger-ghost`; sizes `btn-sm`, `btn-lg`, `btn-icon`, `btn-block` | Buttons |
| `input` (+ `input-sm`), `label`, `hint`, `checkbox` | Form controls |
| `chip` (selected via `aria-pressed`/`aria-checked`) | Filters and single-choice options |
| `tabs` + `tab` (selected via `aria-selected`) | Underline tabs |
| `card`, `panel`, `rows`, `skeleton` | Surfaces and lists |
| `badge-*`, `notice-*` | Status |
| `stepper` | Quantity control |

## React primitives

- `components/brand/logo.tsx` — `Logo`, `LogoMark` (the bitten box; same geometry as `scripts/generate-icons.mjs`).
- `components/ui/modal.tsx` — `Modal` (bottom sheet on phones), `ActionDialog` (confirm or short text input).
- `components/ui/field.tsx` — `Field`, `PhoneInput`, `MoneyInput` (keeps partial input like `12.`), `Toggle`.
- `components/ui/misc.tsx` — `SafeImage`, `VegMark`, `Spinner`, `PageSpinner`, `EmptyState`, `Stat`.
- `components/ui/toast.tsx` — `useToast()`.

Regenerate PWA icons after changing the mark or accent: `node apps/web/scripts/generate-icons.mjs`.
