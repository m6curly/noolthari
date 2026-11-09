/* =========================================================
   NOOLTHARI™ CATALOG
   Product cards + stock-safe cart actions

   Wishlist is account-backed and protected by Supabase RLS.
   ========================================================= */



/* =========================================================
   GUEST CART — browser-local until the customer signs in.
   Only product IDs and quantities are stored; checkout reprices on the server.
========================================================= */
const GUEST_CART_KEY = 'noolthari_guest_cart_v1';
const GUEST_CART_IMPORT_KEY = 'noolthari_guest_cart_import_v1';

function readGuestCart() {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean = {};
    Object.entries(parsed).slice(0, 50).forEach(([id, quantity]) => {
      const qty = Math.floor(Number(quantity));
      if (/^[0-9a-f-]{36}$/i.test(id) && Number.isFinite(qty) && qty > 0 && qty <= 50) clean[id] = qty;
    });
    return clean;
  } catch {
    return {};
  }
}

function writeGuestCart(cart) {
  try {
    const clean = {};
    Object.entries(cart || {}).slice(0, 50).forEach(([id, quantity]) => {
      const qty = Math.floor(Number(quantity));
      if (/^[0-9a-f-]{36}$/i.test(id) && Number.isFinite(qty) && qty > 0 && qty <= 50) clean[id] = qty;
    });
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(clean));
    return clean;
  } catch (error) {
    console.error('Guest cart storage is unavailable:', error);
    throw new Error('Your browser could not save the bag. Check storage settings and try again.');
  }
}

function guestCartQuantities() {
  return readGuestCart();
}

function guestCartCount() {
  return Object.values(readGuestCart()).reduce((sum, quantity) => sum + quantity, 0);
}

async function addGuestCartUnit(productId) {
  const stock = await getProductStock(productId);
  const cart = readGuestCart();
  const quantity = Number(cart[productId] || 0) + 1;
  if (quantity > stock) throw new Error(`Only ${stock} unit${stock === 1 ? '' : 's'} available.`);
  cart[productId] = quantity;
  writeGuestCart(cart);
  return { stock, quantity };
}

async function changeGuestCartQuantity(productId, quantity) {
  const next = Math.max(0, Math.floor(Number(quantity || 0)));
  const cart = readGuestCart();
  if (next > 0) {
    const stock = await getProductStock(productId);
    if (next > stock) throw new Error(`Only ${stock} unit${stock === 1 ? '' : 's'} available.`);
    cart[productId] = next;
  } else {
    delete cart[productId];
  }
  writeGuestCart(cart);
  return next;
}

async function syncGuestCartToAccount(customerId) {
  if (!customerId) return false;
  const items = Object.entries(readGuestCart()).map(([product_id, quantity]) => ({ product_id, quantity }));
  if (!items.length) return true;

  let importId;
  try {
    importId = localStorage.getItem(GUEST_CART_IMPORT_KEY);
    if (!importId) {
      if (crypto?.randomUUID) {
        importId = crypto.randomUUID();
      } else {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        importId = [...bytes].map((byte, index) =>
          ([4, 6, 8, 10].includes(index) ? '-' : '') + byte.toString(16).padStart(2, '0')
        ).join('');
      }
      localStorage.setItem(GUEST_CART_IMPORT_KEY, importId);
    }
  } catch {
    throw new Error('Your browser storage is unavailable. Sign-in cart sync cannot continue safely.');
  }

  const result = await sb.rpc('sync_guest_cart', {
    p_import_id: importId,
    p_items: items
  });
  if (result.error) throw result.error;

  localStorage.removeItem(GUEST_CART_KEY);
  localStorage.removeItem(GUEST_CART_IMPORT_KEY);
  if (Number(result.data?.adjusted_count || 0) > 0) {
    NL.toast('Some bag quantities were adjusted to current available stock.', 'warning');
  }
  await updateShopCartBadge(customerId);
  return true;
}


/* =========================================================
   PRODUCT IMAGE
========================================================= */

function imgFor(product) {

  const images =
    Array.isArray(product?.product_images)
      ? product.product_images
          .slice()
          .sort(
            (a, b) =>
              Number(a?.sort_order || 0) -
              Number(b?.sort_order || 0)
          )
      : [];


  return (
    images[0]?.public_url ||
    NL.path(
      'assets/logo/noolthari-logo.webp'
    )
  );

}


/* =========================================================
   PRODUCT STOCK
========================================================= */

async function getProductStock(productId) {

  if (!productId) {

    throw new Error(
      'Product not found.'
    );

  }


  const result =
    await sb
      .from('products')
      .select(
        'stock_quantity,status'
      )
      .eq(
        'id',
        productId
      )
      .single();


  if (result.error) {
    throw result.error;
  }


  const product =
    result.data;


  if (!product) {

    throw new Error(
      'Product not found.'
    );

  }


  if (
    product.status !== 'active'
  ) {

    throw new Error(
      'This saree is currently unavailable.'
    );

  }


  return Math.max(
    0,
    Number(
      product.stock_quantity || 0
    )
  );

}


/* =========================================================
   CUSTOMER CART
========================================================= */

async function getCustomerCart(
  customerId
) {

  if (!customerId) {

    throw new Error(
      'Customer account not found.'
    );

  }


  const existing =
    await sb
      .from('cart')
      .select('id')
      .eq(
        'customer_id',
        customerId
      )
      .maybeSingle();


  if (existing.error) {
    throw existing.error;
  }


  if (existing.data) {
    return existing.data;
  }


  const created =
    await sb
      .from('cart')
      .insert({
        customer_id:
          customerId
      })
      .select('id')
      .single();


  if (created.error) {
    throw created.error;
  }


  return created.data;

}


/* =========================================================
   SINGLE CART ITEM
========================================================= */

async function getCartItem(
  productId,
  cartId
) {

  if (!productId || !cartId) {

    throw new Error(
      'Cart information is incomplete.'
    );

  }


  const result =
    await sb
      .from('cart_items')
      .select(
        'id,quantity'
      )
      .eq(
        'cart_id',
        cartId
      )
      .eq(
        'product_id',
        productId
      )
      .maybeSingle();


  if (result.error) {
    throw result.error;
  }


  return result.data || null;

}


/* =========================================================
   CART QUANTITIES FOR SHOP
========================================================= */

async function getShopCartQuantities(
  customerId
) {

  const quantities = {};


  if (!customerId) {
    return guestCartQuantities();
  }


  try {

    const cartResult =
      await sb
        .from('cart')
        .select('id')
        .eq(
          'customer_id',
          customerId
        )
        .maybeSingle();


    if (cartResult.error) {
      throw cartResult.error;
    }


    const cart =
      cartResult.data;


    if (!cart) {
      return quantities;
    }


    const itemsResult =
      await sb
        .from('cart_items')
        .select(
          'product_id,quantity'
        )
        .eq(
          'cart_id',
          cart.id
        );


    if (itemsResult.error) {
      throw itemsResult.error;
    }


    (itemsResult.data || [])
      .forEach(item => {

        quantities[item.product_id] =
          Math.max(
            0,
            Number(
              item.quantity || 0
            )
          );

      });


  } catch (error) {

    console.error(
      'Shop cart quantity error:',
      error
    );

  }


  return quantities;

}


/* =========================================================
   FIND CART LINKS
========================================================= */

function getCartLinks() {

  return document.querySelectorAll(
    'a.icon-link[href="cart.html"], ' +
    'a.icon-link[href$="/cart.html"]'
  );

}


/* =========================================================
   CART BADGE
========================================================= */

async function updateShopCartBadge(
  customerId
) {

  const cartLinks =
    getCartLinks();


  if (!cartLinks.length) {
    return;
  }


  try {

    if (!customerId) {
      const totalQuantity = guestCartCount();
      cartLinks.forEach(link => {
        let badge = link.querySelector('.cart-count-badge');
        if (totalQuantity <= 0) { badge?.remove(); return; }
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'cart-count-badge';
          link.appendChild(badge);
        }
        badge.textContent = String(totalQuantity);
      });
      return;
    }


    const cartResult =
      await sb
        .from('cart')
        .select('id')
        .eq(
          'customer_id',
          customerId
        )
        .maybeSingle();


    if (cartResult.error) {
      throw cartResult.error;
    }


    const cart =
      cartResult.data;


    if (!cart) {

      cartLinks.forEach(link => {

        link
          .querySelector(
            '.cart-count-badge'
          )
          ?.remove();

      });

      return;
    }


    const itemsResult =
      await sb
        .from('cart_items')
        .select(
          'quantity'
        )
        .eq(
          'cart_id',
          cart.id
        );


    if (itemsResult.error) {
      throw itemsResult.error;
    }


    const totalQuantity =
      (itemsResult.data || [])
        .reduce(
          (sum, item) =>
            sum +
            Math.max(
              0,
              Number(
                item.quantity || 0
              )
            ),
          0
        );


    cartLinks.forEach(link => {

      let badge =
        link.querySelector(
          '.cart-count-badge'
        );


      if (
        totalQuantity <= 0
      ) {

        badge?.remove();

        return;
      }


      if (!badge) {

        badge =
          document.createElement(
            'span'
          );

        badge.className =
          'cart-count-badge';

        link.appendChild(
          badge
        );

      }


      badge.textContent =
        String(
          totalQuantity
        );

    });


  } catch (error) {

    console.error(
      'Cart badge error:',
      error
    );

  }

}


/* =========================================================
   QUANTITY CONTROL ICON
========================================================= */

function quantityRemoveIcon() {

  return `
    <svg
      class="bag-remove-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16"></path>
      <path d="M9 7V4h6v3"></path>
      <path d="M6 7l1 13h10l1-13"></path>
      <path d="M10 11v5"></path>
      <path d="M14 11v5"></path>
    </svg>
  `;

}


/* =========================================================
   PRODUCT CARD
========================================================= */

function card(
  product,
  cartQuantities = {},
  wishlistIds = new Set()
) {

  const sellingPrice =
    Math.max(
      0,
      Number(
        product?.selling_price || 0
      )
    );


  const salePrice =
    Math.max(
      0,
      Number(
        0
      )
    );


  const hasSale =
    salePrice > 0 &&
    salePrice < sellingPrice;


  const price =
    hasSale
      ? salePrice
      : sellingPrice;


  const stock =
    Math.max(
      0,
      Number(
        product?.stock_quantity || 0
      )
    );


  const inBag =
    Math.max(
      0,
      Number(
        cartQuantities?.[
          product.id
        ] || 0
      )
    );


  const outOfStock =
    stock <= 0;


  const canIncrease =
    inBag < stock;


  let actionMarkup;


  /* =======================================================
     NOT IN BAG
  ======================================================== */

  if (
    inBag <= 0
  ) {

    actionMarkup = `
      <button
        class="btn btn-outline add"
        type="button"
        data-id="${NL.esc(
          product.id
        )}"
        data-stock="${stock}"
        data-in-bag="0"
        ${
          outOfStock
            ? 'disabled'
            : ''
        }
      >
        ${
          outOfStock
            ? 'Out of stock'
            : 'Add to bag'
        }
      </button>
    `;


  /* =======================================================
     ALREADY IN BAG
  ======================================================== */

  } else {

    const leftAction =
      inBag === 1
        ? `
          <button
            class="bag-qty-btn bag-qty-remove"
            type="button"
            data-quantity-action="remove"
            data-id="${NL.esc(
              product.id
            )}"
            aria-label="Remove from bag"
            title="Remove from bag"
          >
            ${quantityRemoveIcon()}
          </button>
        `
        : `
          <button
            class="bag-qty-btn bag-qty-minus"
            type="button"
            data-quantity-action="decrease"
            data-id="${NL.esc(
              product.id
            )}"
            aria-label="Decrease quantity"
            title="Decrease quantity"
          >
            −
          </button>
        `;


    const rightAction =
      canIncrease
        ? `
          <button
            class="bag-qty-btn bag-qty-plus"
            type="button"
            data-quantity-action="increase"
            data-id="${NL.esc(
              product.id
            )}"
            aria-label="Increase quantity"
            title="Increase quantity"
          >
            +
          </button>
        `
        : '';


    actionMarkup = `
      <div
        class="bag-quantity-control ${
          canIncrease
            ? 'has-plus'
            : 'no-plus'
        }"
        data-product-id="${NL.esc(
          product.id
        )}"
        data-stock="${stock}"
        data-quantity="${inBag}"
      >

        ${leftAction}

        <span
          class="bag-qty-value"
          aria-live="polite"
        >
          In bag · ${inBag}
        </span>

        ${rightAction}

      </div>


      <button
        class="btn btn-gold go-to-bag"
        type="button"
        data-go-to-bag
      >
        Go to bag
      </button>
    `;

  }


  let stockText;


  if (outOfStock) {

    stockText =
      'Out of stock';

  } else if (inBag > 0) {

    stockText =
      `${stock} available · ${inBag} in bag`;

  } else {

    stockText =
      `${stock} available`;

  }


  return `
    <article
      class="product-card${outOfStock ? ' is-out-of-stock' : ''}"
      data-product-card-id="${NL.esc(
        product.id
      )}"
    >

      <div class="product-media">

        <a
          href="${NL.path(
            'product.html?id=' +
            encodeURIComponent(
              product.id
            )
          )}"
          aria-label="View ${NL.esc(
            product.saree_name ||
            'saree'
          )}"
        >

          <img
            src="${NL.esc(
              imgFor(product)
            )}"
            alt="${NL.esc(
              product.saree_name ||
              ''
            )}"
            loading="lazy"
          >

        </a>


        <button
          class="wishlist-toggle"
          type="button"
          data-wishlist-toggle
          data-product-id="${NL.esc(product.id)}"
          aria-label="${wishlistIds.has(String(product.id)) ? 'Remove from' : 'Add to'} wishlist"
          aria-pressed="${wishlistIds.has(String(product.id)) ? 'true' : 'false'}"
          title="${wishlistIds.has(String(product.id)) ? 'Remove from wishlist' : 'Save to wishlist'}"
        ><svg class="ui-icon ui-icon-heart" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 8.7c0 5.1-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.7A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.6Z"></path></svg></button>

        ${
          outOfStock
            ? `
              <span class="product-stock-label" role="status">
                <span class="product-stock-dot" aria-hidden="true"></span>
                Out of stock
              </span>
            `
            : ''
        }

      </div>


      <div class="product-info">

        <div class="eyebrow">
          ${NL.esc(
            product.categories?.name ||
            'Collection'
          )}
        </div>


        <a
          class="product-name"
          href="${NL.path(
            'product.html?id=' +
            encodeURIComponent(
              product.id
            )
          )}"
        >
          ${NL.esc(
            product.saree_name ||
            ''
          )}
        </a>


        <div class="price-row">

          <span>
            ${NL.money(price)}
          </span>


          ${
            hasSale
              ? `
                <del>
                  ${NL.money(
                    sellingPrice
                  )}
                </del>
              `
              : ''
          }

        </div>


        ${
          !outOfStock
            ? `
              <div class="product-stock-hint">
                ${NL.esc(
                  stockText
                )}
              </div>
            `
            : ''
        }


        <div class="product-actions">

          ${actionMarkup}

        </div>

      </div>

    </article>
  `;

}


/* =========================================================
   UPDATE QUANTITY CONTROL
========================================================= */

function updateShopQuantityControl(
  button,
  stock,
  quantity
) {

  const cardElement =
    button?.closest(
      '.product-card'
    );


  if (!cardElement) {
    return;
  }


  const productId =
    button.dataset.id ||
    cardElement
      .querySelector(
        '[data-product-id]'
      )
      ?.dataset.productId ||
    cardElement.dataset.productCardId;


  const actions =
    cardElement.querySelector(
      '.product-actions'
    );


  const stockHint =
    cardElement.querySelector(
      '.product-stock-hint'
    );


  if (!actions) {
    return;
  }


  const safeStock =
    Math.max(
      0,
      Number(
        stock || 0
      )
    );


  const safeQuantity =
    Math.max(
      0,
      Number(
        quantity || 0
      )
    );


  /* =======================================================
     QUANTITY IS ZERO
     → RESTORE ADD TO BAG
  ======================================================== */

  if (
    safeQuantity <= 0
  ) {

    actions.innerHTML = `
      <button
        class="btn btn-outline add"
        type="button"
        data-id="${NL.esc(
          productId
        )}"
        data-stock="${safeStock}"
        data-in-bag="0"
        ${
          safeStock <= 0
            ? 'disabled'
            : ''
        }
      >
        ${
          safeStock <= 0
            ? 'Out of stock'
            : 'Add to bag'
        }
      </button>
    `;


    if (stockHint) {

      stockHint.textContent =
        safeStock > 0
          ? `${safeStock} available`
          : 'Out of stock';

    }


    bindShopCardButtons(
      cardElement
    );

    return;

  }


  /* =======================================================
     QUANTITY ABOVE ZERO
  ======================================================== */

  const canIncrease =
    safeQuantity <
    safeStock;


  const leftAction =
    safeQuantity === 1
      ? `
        <button
          class="bag-qty-btn bag-qty-remove"
          type="button"
          data-quantity-action="remove"
          data-id="${NL.esc(
            productId
          )}"
          aria-label="Remove from bag"
          title="Remove from bag"
        >
          ${quantityRemoveIcon()}
        </button>
      `
      : `
        <button
          class="bag-qty-btn bag-qty-minus"
          type="button"
          data-quantity-action="decrease"
          data-id="${NL.esc(
            productId
          )}"
          aria-label="Decrease quantity"
          title="Decrease quantity"
        >
          −
        </button>
      `;


  const rightAction =
    canIncrease
      ? `
        <button
          class="bag-qty-btn bag-qty-plus"
          type="button"
          data-quantity-action="increase"
          data-id="${NL.esc(
            productId
          )}"
          aria-label="Increase quantity"
          title="Increase quantity"
        >
          +
        </button>
      `
      : '';


  actions.innerHTML = `
    <div
      class="bag-quantity-control ${
        canIncrease
          ? 'has-plus'
          : 'no-plus'
      }"
      data-product-id="${NL.esc(
        productId
      )}"
      data-stock="${safeStock}"
      data-quantity="${safeQuantity}"
    >

      ${leftAction}

      <span
        class="bag-qty-value"
        aria-live="polite"
      >
        In bag · ${safeQuantity}
      </span>

      ${rightAction}

    </div>


    <button
      class="btn btn-gold go-to-bag"
      type="button"
      data-go-to-bag
    >
      Go to bag
    </button>
  `;


  if (stockHint) {

    stockHint.textContent =
      `${safeStock} available · ${safeQuantity} in bag`;

  }


  bindShopCardButtons(
    cardElement
  );

}


/* =========================================================
   UPDATE CARD AFTER CART CHANGE
========================================================= */

function updateShopCardState(
  button,
  stock,
  quantity
) {

  if (!button) {
    return;
  }


  updateShopQuantityControl(
    button,
    stock,
    quantity
  );

}


/* =========================================================
   SAVE CART QUANTITY
========================================================= */

async function saveCartQuantity(
  cartId,
  productId,
  quantity
) {

  const safeQuantity =
    Math.max(
      0,
      Number(
        quantity || 0
      )
    );


  const existing =
    await getCartItem(
      productId,
      cartId
    );


  let result;


  if (
    safeQuantity <= 0
  ) {

    if (!existing) {
      return;
    }


    result =
      await sb
        .from('cart_items')
        .delete()
        .eq(
          'id',
          existing.id
        );

  } else if (existing) {

    result =
      await sb
        .from('cart_items')
        .update({
          quantity:
            safeQuantity
        })
        .eq(
          'id',
          existing.id
        );

  } else {

    result =
      await sb
        .from('cart_items')
        .insert({
          cart_id:
            cartId,

          product_id:
            productId,

          quantity:
            safeQuantity
        });

  }


  if (result.error) {
    throw result.error;
  }

}


/* =========================================================
   ADD ONE UNIT TO CART
========================================================= */

async function addOneUnitToCart(
  productId,
  customerId
) {

  const stock =
    await getProductStock(
      productId
    );


  if (stock <= 0) {

    throw new Error(
      'This saree is out of stock.'
    );

  }


  const cart =
    await getCustomerCart(
      customerId
    );


  const existing =
    await getCartItem(
      productId,
      cart.id
    );


  const currentQuantity =
    Math.max(
      0,
      Number(
        existing?.quantity || 0
      )
    );


  const nextQuantity =
    currentQuantity + 1;


  if (
    nextQuantity >
    stock
  ) {

    throw new Error(
      `Only ${stock} unit${
        stock === 1
          ? ''
          : 's'
      } available.`
    );

  }


  await saveCartQuantity(
    cart.id,
    productId,
    nextQuantity
  );


  return {
    cart,
    stock,
    quantity:
      nextQuantity
  };

}


/* =========================================================
   CHANGE CART QUANTITY
========================================================= */

async function changeShopCartQuantity(
  productId,
  customerId,
  nextQuantity
) {

  const stock =
    await getProductStock(
      productId
    );


  const safeQuantity =
    Math.max(
      0,
      Number(
        nextQuantity || 0
      )
    );


  if (
    safeQuantity >
    stock
  ) {

    throw new Error(
      `Only ${stock} unit${
        stock === 1
          ? ''
          : 's'
      } available.`
    );

  }


  const cart =
    await getCustomerCart(
      customerId
    );


  await saveCartQuantity(
    cart.id,
    productId,
    safeQuantity
  );


  return {
    cart,
    stock,
    quantity:
      safeQuantity
  };

}


/* =========================================================
   RENDER PRODUCTS
========================================================= */

async function renderProducts(element, options = {}) {
  if (!element) return;
  element.setAttribute('aria-busy', 'true');
  element.innerHTML = '<p class="empty">Loading the collection…</p>';

  try {
    // Only storefront-safe columns are readable by customers. Internal
    // purchase cost and reserved inventory are intentionally never fetched.
    let query = sb.from('products').select(`
      id,sku,saree_name,slug,category_id,description,colour,
      blouse_included,selling_price,
      stock_quantity,status,featured,bestseller,created_at,updated_at,
      categories(name),product_images(id,path,sort_order,public_url)
    `).eq('status', 'active');

    if (options.category) query = query.eq('category_id', options.category);
    if (options.colour) query = query.eq('colour', options.colour);
    if (options.excludeId) query = query.neq('id', options.excludeId);
    if (options.availability === 'in-stock') query = query.gt('stock_quantity', 0);
    if (options.availability === 'out-of-stock') query = query.lte('stock_quantity', 0);

    if (options.search) {
      // PostgREST .or() uses commas/parentheses as syntax. Remove filter syntax
      // characters before interpolating user input; HTML escaping is separate.
      const term = String(options.search).trim().replace(/[%_,()."\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
      if (term) {
        query = query.or([
          `saree_name.ilike.%${term}%`,
          `sku.ilike.%${term}%`,
          `colour.ilike.%${term}%`,
          `description.ilike.%${term}%`
        ].join(','));
      }
    }

    query = query.order('created_at', { ascending: false });
    const result = await query;
    if (result.error) throw result.error;

    let products = result.data || [];
    const minPrice = options.minPrice === '' || options.minPrice == null ? null : Number(options.minPrice);
    const maxPrice = options.maxPrice === '' || options.maxPrice == null ? null : Number(options.maxPrice);
    const effectivePrice = product => {
      const regular = Math.max(0, Number(product.selling_price || 0));
      const sale = Math.max(0, Number(0));
      return sale > 0 && sale < regular ? sale : regular;
    };
    if (Number.isFinite(minPrice)) products = products.filter(product => effectivePrice(product) >= minPrice);
    if (Number.isFinite(maxPrice)) products = products.filter(product => effectivePrice(product) <= maxPrice);

    if (options.sort === 'low') products.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    else if (options.sort === 'high') products.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    else if (options.sort === 'name') products.sort((a, b) => String(a.saree_name || '').localeCompare(String(b.saree_name || ''), 'en'));

    if (products.length === 0) {
      element.innerHTML = '<p class="empty">No sarees match these filters. Try clearing one or more filters.</p>';
      return;
    }

    const profile = await NL.profile();
    if (profile?.id && profile.role === 'customer') {
      await syncGuestCartToAccount(profile.id);
    }
    const cartQuantities = await getShopCartQuantities(profile?.role === 'customer' ? profile.id : null);
    const wishlistIds = new Set();
    if (profile?.id) {
      const wishlist = await sb.from('wishlist_items').select('product_id').eq('customer_id', profile.id);
      if (!wishlist.error) (wishlist.data || []).forEach(item => wishlistIds.add(String(item.product_id)));
    }

    element.innerHTML = products.map(product => card(product, cartQuantities, wishlistIds)).join('');
    element.setAttribute('aria-busy', 'false');
    await updateShopCartBadge(profile?.id || null);
    NL.qsa('.product-card', element).forEach(bindShopCardButtons);
  } catch (error) {
    console.error('NOOLTHARI product loading error:', error);
    element.innerHTML = '<p class="empty" role="alert">We could not load the collection. Please refresh or try again.</p>';
  } finally {
    element.removeAttribute('aria-busy');
  }
}

/* =========================================================
   BIND PRODUCT CARD ACTIONS
========================================================= */

function bindShopCardButtons(
  cardElement
) {

  if (!cardElement) {
    return;
  }

  NL.qsa('[data-wishlist-toggle]', cardElement).forEach(button => {
    button.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      const userResult = await sb.auth.getUser();
      const user = userResult.data?.user;
      if (!user) {
        NL.toast('Sign in to save sarees to your wishlist.', 'info');
        location.href = NL.path('login.html?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      const productId = button.dataset.productId;
      const saved = button.getAttribute('aria-pressed') === 'true';
      button.disabled = true;
      try {
        const result = saved
          ? await sb.from('wishlist_items').delete().eq('customer_id', user.id).eq('product_id', productId)
          : await sb.from('wishlist_items').insert({ customer_id: user.id, product_id: productId });
        if (result.error) throw result.error;
        const next = !saved;
        button.setAttribute('aria-pressed', String(next));
        button.setAttribute('aria-label', `${next ? 'Remove from' : 'Add to'} wishlist`);
        button.title = next ? 'Remove from wishlist' : 'Save to wishlist';
        button.setAttribute('aria-label', next ? 'Remove from wishlist' : 'Add to wishlist');
        NL.toast(next ? 'Saved to your wishlist.' : 'Removed from your wishlist.', 'success');
      } catch (error) {
        console.error('Wishlist update failed:', error);
        NL.toast('Your wishlist could not be updated. Please try again.', 'error');
      } finally {
        button.disabled = false;
      }
    };
  });

  /* =======================================================
     ADD TO BAG
  ======================================================== */

  NL.qsa(
    '.add',
    cardElement
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();
        event.stopPropagation();


        await shopAddToCart(
          button.dataset.id,
          button
        );

      };

  });


  /* =======================================================
     INCREASE
  ======================================================== */

  NL.qsa(
    '[data-quantity-action="increase"]',
    cardElement
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();
        event.stopPropagation();


        await shopChangeQuantity(
          button.dataset.id,
          'increase',
          cardElement
        );

      };

  });


  /* =======================================================
     DECREASE
  ======================================================== */

  NL.qsa(
    '[data-quantity-action="decrease"]',
    cardElement
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();
        event.stopPropagation();


        await shopChangeQuantity(
          button.dataset.id,
          'decrease',
          cardElement
        );

      };

  });


  /* =======================================================
     REMOVE
  ======================================================== */

  NL.qsa(
    '[data-quantity-action="remove"]',
    cardElement
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();
        event.stopPropagation();


        await shopChangeQuantity(
          button.dataset.id,
          'remove',
          cardElement
        );

      };

  });


  /* =======================================================
     GO TO BAG
  ======================================================== */

  NL.qsa(
    '[data-go-to-bag]',
    cardElement
  ).forEach(button => {

    button.onclick =
      event => {

        event.preventDefault();
        event.stopPropagation();


        location.href =
          NL.path(
            'cart.html'
          );

      };

  });

}


/* =========================================================
   ADD TO BAG — SHOP PAGE
========================================================= */

async function shopAddToCart(
  productId,
  button = null
) {

  const customer = await NL.profile();
  if (customer && customer.role !== 'customer') {
    NL.toast('The admin account cannot use the customer bag.', 'info');
    return;
  }


  const originalText =
    button?.textContent?.trim() ||
    'Add to bag';


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Adding...';

    }


    const result = customer
      ? await addOneUnitToCart(productId, customer.id)
      : await addGuestCartUnit(productId);

    await updateShopCartBadge(customer?.id || null);


    updateShopCardState(
      button,
      result.stock,
      result.quantity
    );


    NL.toast(
      'Saree added to your bag.',
      'success'
    );


  } catch (error) {

    console.error(
      'NOOLTHARI add-to-bag error:',
      error
    );


    NL.toast(
      error.message ||
      'Unable to add this saree to your bag.',
      'error'
    );


    if (button) {

      button.disabled =
        false;

      button.textContent =
        originalText;

    }

  }

}


/* =========================================================
   CHANGE SHOP QUANTITY
========================================================= */

async function shopChangeQuantity(productId, action, cardElement) {
  const customer = await NL.profile();
  if (customer && customer.role !== 'customer') {
    NL.toast('The admin account cannot use the customer bag.', 'info');
    return;
  }
  if (!cardElement) return;

  const quantityControl = cardElement.querySelector('.bag-quantity-control');
  const currentQuantity = Math.max(0, Number(quantityControl?.dataset.quantity || 0));
  let nextQuantity = currentQuantity;
  if (action === 'increase') nextQuantity += 1;
  else if (action === 'decrease') nextQuantity = Math.max(0, currentQuantity - 1);
  else if (action === 'remove') nextQuantity = 0;
  else return;

  const buttons = cardElement.querySelectorAll('.bag-qty-btn');
  buttons.forEach(button => { button.disabled = true; });
  try {
    let result;
    if (customer) {
      result = await changeShopCartQuantity(productId, customer.id, nextQuantity);
    } else {
      const stock = await getProductStock(productId);
      const quantity = await changeGuestCartQuantity(productId, nextQuantity);
      result = { stock, quantity };
    }
    await updateShopCartBadge(customer?.id || null);

    const stateButton = cardElement.querySelector(
      '.bag-qty-remove, .bag-qty-minus, .bag-qty-plus'
    ) || cardElement.querySelector('.add');
    if (!stateButton) {
      console.error('NOOLTHARI quantity error: current quantity button not found.');
      return;
    }
    updateShopQuantityControl(stateButton, result.stock, result.quantity);
    NL.toast(
      result.quantity <= 0 ? 'Saree removed from your bag.' : `Quantity updated to ${result.quantity}.`,
      'success'
    );
  } catch (error) {
    console.error('NOOLTHARI quantity update error:', error);
    NL.toast(error.message || 'Unable to update bag quantity.', 'error');
    buttons.forEach(button => { button.disabled = false; });
  }
}

/* =========================================================
   GLOBAL addToCart
   Used by product detail page and other callers.

   +1 quantity
   → cart.html
========================================================= */

async function addToCart(productId) {
  const customer = await NL.profile();
  if (customer && customer.role !== 'customer') {
    NL.toast('The admin account cannot use the customer bag.', 'info');
    return;
  }
  try {
    if (customer) await addOneUnitToCart(productId, customer.id);
    else await addGuestCartUnit(productId);
    await updateShopCartBadge(customer?.id || null);
    location.href = NL.path('cart.html');
  } catch (error) {
    console.error('NOOLTHARI addToCart error:', error);
    NL.toast(error.message || 'Unable to add this saree to your bag.', 'error');
  }
}

/* =========================================================
   BUY NOW — add one unit then continue to checkout.
   Guests retain the bag locally and sign in before payment.
========================================================= */
async function shopBuyNow(productId, button = null) {
  const customer = await NL.profile();
  if (customer && customer.role !== 'customer') {
    NL.toast('The admin account cannot start a customer checkout.', 'info');
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Preparing…'; }
  try {
    if (customer) await addOneUnitToCart(productId, customer.id);
    else await addGuestCartUnit(productId);
    await updateShopCartBadge(customer?.id || null);
    if (customer) location.href = NL.path('checkout.html');
    else location.href = NL.path('login.html?next=' + encodeURIComponent('checkout.html'));
  } catch (error) {
    console.error('NOOLTHARI Buy Now failed:', error);
    NL.toast(error.message || 'Unable to start checkout.', 'error');
    if (button) { button.disabled = false; button.textContent = 'Buy now'; }
  }
}
