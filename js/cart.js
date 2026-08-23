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
     CUSTOMER AUTH
  ======================================================== */

  const profile =
    await NL.requireRole('customer');

  if (!profile) {
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
            sale_price,
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
              product.sale_price || 0
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
                  'assets/logo/noolthari-logo.png'
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