document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ADMIN AUTH
  ======================================================== */

  const profile =
    await NL.requireRole('admin');

  if (!profile) {
    return;
  }


  /* =======================================================
     ELEMENTS
  ======================================================== */

  const id =
    NL.query.get('id');

  const rootEl =
    NL.qs('#order-admin');


  if (!rootEl) {
    return;
  }


  if (!id) {

    rootEl.innerHTML = `
      <p class="empty">
        Missing order ID.
      </p>
    `;

    return;
  }


  /* =======================================================
     LOAD ORDER
  ======================================================== */

  async function load() {

    const result =
      await sb
        .from('orders')
        .select(`
          *,
          order_items(*),
          payments(*),
          shipments(*),
          profiles(name,email,phone)
        `)
        .eq(
          'id',
          id
        )
        .single();


    if (result.error) {

      console.error(
        'Order details loading error:',
        result.error
      );


      rootEl.innerHTML = `
        <div class="admin-card">

          <p class="empty">
            ${NL.esc(
              result.error.message
            )}
          </p>

          <a
            class="btn btn-outline"
            href="orders.html"
          >
            Back to orders
          </a>

        </div>
      `;

      return;
    }


    const order =
      result.data;

    const shipment =
      order.shipments?.[0] || null;

    const payment =
      order.payments?.[0] || null;
    const customerName = order.customer_name || order.profiles?.name || order.shipping_full_name || 'Customer';
    const customerEmail = order.customer_email || order.profiles?.email || '';
    const customerPhone = order.customer_phone || order.profiles?.phone || order.shipping_phone || '';
    const saleChannel = String(order.sales_channel || 'online').replaceAll('_', ' ');


    /* =====================================================
       ORDER STATUS STEPS
    ====================================================== */

    const paymentDone = [
      'paid',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered'
    ].includes(
      order.status
    );


    const processingDone = [
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered'
    ].includes(
      order.status
    );


    const shippedDone = [
      'shipped',
      'out_for_delivery',
      'delivered'
    ].includes(
      order.status
    );


    const deliveredDone =
      order.status === 'delivered';

    // Payment, cancellation and return/refund states are never changed
    // manually from the fulfilment screen. Only verified paid orders move
    // forward through the delivery stages.
    const fulfilmentStages = [
      ['paid', 'Paid'],
      ['confirmed', 'Confirmed'],
      ['processing', 'Processing'],
      ['shipped', 'Shipped'],
      ['out_for_delivery', 'Out for delivery'],
      ['delivered', 'Delivered']
    ];
    const currentStageIndex = fulfilmentStages.findIndex(([value]) => value === order.status);
    const statusEditorMarkup = currentStageIndex >= 0 && currentStageIndex < fulfilmentStages.length - 1
      ? `
        <form id="status-form">
          <div class="field">
            <label for="order-fulfilment-status">Fulfilment status</label>
            <select id="order-fulfilment-status" name="status">
              ${fulfilmentStages.slice(currentStageIndex).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-gold" type="submit">Save fulfilment status</button>
        </form>
      `
      : `<p class="order-status-explainer">${order.status === 'payment_pending'
          ? (order.payment_provider === 'manual'
              ? 'This manual sale has an outstanding customer balance. Do not mark it paid until the money is actually received; use Orders → Mark paid to record collection.'
              : 'Waiting for Razorpay to verify payment. Do not dispatch this order until payment is confirmed.')
          : ['return_requested', 'returned', 'refund_processing', 'refunded'].includes(order.status)
            ? 'This order is being handled through the Returns workflow. Refund status must match the actual Razorpay transaction.'
            : order.status === 'cancelled'
              ? 'This order is cancelled and cannot be reopened from the fulfilment screen.'
              : 'This order has been delivered. Any post-delivery request must be handled in Returns.'}</p>`;


    /* =====================================================
       RENDER ORDER
    ====================================================== */

    rootEl.innerHTML = `

      <div class="section-head">

        <div>

          <div class="eyebrow">
            Fulfilment
          </div>

          <h1
            class="page-title"
            style="margin:0"
          >
            Order
            ${NL.esc(
              order.order_number
            )}
          </h1>

        </div>


        <a
          class="btn btn-outline"
          href="orders.html"
        >
          Back to orders
        </a>

      </div>


      <div class="admin-grid-two">

        ${payment?.status === 'captured' && !paymentDone ? `
          <div class="admin-card" role="alert" style="grid-column:1/-1;border-left:4px solid #9A6A18">
            <h2>Captured payment requires reconciliation</h2>
            <p>Razorpay reports this payment as captured, but the order is not finalized. Do not collect another payment or fulfil blindly. Check the Razorpay settlement, stock reservation and order history, then arrange fulfilment or refund.</p>
          </div>
        ` : ''}

        <!-- =============================================
             ORDER DETAILS
        ============================================== -->

        <section class="admin-card">


          <div class="order-head">

            <div>

              <h2>
                ${NL.esc(customerName)}
              </h2>


              <p>

                ${NL.esc(customerEmail)}
                ${customerEmail && customerPhone ? ' · ' : ''}
                ${NL.esc(customerPhone)}
                <br><span class="order-channel">${NL.esc(saleChannel)}</span>

              </p>

            </div>


            <span class="badge">

              ${NL.esc(
                order.status || ''
              ).replaceAll(
                '_',
                ' '
              )}

            </span>

          </div>


          <!-- ===========================================
               ORDER TIMELINE
          ============================================ -->

          <div class="order-timeline">


            <div
              class="timeline-node ${
                paymentDone
                  ? 'done'
                  : ''
              }"
            >
              Payment
            </div>


            <div
              class="timeline-node ${
                processingDone
                  ? 'done'
                  : ''
              }"
            >
              Processing
            </div>


            <div
              class="timeline-node ${
                shippedDone
                  ? 'done'
                  : ''
              }"
            >
              Shipped
            </div>


            <div
              class="timeline-node ${
                deliveredDone
                  ? 'done'
                  : ''
              }"
            >
              Delivered
            </div>

          </div>


          <!-- ===========================================
               ITEMS
          ============================================ -->

          <h3>
            Items
          </h3>


          ${
            (order.order_items || [])
              .map(
                item => `
                  <div class="order-item-line">

                    <span>
                      ${NL.esc(
                        item.product_name
                      )}
                      ×
                      ${Number(
                        item.quantity || 0
                      )}
                    </span>

                    <strong>
                      ${NL.money(
                        item.line_total
                      )}
                    </strong>

                  </div>
                `
              )
              .join('')
          }


          <!-- ===========================================
               TOTAL
          ============================================ -->

          <div class="totals">

            <span>
              Total
            </span>

            <strong>
              ${NL.money(
                order.total
              )}
            </strong>

          </div>


          <!-- ===========================================
               SHIPPING ADDRESS
          ============================================ -->

          <div class="shipping-box">

            <strong>
              Shipping address
            </strong>


            <p>
              ${NL.esc(
                order.shipping_full_name ||
                ''
              )}

              ·

              ${NL.esc(
                order.shipping_phone ||
                ''
              )}
            </p>


            <p>
              ${NL.esc(
                order.shipping_address_line1 ||
                ''
              )}

              ${
                order.shipping_address_line2
                  ? `, ${NL.esc(
                      order.shipping_address_line2
                    )}`
                  : ''
              }
            </p>


            <p>
              ${NL.esc(
                order.shipping_city ||
                ''
              )},

              ${NL.esc(
                order.shipping_state ||
                ''
              )}

              —

              ${NL.esc(
                order.shipping_postal_code ||
                ''
              )}
            </p>
            ${order.internal_note ? `<p><strong>Admin note:</strong> ${NL.esc(order.internal_note)}</p>` : ''}

          </div>

        </section>


        <!-- =============================================
             ADMIN CONTROLS
        ============================================== -->

        <aside>


          <!-- ===========================================
               ORDER STATUS
          ============================================ -->

          <section class="admin-card">

            <h2>
              Status
            </h2>


            ${statusEditorMarkup}

          </section>


          <!-- ===========================================
               SHIPMENT
          ============================================ -->

          <section
            class="admin-card"
            style="margin-top:16px"
          >

            <h2>
              Shipment
            </h2>


            <form
              id="ship-form"
              class="admin-form"
            >


              <div class="field">

                <label>
                  Courier
                </label>

                <input
                  name="carrier"
                  value="${NL.esc(
                    shipment?.carrier ||
                    ''
                  )}"
                >

              </div>


              <div class="field">

                <label>
                  Tracking number
                </label>

                <input
                  name="tracking_number"
                  value="${NL.esc(
                    shipment?.tracking_number ||
                    ''
                  )}"
                >

              </div>


              <div class="field full">

                <label>
                  Tracking URL
                </label>

                <input
                  name="tracking_url"
                  value="${NL.esc(
                    shipment?.tracking_url ||
                    ''
                  )}"
                >

              </div>


              <button
                class="btn btn-gold"
                type="submit"
              >
                Save shipment
              </button>


            </form>

          </section>


          <!-- ===========================================
               PAYMENT
          ============================================ -->

          <section
            class="admin-card"
            style="margin-top:16px"
          >

            <h2>
              Payment
            </h2>


            <p>
              Status:
              <strong>
                ${NL.esc(payment?.status || (Number(order.total || 0) === 0 ? 'Not applicable — gift / collaboration' : 'No payment record'))}
              </strong>
            </p>


            <p>
              Gateway:
              ${NL.esc(
                payment?.gateway ||
                '—'
              )}
            </p>


            <p>Method: ${NL.esc(order.payment_mode || payment?.payment_method || '—')}</p>
            <p>
              Payment ID:
              ${NL.esc(payment?.razorpay_payment_id || '—')}
            </p>

          </section>

        </aside>

      </div>

    `;


    /* =====================================================
       STATUS FORM
    ====================================================== */

    const statusForm =
      NL.qs(
        '#status-form'
      );


    if (statusForm) {

      statusForm.onsubmit =
        async event => {

          event.preventDefault();


          const button =
            statusForm.querySelector(
              'button[type="submit"]'
            );

          const originalText =
            button?.textContent ||
            'Save status';


          if (button) {

            button.disabled =
              true;

            button.textContent =
              'Saving...';

          }


          try {

            const status =
              new FormData(
                event.target
              ).get(
                'status'
              );


            if (!status) {
              throw new Error('Choose a fulfilment status.');
            }

            const result =
              await sb.rpc('admin_set_order_status', {
                p_order_id: id,
                p_status: status
              });


            if (result.error) {
              throw result.error;
            }


            NL.toast(
              'Order status saved.',
              'success'
            );


            await load();


          } catch (error) {

            console.error(
              'Order status save error:',
              error
            );


            NL.toast(
              error.message ||
              'Unable to save order status.',
              'error'
            );


            if (button) {

              button.disabled =
                false;

              button.textContent =
                originalText;

            }

          }

        };

    }


    /* =====================================================
       SHIPMENT FORM

       IMPORTANT FIX:
       One shipment per order is enforced by:
       shipments_order_id_key

       Therefore:
       - Existing shipment → UPDATE
       - No shipment → INSERT
       - Safe database-level fallback → UPSERT

       This prevents duplicate key errors.
    ====================================================== */

    const shipmentForm =
      NL.qs(
        '#ship-form'
      );


    if (shipmentForm) {

      shipmentForm.onsubmit =
        async event => {

          event.preventDefault();


          const button =
            shipmentForm.querySelector(
              'button[type="submit"]'
            );

          const originalText =
            button?.textContent ||
            'Save shipment';


          if (button) {

            button.disabled =
              true;

            button.textContent =
              'Saving...';

          }


          try {

            const form =
              new FormData(
                event.target
              );


            const carrier =
              String(
                form.get(
                  'carrier'
                ) ||
                ''
              ).trim();


            const trackingNumber =
              String(
                form.get(
                  'tracking_number'
                ) ||
                ''
              ).trim();


            const rawTrackingUrl =
              String(
                form.get(
                  'tracking_url'
                ) ||
                ''
              ).trim();

            const trackingUrl =
              NL.safeHttpUrl(rawTrackingUrl);

            if (rawTrackingUrl && !trackingUrl) {
              throw new Error('Enter a valid HTTPS tracking URL.');
            }


            if (
              !carrier ||
              !trackingNumber
            ) {

              throw new Error(
                'Courier and tracking number are required.'
              );

            }


            const shipmentData = {

              order_id:
                id,

              carrier:
                carrier,

              tracking_number:
                trackingNumber,

              tracking_url:
                trackingUrl,

              status:
                'shipped',

              updated_at:
                new Date()
                  .toISOString()

            };


            /*
              UPSERT uses the unique order_id
              constraint.

              Existing shipment:
              → UPDATE

              Missing shipment:
              → INSERT
            */

            const result =
              await sb
                .from(
                  'shipments'
                )
                .upsert(
                  shipmentData,
                  {
                    onConflict:
                      'order_id'
                  }
                );


            if (result.error) {
              throw result.error;
            }


            NL.toast(
              'Shipment saved successfully.',
              'success'
            );


            await load();


          } catch (error) {

            console.error(
              'Shipment save error:',
              error
            );


            NL.toast(
              error.message ||
              'Unable to save shipment.',
              'error'
            );


            if (button) {

              button.disabled =
                false;

              button.textContent =
                originalText;

            }

          }

        };

    }

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await load();

});