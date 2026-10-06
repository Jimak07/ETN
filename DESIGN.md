# Web3 Dark-Mode Design System (`DESIGN.md`)

This document defines the strict dark-mode Web3 design system for the ETN Pulse Multi-Sender dApp. All UI components, panels, cards, inputs, buttons, and alerts must adhere strictly to these visual guidelines and architectural patterns.

---

## 1. Core Visual Principles

### 1.1 Canvas & Background Surfaces
- **App Background:** Deep Slate / Obsidian Black (`#020617` / Tailwind `bg-slate-950` or `bg-black`).
- **Card & Surface Backgrounds:** Elevated translucent slate panels with backdrop blur:
  - Base Card: `bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-xl`
  - Nested / Secondary Panels: `bg-slate-950/50 border border-slate-800/80 rounded-xl`
  - Subtle top hairline gradient: `linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.25), transparent)`

### 1.2 Accent & Glow Palette
- **Primary Accent:** Vibrant Cyan / Electric Blue (`#22d3ee`, `#06b6d4` / Tailwind `cyan-400`, `cyan-500`).
- **Action Highlight Glow:**
  - `shadow-glow`: `0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 28px -4px rgba(34, 211, 238, 0.45)`
  - Active button state: `bg-cyan-400 text-slate-950 font-semibold hover:bg-cyan-300 hover:shadow-glow transition duration-200`
- **Secondary Interactive Accents:**
  - Outlined button: `border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20`

### 1.3 Borders & Geometry
- **Hairline Borders:** Subtle slate borders (`border-slate-800` or `border-slate-800/80`) to provide clean separation without visual noise.
- **Corner Radii:** Uniform rounded corners using `rounded-xl` (12px) for cards, inputs, and modals, and `rounded-lg` (8px) for buttons, badges, and table cells.

### 1.4 Typography
- **Primary Font:** Clean, modern sans-serif: Inter (`font-sans`, `sans-serif`).
- **Numerical & Address Font:** Monospace with tabular numerals (`font-mono tabular-nums tracking-tight`) so that Ethereum addresses, Token IDs, amounts, and decimals align cleanly without layout shifts.

### 1.5 Validation & Status Colors
- **Healthy / Valid:** Mint Emerald (`#34d399`, `text-emerald-400`, `border-emerald-500/30`, `bg-emerald-950/20`).
- **Warning / Degraded:** Warm Amber (`#fbbf24`, `text-amber-400`, `border-amber-500/30`, `bg-amber-950/20`).
- **Error / Malformed Address:** Rose Red (`#f43f5e`, `text-rose-400`, `border-rose-500/50`, `bg-rose-950/30`):
  - Row error highlighting: invalid address input gets `border-rose-500/70 bg-rose-950/20 text-rose-200 focus:ring-rose-500/20`.
  - Accompanying inline alert: Rose-themed `Alert` badge with clear actionable copy explaining the checksum or address syntax failure.

---

## 2. Layout Architecture: Strict Top-to-Bottom Flow

The Multi-Sender dApp (`send-panel.tsx` / `page.tsx`) organizes the user workflow into a clear 3-tiered vertical sequence wrapped in sleek cards:

```
┌────────────────────────────────────────────────────────┐
│ 1. TOP SECTION: Asset Selection Card                  │
│    - Asset Toggle: [Native] [Popular] [Custom] [NFTs] │
│    - Contract Address Input / NFT Standard Sub-Toggle │
│    - Token / NFT Metadata Readout Badge               │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. MIDDLE SECTION: Recipient Entry Card                │
│    - Header with Prominent "Import CSV" Button         │
│    - Uniform Amount Utility / ERC-1155 Global Token ID │
│    - Editable Recipient Table with Inline Validation   │
│    - Real-time Error Alerts for Malformed Addresses    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. BOTTOM SECTION: Execution Card                      │
│    - High-level Summary Stats (Total Recipients, Sum)  │
│    - Operator Allowance / Exact Approval Banner        │
│    - Glowing High-Contrast Action Buttons:             │
│      [Approve Multi-Sender] (if required)              │
│      [Send Batch] (strictly blocked on any errors)     │
└────────────────────────────────────────────────────────┘
```

---

## 3. Component Specification & Patterns

### 3.1 Card Container
```tsx
<div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-xl">
  {/* Cyan highlight bar along top border */}
  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent pointer-events-none" />
  {children}
</div>
```

### 3.2 Form Inputs & Selects
- Background: `bg-slate-950/80`
- Border: `border border-slate-800`
- Focus State: `focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none`
- Text: `text-xs text-slate-100 placeholder:text-slate-600`
- Monospace mode for addresses and numbers: `font-mono`

### 3.3 Recipient Table & Inline Validation
- Headers: `bg-slate-900/90 text-slate-400 uppercase tracking-widest text-[0.62rem] font-semibold`
- Rows: `border-t border-slate-800/70 hover:bg-slate-800/20 transition`
- Invalid Address Row State:
  - Input: `border-rose-500/60 bg-rose-950/20 text-rose-200 focus:border-rose-400 focus:ring-rose-500/20`
  - Inline Alert: `Alert variant="destructive"` directly beneath input explaining the typo.

### 3.4 Action Buttons
- **Glowing Primary Button (Send Batch):**
  - Enabled: `bg-cyan-400 text-slate-950 font-semibold shadow-glow hover:bg-cyan-300 transition-all duration-200 rounded-xl`
  - Disabled: `bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed opacity-60 rounded-xl`
- **Secondary Utility Button (CSV Import):**
  - `border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 rounded-lg`

---

## 4. Safety Guardrails
1. **Zero-Tolerance Batch Blocking:** If even one row has `invalid-address`, `invalid-checksum`, `missing-amount`, or `zero-amount`, both the "Approve" and "Send Batch" buttons must be disabled.
2. **Instant Re-Validation:** Validation runs on every keystroke. As soon as the user corrects a typo in the table, the error clears instantly and unlocks the batch flow once all errors are cleared.
