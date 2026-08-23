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
   PRODUCT CARD
   No wishlist / heart button
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


  const bagLimitReached =
    stock > 0 &&
    inBag >= stock;


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
    <article class="product-card">

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


          <button
            class="btn btn-outline add"
            type="button"
            data-id="${NL.esc(
              product.id
            )}"
            data-stock="${stock}"
            data-in-bag="${inBag}"
            ${
              outOfStock ||
              bagLimitReached
                ? 'disabled'
                : ''
            }
          >

            ${
              bagLimitReached
                ? `In bag · ${inBag}`
                : 'Add to bag'
            }

          </button>


          <button
            class="btn btn-gold buy-now"
            type="button"
            data-id="${NL.esc(
              product.id
            )}"
            ${
              outOfStock
                ? 'disabled'
                : ''
            }
          >
            ${
              outOfStock
                ? 'Out of stock'
                : 'Buy now'
            }
          </button>


        </div>

      </div>

    </article>
  `;

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


  const cardElement =
    button.closest(
      '.product-card'
    );


  const stockHint =
    cardElement?.querySelector(
      '.product-stock-hint'
    );


  if (
    safeQuantity >=
    safeStock
  ) {

    button.disabled =
      true;

    button.textContent =
      safeStock > 0
        ? `In bag · ${safeQuantity}`
        : 'Out of stock';

  } else {

    button.disabled =
      false;

    button.textContent =
      'Add to bag';

  }


  button.dataset.inBag =
    String(
      safeQuantity
    );


  button.dataset.stock =
    String(
      safeStock
    );


  if (stockHint) {

    stockHint.textContent =
      safeQuantity > 0
        ? `${safeStock} available · ${safeQuantity} in bag`
        : `${safeStock} available`;

  }

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
   Used by "Add to Bag"
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
   BUY NOW CART ACTION

   Product NOT in bag
   → add exactly 1

   Product ALREADY in bag
   → leave quantity unchanged

   Then:
   → checkout.html
========================================================= */

async function prepareBuyNow(
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


  /* =====================================================
     NOT IN BAG
     → ADD ONE
  ====================================================== */

  if (!existing) {

    await saveCartQuantity(
      cart.id,
      productId,
      1
    );


    return {
      cart,
      stock,
      quantity:1
    };

  }


  /* =====================================================
     ALREADY IN BAG
     → DO NOT CHANGE QUANTITY
  ====================================================== */

  const existingQuantity =
    Math.max(
      0,
      Number(
        existing.quantity || 0
      )
    );


  /*
     Safety check:
     If stock has decreased below the quantity already
     in the cart, don't silently create an invalid checkout.
  */

  if (
    existingQuantity >
    stock
  ) {

    throw new Error(
      `Only ${stock} unit${
        stock === 1
          ? ''
          : 's'
      } currently available. Please update your bag.`
    );

  }


  return {
    cart,
    stock,
    quantity:
      existingQuantity
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

    query =
      query.ilike(
        'saree_name',
        `%${options.search}%`
      );

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


  /* =======================================================
     PROFILE
  ======================================================== */

  const profile =
    await NL.profile();


  /* =======================================================
     CURRENT CART QUANTITIES
  ======================================================== */

  const cartQuantities =
    profile?.id
      ? await getShopCartQuantities(
          profile.id
        )
      : {};


  /* =======================================================
     RENDER CARDS
  ======================================================== */

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


  /* =======================================================
     CART BADGE
  ======================================================== */

  if (
    profile?.id
  ) {

    await updateShopCartBadge(
      profile.id
    );

  }


  /* =======================================================
     ADD TO BAG EVENTS
  ======================================================== */

  NL.qsa(
    '.add',
    element
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
     BUY NOW EVENTS
  ======================================================== */

  NL.qsa(
    '.buy-now',
    element
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();
        event.stopPropagation();


        await shopBuyNow(
          button.dataset.id,
          button
        );

      };

  });

}


/* =========================================================
   ADD TO BAG — SHOP PAGE
   +1 quantity
   NO REDIRECT
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
    button?.textContent ||
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
      result.quantity === 1
        ? 'Saree added to your bag.'
        : `${result.quantity} in your bag.`,
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
   BUY NOW — SHOP PAGE
   NEVER increases an existing quantity
========================================================= */

async function shopBuyNow(
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
    button?.textContent ||
    'Buy now';


  try {

    if (button) {

      button.disabled =
        true;

      button.textContent =
        'Preparing...';

    }


    await prepareBuyNow(
      productId,
      customer.id
    );


    await updateShopCartBadge(
      customer.id
    );


    /* =====================================================
       DIRECT CHECKOUT
    ====================================================== */

    location.href =
      NL.path(
        'checkout.html'
      );


  } catch (error) {

    console.error(
      'NOOLTHARI buy-now error:',
      error
    );


    NL.toast(
      error.message ||
      'Unable to continue to checkout.',
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