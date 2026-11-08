document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ELEMENTS
  ======================================================== */

  const cartList =
    NL.qs('#cart-list');

  if (!cartList) {
    return;
  }


  const cartTotal =
    NL.qs('#cart-total');

  const checkoutButton =
    NL.qs('#checkout');


  /* =======================================================
     GUEST BAG — browser-local until sign-in.
     Prices and stock are refreshed from Supabase; checkout
     always revalidates the cart server-side.
  ======================================================== */

  async function renderGuestCart() {
    let guestItems = readGuestCart();
    const ids = Object.keys(guestItems);

    if (!ids.length) {
      cartList.innerHTML = '<p class="empty">Your bag is empty. Explore our collection to find your saree.</p>';
      if (cartTotal) cartTotal.textContent = NL.money(0);
      if (checkoutButton) checkoutButton.textContent = 'Continue to sign in';
      return;
    }

    const result = await sb.from('products')
      .select('id,saree_name,selling_price,stock_quantity,status,product_images(public_url,sort_order)')
      .in('id', ids)
      .eq('status', 'active');
    if (result.error) throw result.error;

    const products = result.data || [];
    const byId = new Map(products.map(product => [String(product.id), product]));
    let total = 0;
    const rows = [];

    for (const [productId, requestedQty] of Object.entries(guestItems)) {
      const product = byId.get(String(productId));
      const stock = Math.max(0, Number(product?.stock_quantity || 0));
      const quantity = Math.min(Math.max(0, Number(requestedQty) || 0), stock);
      if (!product || quantity <= 0) {
        delete guestItems[productId];
        continue;
      }
      if (quantity !== requestedQty) guestItems[productId] = quantity;
      const selling = Math.max(0, Number(product.selling_price || 0));
      const sale = Math.max(0, Number(0));
      const price = sale > 0 && sale < selling ? sale : selling;
      total += price * quantity;
      const image = typeof imgFor === 'function' ? imgFor(product) : NL.path('assets/logo/noolthari-logo.webp');
      rows.push(`
        <div class="cart-item">
          <img src="${NL.esc(image)}" alt="${NL.esc(product.saree_name || 'Saree')}">
          <div>
            <a href="${NL.path('product.html?id=' + encodeURIComponent(product.id))}">${NL.esc(product.saree_name || '')}</a>
            <p>${NL.money(price)}</p>
            <div class="qty" aria-label="Quantity controls">
              <button type="button" class="guest-cart-step" data-id="${NL.esc(productId)}" data-step="-1" aria-label="Decrease quantity">−</button>
              <span>${quantity}</span>
              <button type="button" class="guest-cart-step" data-id="${NL.esc(productId)}" data-step="1" data-stock="${stock}" aria-label="Increase quantity" ${quantity >= stock ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <button class="text-btn guest-cart-remove" type="button" data-id="${NL.esc(productId)}">Remove</button>
        </div>`);
    }

    writeGuestCart(guestItems);
    cartList.innerHTML = rows.length ? rows.join('') : '<p class="empty">Your bag is empty. Some items are no longer available.</p>';
    if (cartTotal) cartTotal.textContent = NL.money(total);
    if (checkoutButton) checkoutButton.textContent = 'Sign in to checkout';

    NL.qsa('.guest-cart-step, .guest-cart-remove', cartList).forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const current = Number(readGuestCart()[button.dataset.id] || 0);
          if (button.classList.contains('guest-cart-remove')) {
            await changeGuestCartQuantity(button.dataset.id, 0);
          } else {
            const step = Number(button.dataset.step || 0);
            await changeGuestCartQuantity(button.dataset.id, current + step);
          }
          await renderGuestCart();
          if (typeof updateShopCartBadge === 'function') await updateShopCartBadge(null);
        } catch (error) {
          NL.toast(error.message || 'Unable to update your bag.', 'error');
          button.disabled = false;
        }
      });
    });
  }

  const profile = await NL.profile();
  if (!profile) {
    try {
      await renderGuestCart();
    } catch (error) {
      console.error('Guest bag loading error:', error);
      cartList.innerHTML = '<p class="empty" role="alert">Unable to load your bag. Please refresh and try again.</p>';
      NL.toast('Unable to load your bag.', 'error');
    }
    if (checkoutButton) checkoutButton.onclick = () => {
      location.href = NL.path('login.html?next=checkout.html');
    };
    return;
  }
  if (profile.role !== 'customer') {
    NL.toast('Please use a customer account to access the shopping bag.', 'info');
    location.href = NL.path('index.html');
    return;
  }

  try {
    if (typeof syncGuestCartToAccount === 'function') await syncGuestCartToAccount(profile.id);
  } catch (error) {
    console.error('Guest bag sync failed:', error);
    NL.toast('Your saved bag could not be merged. Please try again.', 'error');
    return;
  }


  /* =======================================================
     LOAD CUSTOMER CART
  ======================================================== */

  const cartResult =
    await sb
      .from('cart')
      .select('id')
      .eq(
        'customer_id',
        profile.id
      )
      .maybeSingle();


  if (cartResult.error) {

    console.error(
      'Cart loading error:',
      cartResult.error
    );

    cartList.innerHTML = `
      <p class="empty">
        Unable to load your bag.
      </p>
    `;

    NL.toast(
      cartResult.error.message,
      'error'
    );

    return;
  }


  const cart =
    cartResult.data;


  if (!cart) {

    cartList.innerHTML = `
      <p class="empty">
        Your bag is empty.
      </p>
    `;


    if (cartTotal) {
      cartTotal.textContent =
        NL.money(0);
    }


    return;
  }


  /* =======================================================
     RENDER CART
  ======================================================== */

  async function render() {

    const result =
      await sb
        .from('cart_items')
        .select(`
          id,
          quantity,
          products(
            id,
            saree_name,
            selling_price,

            stock_quantity,
            product_images(
              public_url,
              sort_order
            )
          )
        `)
        .eq(
          'cart_id',
          cart.id
        );


    if (result.error) {

      console.error(
        'Cart items loading error:',
        result.error
      );

      cartList.innerHTML = `
        <p class="empty">
          Unable to load your bag.
        </p>
      `;

      NL.toast(
        result.error.message,
        'error'
      );

      return;
    }


    const items =
      result.data || [];


    /* =====================================================
       EMPTY CART
    ====================================================== */

    if (!items.length) {

      cartList.innerHTML = `
        <p class="empty">
          Your bag is empty.
        </p>
      `;


      if (cartTotal) {
        cartTotal.textContent =
          NL.money(0);
      }


      return;
    }


    /* =====================================================
       BUILD CART
    ====================================================== */

    let total = 0;


    cartList.innerHTML =
      items
        .map(item => {

          const product =
            item.products;


          if (!product) {
            return '';
          }


          const sellingPrice =
            Number(
              product.selling_price || 0
            );


          const salePrice =
            Number(
              0
            );


          const price =
            salePrice > 0 &&
            salePrice < sellingPrice
              ? salePrice
              : sellingPrice;


          const stock =
            Math.max(
              0,
              Number(
                product.stock_quantity || 0
              )
            );


          const quantity =
            Math.max(
              0,
              Number(
                item.quantity || 0
              )
            );


          total +=
            price * quantity;


          const image =
            typeof imgFor === 'function'
              ? imgFor(product)
              : NL.path(
                  'assets/logo/noolthari-logo.webp'
                );


          return `
            <div class="cart-item">

              <img
                src="${NL.esc(image)}"
                alt="${NL.esc(
                  product.saree_name || ''
                )}"
              >


              <div>

                <a
                  href="${NL.path(
                    'product.html?id=' +
                    product.id
                  )}"
                >
                  ${NL.esc(
                    product.saree_name || ''
                  )}
                </a>


                <p>
                  ${NL.money(price)}
                </p>


                <div class="qty">


                  <!-- DECREASE -->

                  <button
                    type="button"
                    data-id="${NL.esc(
                      item.id
                    )}"
                    data-step="-1"
                    aria-label="Decrease quantity"
                    ${
                      quantity <= 1
                        ? ''
                        : ''
                    }
                  >
                    −
                  </button>


                  <span>
                    ${quantity}
                  </span>


                  <!-- INCREASE -->

                  <button
                    type="button"
                    data-id="${NL.esc(
                      item.id
                    )}"
                    data-step="1"
                    data-stock="${stock}"
                    aria-label="Increase quantity"
                    ${
                      quantity >= stock
                        ? 'disabled'
                        : ''
                    }
                  >
                    +
                  </button>


                </div>

              </div>


              <!-- REMOVE -->

              <button
                class="text-btn"
                type="button"
                data-delete="${NL.esc(
                  item.id
                )}"
              >
                Remove
              </button>

            </div>
          `;

        })
        .join('');


    /* =====================================================
       CART TOTAL
    ====================================================== */

    if (cartTotal) {

      cartTotal.textContent =
        NL.money(total);

    }


    /* =====================================================
       QUANTITY CONTROLS
    ====================================================== */

    NL.qsa(
      '[data-step]',
      cartList
    ).forEach(button => {

      button.onclick =
        async () => {

          const item =
            items.find(
              currentItem =>
                currentItem.id ===
                button.dataset.id
            );


          if (!item || !item.products) {
            return;
          }


          const currentQuantity =
            Math.max(
              0,
              Number(
                item.quantity || 0
              )
            );


          const stock =
            Math.max(
              0,
              Number(
                item.products.stock_quantity ||
                0
              )
            );


          const step =
            Number(
              button.dataset.step
            );


          /*
             Never allow cart quantity
             to exceed current stock.
          */

          let nextQuantity =
            currentQuantity + step;


          nextQuantity =
            Math.max(
              0,
              Math.min(
                nextQuantity,
                stock
              )
            );


          button.disabled =
            true;


          try {

            let updateResult;


            if (
              nextQuantity === 0
            ) {

              updateResult =
                await sb
                  .from('cart_items')
                  .delete()
                  .eq(
                    'id',
                    item.id
                  );

            } else {

              updateResult =
                await sb
                  .from('cart_items')
                  .update({
                    quantity:
                      nextQuantity
                  })
                  .eq(
                    'id',
                    item.id
                  );

            }


            if (updateResult.error) {
              throw updateResult.error;
            }


            await render();


          } catch (error) {

            console.error(
              'Cart quantity update error:',
              error
            );


            NL.toast(
              error.message ||
              'Unable to update quantity.',
              'error'
            );


            button.disabled =
              false;

          }

        };

    });


    /* =====================================================
       REMOVE ITEMS
    ====================================================== */

    NL.qsa(
      '[data-delete]',
      cartList
    ).forEach(button => {

      button.onclick =
        async () => {

          const itemId =
            button.dataset.delete;


          if (!itemId) {
            return;
          }


          button.disabled =
            true;


          try {

            const result =
              await sb
                .from('cart_items')
                .delete()
                .eq(
                  'id',
                  itemId
                );


            if (result.error) {
              throw result.error;
            }


            await render();


          } catch (error) {

            console.error(
              'Cart item removal error:',
              error
            );


            NL.toast(
              error.message ||
              'Unable to remove item.',
              'error'
            );


            button.disabled =
              false;

          }

        };

    });

  }


  /* =======================================================
     INITIAL RENDER
  ======================================================== */

  await render();


  /* =======================================================
     CHECKOUT
  ======================================================== */

  if (checkoutButton) {

    checkoutButton.onclick =
      () => {

        location.href =
          NL.path(
            'checkout.html'
          );

      };

  }

});