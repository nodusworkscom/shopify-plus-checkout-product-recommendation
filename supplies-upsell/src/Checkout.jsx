/** @jsxImportSource preact */
/*
 * Supplies Upsell — pre-purchase product offer.
 *
 * Built on Shopify's official pre-purchase offer pattern (see
 * https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-pre-purchase-offer
 * and the example at
 * github.com/Shopify/example-checkout--product-offer-pre-purchase--preact)
 * using Preact + JSX.
 *
 * Each offer renders as a 3-column row using `s-grid`:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [thumb]  Title                            [Add]      │
 *   │          $price                                      │
 *   └──────────────────────────────────────────────────────┘
 *
 *   gridTemplateColumns="64px 1fr auto"
 *
 * IMPORTANT: Shopify checkout web components are registered for
 * Preact via `@shopify/ui-extensions/preact` and expect camelCase
 * prop names in JSX (e.g. `gridTemplateColumns`, `alignItems`,
 * `inlineSize`, `borderRadius`, `paddingBlock`). Kebab-case
 * (`grid-template-columns`, `align-items`, …) is silently ignored
 * by these components, which collapses every grid/flex layout
 * back to a default block stack.
 *
 * Action area:
 *   - Out of cart  → single `Add` `s-button` (`variant="secondary"`,
 *                    matching the official Shopify example).
 *   - In cart      → tight `−  qty  +` stepper of secondary buttons,
 *                    with a small `Remove` text link underneath.
 *                    Buttons use `inlineSize="fit-content"` so they
 *                    hug their glyph and don't stretch.
 *
 * While any one click is in flight, every CTA in the strip is
 * disabled (the active one shows a loading spinner) so the buyer
 * can't double-fire mutations.
 *
 * The pragma at the top pins JSX → Preact regardless of what the
 * host extension toolchain defaults to. Without it, some Shopify CLI
 * versions silently produce an empty bundle.
 *
 * Required capability: `api_access = true` in shopify.extension.toml
 * to use `shopify.query` against the Storefront GraphQL API.
 */

import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

const PRODUCTS_QUERY = `
  query SuppliesUpsell($handle: String!, $first: Int!) {
    collection(handle: $handle) {
      title
      products(first: $first, sortKey: BEST_SELLING) {
        nodes {
          id
          title
          handle
          availableForSale
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
          variants(first: 1) {
            nodes {
              id
              availableForSale
              price { amount currencyCode }
            }
          }
        }
      }
    }
  }
`;

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const {applyCartLinesChange, query, i18n, lines, settings} = shopify;

  const config = (settings && settings.current) || {};
  const collectionHandle = (config.collection_handle || 'supplies').toString().trim();
  const maxProducts = Math.min(Math.max(Number(config.max_products) || 6, 1), 12);
  const heading = (config.heading || 'Add to your order').toString();
  const subheading = (config.subheading || 'Most shops grab one of these alongside their order.').toString();
  const ctaLabel = (config.cta_label || 'Add').toString();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  // `busyId` is the variantId currently mutating the cart. While set,
  // every other CTA is disabled; only the matching one shows a spinner.
  const [busyId, setBusyId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await query(PRODUCTS_QUERY, {
          variables: {handle: collectionHandle, first: maxProducts},
        });
        const nodes = result?.data?.collection?.products?.nodes ?? [];
        if (!cancelled) setProducts(nodes);
      } catch (err) {
        console.warn('[supplies-upsell] product fetch failed', err);
        if (!cancelled) {
          setProducts([]);
          setErrorMessage('Could not load suggested supplies right now.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [collectionHandle, maxProducts]);

  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // `shopify.lines` is a Signal; reading `.value` here subscribes us
  // so the strip re-renders when the buyer adds/removes lines.
  const cartLines = (lines && lines.value) || [];
  const cartLineByVariantId = useMemo(() => {
    const map = new Map();
    for (const line of cartLines) {
      const id = line?.merchandise?.id;
      if (!id) continue;
      if (!map.has(id)) map.set(id, line);
    }
    return map;
  }, [cartLines]);

  const offers = useMemo(() => {
    return products
      .map((product) => ({product, variant: product?.variants?.nodes?.[0]}))
      .filter(({product, variant}) => {
        if (!product || product.availableForSale === false) return false;
        if (!variant || variant.availableForSale === false) return false;
        return true;
      });
  }, [products]);

  async function runMutation(variantId, change) {
    setBusyId(variantId);
    setErrorMessage('');
    try {
      const result = await applyCartLinesChange(change);
      if (result?.type === 'error') {
        setErrorMessage(result.message || "Couldn't update cart. Please try again.");
      }
    } catch (err) {
      console.warn('[supplies-upsell] mutation failed', err);
      setErrorMessage("Couldn't update cart. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function handleAdd(variantId) {
    return runMutation(variantId, {
      type: 'addCartLine',
      merchandiseId: variantId,
      quantity: 1,
    });
  }

  function handleSetQuantity(variantId, line, nextQty) {
    if (!line) return Promise.resolve();
    if (nextQty <= 0) return handleRemove(variantId, line);
    if (nextQty === line.quantity) return Promise.resolve();
    return runMutation(variantId, {
      type: 'updateCartLine',
      id: line.id,
      quantity: nextQty,
    });
  }

  function handleRemove(variantId, line) {
    if (!line) return Promise.resolve();
    return runMutation(variantId, {
      type: 'removeCartLine',
      id: line.id,
      quantity: line.quantity,
    });
  }

  if (loading) {
    return (
      <s-stack gap="large-200">
        <s-divider />
        <Header heading={heading} subheading={subheading} />
        <s-stack gap="base">
          <SkeletonOffer />
          <SkeletonOffer />
        </s-stack>
      </s-stack>
    );
  }

  if (offers.length === 0) return null;

  const anyBusy = busyId !== null;

  return (
    <s-stack gap="large-200">
      <s-divider />
      <Header heading={heading} subheading={subheading} />

      {errorMessage ? (
        <s-banner tone="critical">{errorMessage}</s-banner>
      ) : null}

      <s-stack gap="base">
        {offers.map(({product, variant}) => {
          const line = cartLineByVariantId.get(variant.id) || null;
          return (
            <OfferRow
              key={variant.id}
              product={product}
              variant={variant}
              line={line}
              ctaLabel={ctaLabel}
              isBusy={busyId === variant.id}
              anyBusy={anyBusy}
              onAdd={() => handleAdd(variant.id)}
              onSetQuantity={(next) => handleSetQuantity(variant.id, line, next)}
              onRemove={() => handleRemove(variant.id, line)}
              i18n={i18n}
            />
          );
        })}
      </s-stack>
    </s-stack>
  );
}

function Header({heading, subheading}) {
  return (
    <s-stack gap="small-100">
      <s-text type="strong">{heading}</s-text>
      {subheading ? (
        <s-text color="subdued">{subheading}</s-text>
      ) : null}
    </s-stack>
  );
}

function OfferRow({
  product,
  variant,
  line,
  ctaLabel,
  isBusy,
  anyBusy,
  onAdd,
  onSetQuantity,
  onRemove,
  i18n,
}) {
  const price = variant?.price ?? product?.priceRange?.minVariantPrice;
  const formattedPrice = formatPrice(i18n, price);
  const inCartQty = line?.quantity || 0;
  const disabledOthers = anyBusy && !isBusy;
  const imageUrl =
    product.featuredImage?.url ||
    'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081';

  return (
    <s-grid
      gap="base"
      gridTemplateColumns="64px 1fr auto"
      alignItems="center"
    >
      <s-image
        borderWidth="base"
        borderRadius="large-100"
        src={imageUrl}
        alt={product.featuredImage?.altText || product.title}
        aspectRatio="1"
      />
      <s-stack gap="none">
        <s-text type="strong">{product.title}</s-text>
        {formattedPrice ? (
          <s-text color="subdued">{formattedPrice}</s-text>
        ) : null}
      </s-stack>
      {line ? (
        <QuantityActions
          quantity={inCartQty}
          isBusy={isBusy}
          disabled={disabledOthers}
          onIncrement={() => onSetQuantity(inCartQty + 1)}
          onDecrement={() => onSetQuantity(inCartQty - 1)}
          onRemove={onRemove}
        />
      ) : (
        <s-button
          variant="secondary"
          loading={isBusy}
          disabled={disabledOthers}
          onClick={onAdd}
          accessibilityLabel={`Add ${product.title} to cart`}
        >
          {ctaLabel}
        </s-button>
      )}
    </s-grid>
  );
}

function QuantityActions({
  quantity,
  isBusy,
  disabled,
  onIncrement,
  onDecrement,
  onRemove,
}) {
  const stepDisabled = isBusy || disabled;

  // s-button (checkout) does NOT expose the `icon` prop in its
  // ElementProps Pick, so icon-only buttons render empty. Build the
  // stepper from `s-clickable + s-icon` instead — this lets us
  // control both the dimensions (compact square via padding) and
  // the icon glyph independently.
  return (
    <s-stack gap="small-100" alignItems="end">
      <s-grid
        gap="small-100"
        gridTemplateColumns="auto auto auto"
        alignItems="center"
      >
        <StepperButton
          icon="minus"
          onClick={onDecrement}
          disabled={stepDisabled}
          accessibilityLabel="Decrease quantity"
        />
        <s-text type="strong">{String(quantity)}</s-text>
        <StepperButton
          icon="plus"
          onClick={onIncrement}
          disabled={stepDisabled}
          accessibilityLabel="Increase quantity"
        />
      </s-grid>
      <s-clickable
        onClick={onRemove}
        disabled={stepDisabled}
        accessibilityLabel="Remove from cart"
      >
        <s-text tone="critical">Remove</s-text>
      </s-clickable>
    </s-stack>
  );
}

function StepperButton({icon, onClick, disabled, accessibilityLabel}) {
  return (
    <s-clickable
      onClick={onClick}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      border="base base"
      borderRadius="small"
      paddingBlock="small-200"
      paddingInline="small-300"
      background="base"
    >
      <s-icon type={icon} size="small" />
    </s-clickable>
  );
}

function SkeletonOffer() {
  return (
    <s-grid
      gap="base"
      gridTemplateColumns="64px 1fr auto"
      alignItems="center"
    >
      <s-image loading="lazy" aspectRatio="1" />
      <s-stack gap="none">
        <s-skeleton-paragraph />
        <s-skeleton-paragraph />
      </s-stack>
      <s-button variant="secondary" disabled={true}>
        Add
      </s-button>
    </s-grid>
  );
}

function formatPrice(i18n, price) {
  if (!price?.amount) return '';
  try {
    return i18n.formatCurrency(Number(price.amount), {
      currency: price.currencyCode,
    });
  } catch (e) {
    return `${price.amount} ${price.currencyCode || ''}`.trim();
  }
}
