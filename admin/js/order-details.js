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


        <!-- =============================================
             ORDER DETAILS
        ============================================== -->

        <section class="admin-card">


          <div class="order-head">

            <div>

              <h2>
                ${NL.esc(
                  order.profiles?.name ||
                  'Customer'
                )}
              </h2>


              <p>

                ${NL.esc(
                  order.profiles?.email ||
                  ''
                )}

                ·

                ${NL.esc(
                  order.profiles?.phone ||
                  ''
                )}

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


            <form
              id="status-form"
            >

              <div class="field">

                <label>
                  Order status
                </label>


                <select
                  name="status"
                >

                  ${
                    [
                      'paid',
                      'confirmed',
                      'processing',
                      'shipped',
                      'out_for_delivery',
                      'delivered',
                      'cancelled',
                      'return_requested',
                      'returned',
                      'refund_processing',
                      'refunded'
                    ]
                      .map(
                        status => `
                          <option
                            value="${status}"
                            ${
                              status ===
                              order.status
                                ? 'selected'
                                : ''
                            }
                          >
                            ${status.replaceAll(
                              '_',
                              ' '
                            )}
                          </option>
                        `
                      )
                      .join('')
                  }

                </select>

              </div>


              <button
                class="btn btn-gold"
                type="submit"
              >
                Save status
              </button>

            </form>

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
                ${NL.esc(
                  payment?.status ||
                  '—'
                )}
              </strong>
            </p>


            <p>
              Gateway:
              ${NL.esc(
                payment?.gateway ||
                '—'
              )}
            </p>


            <p>
              Payment ID:
              ${NL.esc(
                payment?.razorpay_payment_id ||
                '—'
              )}
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


            const result =
              await sb
                .from('orders')
                .update({
                  status,

                  updated_at:
                    new Date()
                      .toISOString()
                })
                .eq(
                  'id',
                  id
                );


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


            const trackingUrl =
              String(
                form.get(
                  'tracking_url'
                ) ||
                ''
              ).trim();


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