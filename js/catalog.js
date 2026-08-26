/* =========================================================
   NOOLTHARI™ CATALOG
   Product cards + stock-safe cart actions

   Wishlist / heart is intentionally removed.
   ========================================================= */


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
      'assets/logo/noolthari-logo.png'
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
    return quantities;
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

      cartLinks.forEach(link => {

        link
          .querySelector(
            '.cart-count-badge'
          )
          ?.remove();

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
  cartQuantities = {}
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
        product?.sale_price || 0
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
      class="product-card"
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


        ${
          outOfStock
            ? `
              <span class="product-stock-label">
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

async function renderProducts(
  element,
  options = {}
) {

  if (!element) {
    return;
  }


  let query =
    sb
      .from('products')
      .select(`
        *,
        categories(name),
        product_images(
          id,
          path,
          sort_order,
          public_url
        )
      `)
      .eq(
        'status',
        'active'
      );


  /* =======================================================
     CATEGORY
  ======================================================== */

  if (
    options.category
  ) {

    query =
      query.eq(
        'category_id',
        options.category
      );

  }


  /* =======================================================
     SEARCH
  ======================================================== */

  if (
    options.search
  ) {

    const searchTerm =
      String(
        options.search
      )
        .trim()
        .replace(
          /[%_,]/g,
          ' '
        );


    if (searchTerm) {

      query =
        query.or(
          [
            `saree_name.ilike.%${searchTerm}%`,
            `fabric.ilike.%${searchTerm}%`,
            `colour.ilike.%${searchTerm}%`,
            `pattern.ilike.%${searchTerm}%`,
            `occasion.ilike.%${searchTerm}%`,
            `description.ilike.%${searchTerm}%`
          ].join(',')
        );

    }

  }


  /* =======================================================
     SORT
  ======================================================== */

  if (
    options.sort ===
    'low'
  ) {

    query =
      query.order(
        'selling_price',
        {
          ascending:true
        }
      );

  } else if (
    options.sort ===
    'high'
  ) {

    query =
      query.order(
        'selling_price',
        {
          ascending:false
        }
      );

  } else {

    query =
      query.order(
        'created_at',
        {
          ascending:false
        }
      );

  }


  /* =======================================================
     FETCH
  ======================================================== */

  const result =
    await query;


  if (result.error) {

    console.error(
      'NOOLTHARI product loading error:',
      result.error
    );


    element.innerHTML = `
      <p class="empty">
        Unable to load products.
      </p>
    `;

    return;
  }


  const products =
    result.data || [];


  if (!products.length) {

    element.innerHTML = `
      <p class="empty">
        No sarees found.
      </p>
    `;

    return;
  }


  const profile =
    await NL.profile();


  const cartQuantities =
    profile?.id
      ? await getShopCartQuantities(
          profile.id
        )
      : {};


  element.innerHTML =
    products
      .map(
        product =>
          card(
            product,
            cartQuantities
          )
      )
      .join('');


  if (
    profile?.id
  ) {

    await updateShopCartBadge(
      profile.id
    );

  }


  NL.qsa(
    '.product-card',
    element
  ).forEach(cardElement => {

    bindShopCardButtons(
      cardElement
    );

  });

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

  const customer =
    await NL.requireRole(
      'customer'
    );


  if (!customer) {
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


    const result =
      await addOneUnitToCart(
        productId,
        customer.id
      );


    await updateShopCartBadge(
      customer.id
    );


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

async function shopChangeQuantity(
  productId,
  action,
  cardElement
) {

  const customer =
    await NL.requireRole(
      'customer'
    );


  if (!customer) {
    return;
  }


  if (!cardElement) {

    console.error(
      'NOOLTHARI quantity error: product card not found.'
    );

    return;

  }


  const quantityControl =
    cardElement.querySelector(
      '.bag-quantity-control'
    );


  const currentQuantity =
    Math.max(
      0,
      Number(
        quantityControl?.dataset.quantity ||
        0
      )
    );


  let nextQuantity =
    currentQuantity;


  if (
    action ===
    'increase'
  ) {

    nextQuantity =
      currentQuantity + 1;

  } else if (
    action ===
    'decrease'
  ) {

    nextQuantity =
      Math.max(
        0,
        currentQuantity - 1
      );

  } else if (
    action ===
    'remove'
  ) {

    nextQuantity =
      0;

  } else {

    return;

  }


  const buttons =
    cardElement.querySelectorAll(
      '.bag-qty-btn'
    );


  buttons.forEach(button => {

    button.disabled =
      true;

  });


  try {

    const result =
      await changeShopCartQuantity(
        productId,
        customer.id,
        nextQuantity
      );


    await updateShopCartBadge(
      customer.id
    );


    /*
       IMPORTANT:
       Use the actual quantity button that belongs
       to this card.

       Never create a detached/dummy button here.
    */

    const stateButton =
      cardElement.querySelector(
        '.bag-qty-remove, ' +
        '.bag-qty-minus, ' +
        '.bag-qty-plus'
      );


    if (!stateButton) {

      console.error(
        'NOOLTHARI quantity error: current quantity button not found.'
      );

      return;

    }


    updateShopQuantityControl(
      stateButton,
      result.stock,
      result.quantity
    );


    if (
      result.quantity <= 0
    ) {

      NL.toast(
        'Saree removed from your bag.',
        'success'
      );

    } else {

      NL.toast(
        `Quantity updated to ${result.quantity}.`,
        'success'
      );

    }


  } catch (error) {

    console.error(
      'NOOLTHARI quantity update error:',
      error
    );


    NL.toast(
      error.message ||
      'Unable to update bag quantity.',
      'error'
    );


    buttons.forEach(button => {

      button.disabled =
        false;

    });

  }

}


/* =========================================================
   GLOBAL addToCart
   Used by product detail page and other callers.

   +1 quantity
   → cart.html
========================================================= */

async function addToCart(
  productId
) {

  const customer =
    await NL.requireRole(
      'customer'
    );


  if (!customer) {
    return;
  }


  try {

    await addOneUnitToCart(
      productId,
      customer.id
    );


    location.href =
      NL.path(
        'cart.html'
      );


  } catch (error) {

    console.error(
      'NOOLTHARI addToCart error:',
      error
    );


    NL.toast(
      error.message ||
      'Unable to add this saree to your bag.',
      'error'
    );

  }

}