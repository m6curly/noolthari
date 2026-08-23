document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     CUSTOMER AUTH
  ======================================================== */

  const customer =
    await NL.requireRole('customer');

  if (!customer) {
    return;
  }


  /* =======================================================
     ELEMENTS
  ======================================================== */

  const addressList =
    NL.qs('#address-list');

  const addressForm =
    NL.qs('#address-form');

  const checkoutTotal =
    NL.qs('#checkout-total');

  const payButton =
    NL.qs('#pay-btn');


  if (!addressList || !addressForm || !checkoutTotal || !payButton) {
    return;
  }


  /* =======================================================
     REFRESH CHECKOUT
  ======================================================== */

  async function refresh() {

    /* -----------------------------------------------------
       LOAD ADDRESSES
    ------------------------------------------------------ */

    const addressResult =
      await sb
        .from('addresses')
        .select('*')
        .eq(
          'customer_id',
          customer.id
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (addressResult.error) {

      console.error(
        'Address loading error:',
        addressResult.error
      );

      addressList.innerHTML = `
        <p class="empty">
          Unable to load your delivery addresses.
        </p>
      `;

      NL.toast(
        addressResult.error.message,
        'error'
      );

      return;
    }


    const addresses =
      addressResult.data || [];


    /* -----------------------------------------------------
       RENDER ADDRESSES
    ------------------------------------------------------ */

    if (!addresses.length) {

      addressList.innerHTML = `
        <p class="empty">
          Add your delivery address.
        </p>
      `;

    } else {

      addressList.innerHTML =
        addresses
          .map(
            (address, index) => `
              <label class="address-card">

                <input
                  name="address"
                  type="radio"
                  value="${NL.esc(
                    address.id
                  )}"
                  ${index === 0 ? 'checked' : ''}
                >


                <strong>
                  ${NL.esc(
                    address.full_name || ''
                  )}
                </strong>


                <span>
                  ${NL.esc(
                    address.address_line1 || ''
                  )}

                  ${
                    address.address_line2
                      ? `, ${NL.esc(
                          address.address_line2
                        )}`
                      : ''
                  }
                </span>


                <span>
                  ${NL.esc(
                    address.city || ''
                  )},

                  ${NL.esc(
                    address.state || ''
                  )}

                  —

                  ${NL.esc(
                    address.postal_code || ''
                  )}
                </span>


                <span>
                  ${NL.esc(
                    address.phone || ''
                  )}
                </span>

              </label>
            `
          )
          .join('');

    }


    /* -----------------------------------------------------
       LOAD CART
    ------------------------------------------------------ */

    const cartResult =
      await sb
        .from('cart')
        .select('id')
        .eq(
          'customer_id',
          customer.id
        )
        .maybeSingle();


    if (cartResult.error) {

      console.error(
        'Checkout cart loading error:',
        cartResult.error
      );

      NL.toast(
        cartResult.error.message,
        'error'
      );

      return;
    }


    const cart =
      cartResult.data;


    let items = [];


    if (cart) {

      const itemsResult =
        await sb
          .from('cart_items')
          .select(`
            quantity,
            products(
              selling_price,
              sale_price
            )
          `)
          .eq(
            'cart_id',
            cart.id
          );


      if (itemsResult.error) {

        console.error(
          'Checkout cart items error:',
          itemsResult.error
        );

        NL.toast(
          itemsResult.error.message,
          'error'
        );

        return;
      }


      items =
        itemsResult.data || [];

    }


    /* -----------------------------------------------------
       CALCULATE TOTAL
    ------------------------------------------------------ */

    const total =
      items.reduce(
        (sum, item) => {

          const product =
            item.products;


          if (!product) {
            return sum;
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


          const quantity =
            Math.max(
              0,
              Number(
                item.quantity || 0
              )
            );


          return sum +
            price * quantity;

        },
        0
      );


    checkoutTotal.textContent =
      NL.money(total);

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await refresh();


  /* =======================================================
     ADD DELIVERY ADDRESS
  ======================================================== */

  addressForm.onsubmit =
    async event => {

      event.preventDefault();


      const form =
        new FormData(
          addressForm
        );


      const address = {

        customer_id:
          customer.id,

        full_name:
          form.get(
            'full_name'
          ),

        phone:
          form.get(
            'phone'
          ),

        address_line1:
          form.get(
            'address_line1'
          ),

        address_line2:
          form.get(
            'address_line2'
          ),

        city:
          form.get(
            'city'
          ),

        state:
          form.get(
            'state'
          ),

        postal_code:
          form.get(
            'postal_code'
          ),

        country:
          'India'

      };


      const result =
        await sb
          .from('addresses')
          .insert(
            address
          );


      if (result.error) {

        console.error(
          'Address save error:',
          result.error
        );

        NL.toast(
          result.error.message,
          'error'
        );

        return;
      }


      addressForm.reset();


      NL.toast(
        'Address saved.',
        'success'
      );


      await refresh();

    };


  /* =======================================================
     PAYMENT
  ======================================================== */

  payButton.onclick =
    async () => {

      const addressId =
        NL.qs(
          'input[name="address"]:checked'
        )?.value;


      if (!addressId) {

        NL.toast(
          'Select a shipping address.',
          'error'
        );

        return;
      }


      payButton.disabled =
        true;

      payButton.textContent =
        'Preparing secure payment…';


      try {

        /* -----------------------------------------------
           CREATE RAZORPAY ORDER
        ------------------------------------------------ */

        const createResult =
          await sb.functions.invoke(
            NOOLTHARI_CONFIG.PAYMENT_FUNCTION_CREATE,
            {
              body: {
                address_id:
                  addressId
              }
            }
          );


        if (createResult.error) {
          throw createResult.error;
        }


        const paymentData =
          createResult.data;


        if (
          !paymentData?.razorpay_order_id
        ) {

          throw new Error(
            paymentData?.message ||
            'Could not create payment order.'
          );

        }


        /* -----------------------------------------------
           RAZORPAY CHECKOUT
        ------------------------------------------------ */

        const razorpay =
          new Razorpay({

            key:
              NOOLTHARI_CONFIG.RAZORPAY_KEY_ID,

            amount:
              paymentData.amount,

            currency:
              'INR',

            name:
              'NOOLTHARI™',

            description:
              'Premium saree order',

            order_id:
              paymentData.razorpay_order_id,

            prefill: {

              name:
                customer.name,

              email:
                customer.email

            },

            theme: {
              color:
                '#124D56'
            },


            /* -------------------------------------------
               PAYMENT SUCCESS
            -------------------------------------------- */

            handler:
              async paymentResponse => {

                try {

                  const verifyResult =
                    await sb.functions.invoke(
                      NOOLTHARI_CONFIG.PAYMENT_FUNCTION_VERIFY,
                      {
                        body:
                          paymentResponse
                      }
                    );


                  if (
                    verifyResult.error
                  ) {
                    throw verifyResult.error;
                  }


                  const verifyData =
                    verifyResult.data;


                  if (
                    !verifyData?.verified
                  ) {

                    throw new Error(
                      verifyData?.message ||
                      'Payment verification failed.'
                    );

                  }


                  location.href =
                    NL.path(
                      'order-details.html?id=' +
                      verifyData.order_id
                    );


                } catch (error) {

                  console.error(
                    'Payment verification error:',
                    error
                  );


                  NL.toast(
                    error.message ||
                    'Payment verification failed.',
                    'error'
                  );


                  payButton.disabled =
                    false;

                  payButton.textContent =
                    'Pay securely';

                }

              }

          });


        /* -----------------------------------------------
           PAYMENT FAILED
        ------------------------------------------------ */

        razorpay.on(
          'payment.failed',
          event => {

            NL.toast(
              event.error?.description ||
              'Payment failed.',
              'error'
            );


            payButton.disabled =
              false;

            payButton.textContent =
              'Pay securely';

          }
        );


        /* -----------------------------------------------
           OPEN PAYMENT
        ------------------------------------------------ */

        razorpay.open();

      } catch (error) {

        console.error(
          'Payment start error:',
          error
        );


        NL.toast(
          error.message ||
          'Unable to start payment.',
          'error'
        );


        payButton.disabled =
          false;

        payButton.textContent =
          'Pay securely';

      }

    };

});