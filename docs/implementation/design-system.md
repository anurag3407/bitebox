# Design System & UI Specifications

## 1. Visual Identity & Brand Tokens

The visual design system is inspired by industry-leading consumer food applications (Zomato), designed for high conversion, appetizing visual hierarchy, and accessible contrast ratios.

### Color Tokens
- **Brand Primary**: `#D92D47` (`rgb(217, 45, 71)`) — Signature vibrant food red.
- **Brand Light**: `#FFF1F2` — Subtle tint used for badges, active states, and highlights.
- **Brand Dark**: `#B91C1C` — Hover state for buttons and primary CTAs.
- **Success**: `#059669` (Emerald 600) — Used for Veg indicators, order confirmation, and delivered status.
- **Warning**: `#D97706` (Amber 600) — Used for Egg indicators, pending alerts, and SLA warnings.
- **Danger**: `#DC2626` (Red 600) — Used for Non-Veg indicators, order rejections, and refund triggers.
- **Text Primary**: `#0F172A` (Slate 900) — Deep neutral for high-contrast readability.
- **Text Secondary**: `#64748B` (Slate 500) — Subtle neutral for descriptions, timestamps, and subtitles.
- **Surface Muted**: `#F8FAFC` (Slate 50) — Background fills for cards, carousels, and search inputs.
- **Border**: `#E2E8F0` (Slate 200) — Subtle dividers and card outlines.

### Typography
- Primary Font Stack: Inter, system-ui, -apple-system, sans-serif.
- Weights:
  - **Regular (400)**: Descriptive body text, addresses, item descriptions.
  - **Medium (500)**: Navigation links, metadata pills, table cell values.
  - **Bold (700)**: Section headers, dish titles, prices, CTAs.
  - **Black (900)**: Primary hero branding, SLA countdown timer numbers, delivery OTP display.

---

## 2. Core Reusable Components

1. **Header Navigation**:
   - Location selector with real-time zone detection.
   - Persona switcher pill allowing instant 1-click toggling between Customer, Merchant, Rider, and Admin.
   - Live cart drawer trigger with animated item counter.
2. **CuisineRail & FilterBar**:
   - Horizontal scrolling carousel of popular Indian culinary categories (Biryani, North Indian, Rolls, Pizza, Desserts).
   - Fast filter chips (Pure Veg, Rating 4.0+, Under 30 mins).
3. **RestaurantCard**:
   - High-aspect food cover image with subtle gradient overlay.
   - Rating badge, preparation + delivery ETA badge, distance estimation, and price for two.
4. **ItemCustomizerModal**:
   - Food dietary symbol (Veg green square/circle, Non-Veg red triangle).
   - Required and optional modifier option groups with min/max constraint validation.
   - Live price summation calculating base dish price + selected add-ons.
5. **CartBar & Drawer**:
   - Floating persistent bottom bar indicating items, bill subtotal, and checkout CTA.
6. **Timeline Tracker**:
   - Vertical multi-step order timeline with active pulsing states and completed checkmarks.
   - Visual 6-digit delivery OTP box for rider verification at delivery handover.
