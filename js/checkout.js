document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     CUSTOMER AUTH
  ======================================================== */

  const customer =
    await NL.requireRole('customer');

  if (!customer) {
    return;
  }

  try {
    if (typeof syncGuestCartToAccount === 'function') {
      await syncGuestCartToAccount(customer.id);
    }
  } catch (error) {
    console.error('Guest bag sync failed before checkout:', error);
    NL.toast('We could not safely sync your bag. Please return to your bag and try again.', 'error');
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

  const pendingPaymentNote = NL.qs('#pending-payment-note');
  const pendingOrderLink = NL.qs('#pending-order-link');

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
              0
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

  // Reuse an existing pending Razorpay order after a refresh or a closed
  // checkout. This prevents duplicate charges and survives device navigation.
  let pendingPaymentResponse = null;
  let activePaymentData = null;

  function resetPaymentButton(label = 'Pay securely') {
    payButton.disabled = false;
    payButton.textContent = label;
  }

  function showPendingPayment(paymentData) {
    if (!paymentData || !(Number(paymentData.amount) > 0)) return;
    checkoutTotal.textContent = NL.money(Number(paymentData.amount) / 100);
    if (pendingPaymentNote) pendingPaymentNote.hidden = false;
  }

  async function restorePendingPayment() {
    const result = await sb
      .from('orders')
      .select('id, status, order_number, reservation_expires_at, payments(razorpay_order_id, amount, status, razorpay_payment_id)')
      .eq('customer_id', customer.id)
      .in('status', ['payment_pending', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(25);

    if (result.error) {
      console.error('Pending payment lookup error:', result.error);
      return;
    }

    const candidates = result.data || [];
    const getPayment = order => Array.isArray(order?.payments)
      ? order.payments[0]
      : order?.payments;

    // Captured payments are surfaced first, even when a reservation has
    // expired or an expiry job already cancelled the order. Never offer a
    // second charge until this payment has been reconciled/refunded.
    const capturedOrder = candidates.find(order => getPayment(order)?.status === 'captured');
    if (capturedOrder) {
      const payment = getPayment(capturedOrder);
      checkoutTotal.textContent = NL.money(Number(payment.amount));
      activePaymentData = null;
      payButton.disabled = true;
      payButton.textContent = 'Payment received';
      if (pendingPaymentNote) {
        pendingPaymentNote.hidden = false;
        pendingPaymentNote.textContent = 'Your payment has been captured. Do not pay again. Order confirmation is being checked; contact support if the status does not update.';
      }
      if (pendingOrderLink) {
        pendingOrderLink.href = NL.path(`order-details.html?id=${encodeURIComponent(capturedOrder.id)}`);
        pendingOrderLink.hidden = false;
      }
      return;
    }

    const order = candidates.find(item =>
      item.status === 'payment_pending' &&
      item.reservation_expires_at &&
      new Date(item.reservation_expires_at).getTime() > Date.now()
    );
    const payment = getPayment(order);

    if (!order?.id || !payment?.razorpay_order_id || !(Number(payment.amount) > 0)) {
      return;
    }

    activePaymentData = {
      order_id: order.id,
      razorpay_order_id: payment.razorpay_order_id,
      amount: Math.round(Number(payment.amount) * 100),
      currency: 'INR'
    };
    resetPaymentButton('Continue payment');
    showPendingPayment(activePaymentData);
    if (pendingPaymentNote) {
      pendingPaymentNote.textContent = 'A payment is already in progress for this saved order. Continue the same secure payment; changes made to your bag are not included in this order.';
    }
    if (pendingOrderLink) pendingOrderLink.hidden = true;
  }

  async function verifyPaymentResponse(paymentResponse) {
    payButton.disabled = true;
    payButton.textContent = 'Verifying payment…';

    try {
      const verifyResult = await sb.functions.invoke(
        NOOLTHARI_CONFIG.PAYMENT_FUNCTION_VERIFY,
        { body: paymentResponse }
      );

      if (verifyResult.error) throw verifyResult.error;

      const verifyData = verifyResult.data;
      if (!verifyData?.verified || !verifyData?.order_id) {
        throw new Error(
          verifyData?.message || 'Payment verification is still pending.'
        );
      }

      pendingPaymentResponse = null;
      activePaymentData = null;
      location.href = NL.path(
        'order-details.html?id=' + encodeURIComponent(verifyData.order_id)
      );
      return true;
    } catch (error) {
      console.error('Payment verification error:', error);
      pendingPaymentResponse = paymentResponse;
      resetPaymentButton('Retry payment verification');
      NL.toast(
        'Your payment may have succeeded, but confirmation is pending. Do not pay again. Use “Retry payment verification” to check the same payment.',
        'warning'
      );
      return false;
    }
  }

  function openRazorpayCheckout(paymentData) {
    payButton.disabled = true;
    payButton.textContent = 'Opening secure payment…';

    const razorpay = new Razorpay({
      key: NOOLTHARI_CONFIG.RAZORPAY_KEY_ID,
      amount: paymentData.amount,
      currency: paymentData.currency || 'INR',
      name: 'NOOLTHARI™',
      description: 'Premium saree order',
      order_id: paymentData.razorpay_order_id,
      prefill: {
        name: customer.name || '',
        email: customer.email || ''
      },
      theme: { color: '#124D56' },
      modal: {
        ondismiss: () => {
          // Keep the 30-minute reservation and reuse its Razorpay order if the
          // customer closes the modal. Do not cancel while a payment may settle.
          resetPaymentButton(activePaymentData ? 'Continue payment' : 'Pay securely');
        }
      },
      handler: async paymentResponse => {
        pendingPaymentResponse = paymentResponse;
        await verifyPaymentResponse(paymentResponse);
      }
    });

    razorpay.on('payment.failed', async event => {
      const failedOrderId = activePaymentData?.order_id;
      NL.toast(
        event.error?.description || 'Payment attempt failed. We are closing this unpaid order so it does not remain stuck.',
        'error'
      );
      if (!failedOrderId) return;
      try {
        const cancelled = await sb.rpc('cancel_own_pending_order', { p_order_id: failedOrderId });
        if (cancelled.error) throw cancelled.error;
        if (!cancelled.data?.cancelled) throw new Error('The order is no longer safely cancellable. Please refresh My Orders and check payment status before retrying.');
        activePaymentData = null;
        pendingPaymentResponse = null;
        resetPaymentButton('Try payment again');
        NL.toast('The failed order was cancelled and its reserved stock was released. You can place a fresh order from your cart.', 'success');
      } catch (error) {
        console.error('Failed payment order cancellation requires review:', error);
        resetPaymentButton('Check payment status');
        NL.toast('Payment failed, but the order could not be closed automatically. Please check My Orders before trying again.', 'warning');
      }
    });

    razorpay.open();
  }

  // A pending order may have been created before a browser refresh or network
  // interruption. Rehydrate it from the user's own order/payment rows.
  await restorePendingPayment();

  payButton.onclick = async () => {
    if (pendingPaymentResponse) {
      await verifyPaymentResponse(pendingPaymentResponse);
      return;
    }

    if (activePaymentData) {
      try {
        openRazorpayCheckout(activePaymentData);
      } catch (error) {
        console.error('Could not reopen Razorpay checkout:', error);
        resetPaymentButton('Continue payment');
        NL.toast('Unable to open the secure payment window. Please try again.', 'error');
      }
      return;
    }

    const addressId = NL.qs('input[name="address"]:checked')?.value;
    if (!addressId) {
      NL.toast('Select a shipping address.', 'error');
      return;
    }

    payButton.disabled = true;
    payButton.textContent = 'Preparing secure payment…';

    try {
      const createResult = await sb.functions.invoke(
        NOOLTHARI_CONFIG.PAYMENT_FUNCTION_CREATE,
        { body: { address_id: addressId } }
      );

      if (createResult.error) throw createResult.error;

      const paymentData = createResult.data;
      if (!paymentData?.razorpay_order_id || !paymentData?.order_id || !paymentData?.amount) {
        throw new Error(paymentData?.message || 'Could not create payment order.');
      }

      activePaymentData = paymentData;
      showPendingPayment(paymentData);
      if (pendingPaymentNote) {
        pendingPaymentNote.textContent = 'A payment is already in progress for this saved order. Continue the same secure payment; changes made to your bag are not included in this order.';
      }
      try {
        openRazorpayCheckout(paymentData);
      } catch (error) {
        console.error('Could not open Razorpay checkout:', error);
        resetPaymentButton('Continue payment');
        NL.toast('Your bag and payment reservation are safe. Tap “Continue payment” to retry.', 'warning');
      }
    } catch (error) {
      console.error('Payment start error:', error);
      resetPaymentButton();
      // If the server completed order creation but the response was lost,
      // restore and reuse that order instead of starting a second charge.
      await restorePendingPayment();
      if (activePaymentData) {
        NL.toast('A secure payment is already pending. Continue the same payment; your bag has been kept safe.', 'warning');
      } else {
        NL.toast(error.message || 'Unable to start payment.', 'error');
      }
    }
  };

});