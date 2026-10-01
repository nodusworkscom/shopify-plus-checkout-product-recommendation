# Shopify Plus Checkout Upsell Extension

A Shopify **Checkout UI Extension** that renders a dynamic, collection-driven
product recommendation strip directly underneath the order's cost summary at
checkout. Buyers can add suggested products and adjust quantity with a compact
stepper — without ever leaving the checkout.

Built with **Preact + JSX** on top of Shopify's official pre-purchase offer
pattern, using the checkout web components (`<s-grid>`, `<s-stack>`,
`<s-button>`, `<s-image>`, …) and the Storefront GraphQL API via
`shopify.query`. No external CSS, no external state library — a single
[`Checkout.jsx`](supplies-upsell/src/Checkout.jsx) file.

---

## What it looks like

Each offer renders as a 3-column row. Out of cart it shows an **Add** button;
in cart it switches to a compact `−  qty  +` stepper with a small **Remove**
link.

```
┌────────────────────────────────────────────────────────────┐
│ [thumb]  Product title                                       │
│          $29.00                              [−] 2 [+]       │
│                                               Remove         │
└────────────────────────────────────────────────────────────┘
```

`gridTemplateColumns="64px 1fr auto"` → 64px thumbnail · flexible
title/price · action area.

---

## Requirements

- A **Shopify Plus** store or a **Partner development store** (checkout
  extensibility is gated to these).
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) — `npm install -g @shopify/cli`
- Node.js 18+

## Tech stack

| Dependency | Version |
| --- | --- |
| `preact` | `^10.29.2` |
| `@preact/signals` | `^2.9.0` |
| `@shopify/ui-extensions` | `2026.1.2` |
| API version | `2026-01` |

---

## Getting started

Scaffold the extension inside an existing Shopify app:

```bash
shopify app generate extension --type ui_extension --name supplies-upsell
```

Then drop in the [`src/Checkout.jsx`](supplies-upsell/src/Checkout.jsx) and
[`shopify.extension.toml`](supplies-upsell/shopify.extension.toml) from this
repo and deploy:

```bash
shopify app deploy
```

---

## Merchant setup (after deploy)

`purchase.checkout.block.render` ships the extension as a drag-and-drop **App
block**, so the merchant places it exactly where they want — no code change
required.

1. Shopify admin → **Online Store → Themes → Customize**
2. Select the **Checkout** page
3. In the **App blocks** section of the left panel, find **Supplies Upsell**
4. Drag it into the **Order summary** section, below the **Cost summary**
5. Set the **Collection handle** to the upsell collection's handle
6. Save

The collection handle is the last segment of the collection's URL in
Shopify admin → **Products → Collections → [collection]**.

---

## Configuration (`shopify.extension.toml`)

All copy and behavior is merchant-configurable from the checkout editor — no
redeploy needed.

| Setting | Type | Purpose |
| --- | --- | --- |
| `collection_handle` | text | Storefront collection to source products from (default `supplies`) |
| `max_products` | integer | How many products to suggest (clamped to 1–12, 2–6 works best) |
| `heading` | text | Bold heading above the strip |
| `subheading` | text | Optional caption under the heading |
| `cta_label` | text | Add-button label (default `Add`) |

```toml
api_version = "2026-01"
type = "ui_extension"
name = "Supplies Upsell"
handle = "supplies-upsell"

[[targeting]]
module = "./src/Checkout.jsx"
target = "purchase.checkout.block.render"

[capabilities]
api_access = true
```

---

## How it works

- **Data:** a single GraphQL query (`PRODUCTS_QUERY`) pulls the collection's
  products with `sortKey: BEST_SELLING`. This requires `api_access = true`
  under `[capabilities]` — without it, `shopify.query` fails silently.
- **Reactivity:** `shopify.lines` is a signal; reading `lines.value` subscribes
  the strip so it re-renders whenever the cart changes. A `Map` keyed by
  variant id maps each offer to its (possible) existing cart line.
- **Mutations:** add / update / remove all funnel through a single
  `runMutation` helper guarded by a global `busyId` (the variant currently
  mutating). The active row shows a spinner; every other CTA is disabled — this
  prevents double-click race conditions across `applyCartLinesChange`.
- **Custom stepper:** the `−`/`+` controls are built from `s-clickable +
  s-icon` because `s-button` on the checkout surface doesn't expose the `icon`
  prop, and `s-number-field` can't be made compact enough to share a row.

---

## The six traps (summary)

1. **`api_access = true`** — required for `shopify.query`; fails silently if missing.
2. **Render target** — use `purchase.checkout.block.render`, not `cart-line-list.render-after`, so the total stays visible above the upsell.
3. **camelCase props** — `gridTemplateColumns`, `alignItems`, … kebab-case is silently ignored and layout collapses.
4. **`s-button` has no `icon` prop** on the checkout surface — build icon buttons from `s-clickable + s-icon`.
5. **`s-number-field` can't shrink** — use a custom stepper for compact, shared rows.
6. **Async race condition** — gate every mutation through a single `busyId`.

---

## Project structure

```
.
├── README.md
└── supplies-upsell/
    ├── shopify.extension.toml   # Targeting, capabilities, merchant settings
    ├── package.json
    └── src/
        └── Checkout.jsx         # The entire extension (~410 lines)
```

---

## Credits

Built by the [Nodus Works](https://nodusworks.com) team, distilling 18 deploys
of real Shopify Plus checkout extension work. Based on Shopify's official
[pre-purchase offer pattern](https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-pre-purchase-offer).
