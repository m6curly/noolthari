document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ELEMENTS
  ======================================================== */

  const rootEl =
    NL.qs('#order-view');

  if (!rootEl) {
    return;
  }


  /* =======================================================
     AUTHENTICATION
  ======================================================== */

  const profile =
    await NL.requireAuth();

  if (!profile) {
    return;
  }


  /* =======================================================
     ORDER ID
  ======================================================== */

  const orderId =
    NL.query.get('id');


  if (!orderId) {

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

  let query =
    sb
      .from('orders')
      .select(`
        *,
        order_items(*),
        payments(*),
        shipments(*)
      `)
      .eq(
        'id',
        orderId
      );


  /*
     IMPORTANT:
     Customers can only access their own orders.

     Admins can access the requested order.
  */

  if (
    profile.role === 'customer'
  ) {

    query =
      query.eq(
        'customer_id',
        profile.id
      );

  }


  const result =
    await query.single();


  if (result.error) {

    console.error(
      'Order loading error:',
      result.error
    );


    rootEl.innerHTML = `
      <p class="empty">
        ${NL.esc(
          result.error.message
        )}
      </p>
    `;

    return;
  }


  const order =
    result.data;

  const shipment =
    order.shipments?.[0];

  const payment =
    order.payments?.[0];


  /* =======================================================
     ORDER STATUS
  ======================================================== */

  const stages = [
    [
      'paid',
      'Payment'
    ],
    [
      'processing',
      'Processing'
    ],
    [
      'shipped',
      'Shipped'
    ],
    [
      'out_for_delivery',
      'Out for delivery'
    ],
    [
      'delivered',
      'Delivered'
    ]
  ];


  const statusRank = {
    payment_pending: 0,
    paid: 1,
    confirmed: 1,
    processing: 2,
    shipped: 3,
    out_for_delivery: 4,
    delivered: 5
  };


  const currentRank =
    statusRank[
      order.status
    ] || 0;


  /* =======================================================
     FORMAT DATE
  ======================================================== */

  const formattedDate =
    order.created_at
      ? new Date(
          order.created_at
        ).toLocaleString(
          'en-IN'
        )
      : '—';


  /* =======================================================
     ITEMS
  ======================================================== */

  const orderItems =
    order.order_items || [];


  const itemsHtml =
    orderItems.length
      ? orderItems
          .map(
            item => `
              <div class="order-item-line">

                <span>
                  ${NL.esc(
                    item.product_name ||
                    'Saree'
                  )}

                  ×

                  ${Number(
                    item.quantity || 0
                  )}
                </span>


                <strong>
                  ${NL.money(
                    item.line_total || 0
                  )}
                </strong>

              </div>
            `
          )
          .join('')
      : `
          <p class="empty">
            No items found for this order.
          </p>
        `;


  /* =======================================================
     TRACKING
  ======================================================== */

  const trackingHtml =
    shipment?.tracking_number
      ? `
        <div class="shipping-box">

          <strong>
            Shipment
          </strong>


          <p>
            ${NL.esc(
              shipment.carrier ||
              'Courier'
            )}

            ·

            ${NL.esc(
              shipment.tracking_number
            )}
          </p>


          ${
            shipment.tracking_url
              ? `
                <a
                  class="btn btn-outline"
                  href="${escapeAttribute(
                    shipment.tracking_url
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Track package
                </a>
              `
              : ''
          }

        </div>
      `
      : '';


  /* =======================================================
     RETURN OPTION
  ======================================================== */

  const returnHtml =
    order.status === 'delivered'
      ? `
        <div class="order-return-cta">

          <strong>
            Received a damaged/defective saree?
          </strong>


          <p>
            NOOLTHARI V1 accepts damage/defect returns
            after delivery, subject to verification.
          </p>


          <a
            class="btn btn-gold"
            href="${NL.path(
              'return.html'
            )}"
          >
            Request damage return
          </a>

        </div>
      `
      : '';


  /* =======================================================
     RENDER ORDER
  ======================================================== */

  rootEl.innerHTML = `

    <div class="section-head">

      <div>

        <div class="eyebrow">
          My order
        </div>


        <h1
          class="page-title"
          style="margin-bottom:6px"
        >
          ${NL.esc(
            order.order_number ||
            ''
          )}
        </h1>


        <p>
          ${NL.esc(
            formattedDate
          )}
        </p>

      </div>


      <a
        class="btn btn-outline"
        href="${NL.path(
          'orders.html'
        )}"
      >
        Back to orders
      </a>

    </div>


    <div class="order-detail-card">


      <!-- ===============================================
           STATUS
      ================================================ -->

      <div class="order-head">

        <div>

          <h2>
            Order status
          </h2>

          <p>
            Payment:
            ${NL.esc(
              payment?.status ||
              'pending'
            )}
          </p>

        </div>


        <span class="badge">

          ${NL.esc(
            order.status ||
            'unknown'
          ).replaceAll(
            '_',
            ' '
          )}

        </span>

      </div>


      <!-- ===============================================
           TIMELINE
      ================================================ -->

      <div class="order-timeline">

        ${
          stages
            .map(
              ([status, label], index) => {

                const stageRank =
                  index + 1;


                return `
                  <div
                    class="timeline-node ${
                      currentRank >=
                      stageRank
                        ? 'done'
                        : ''
                    }"
                  >

                    <span>
                      ${stageRank}
                    </span>

                    ${label}

                  </div>
                `;

              }
            )
            .join('')
        }

      </div>


      <!-- ===============================================
           ITEMS
      ================================================ -->

      <h2>
        Items
      </h2>


      ${itemsHtml}


      <!-- ===============================================
           TOTAL
      ================================================ -->

      <div class="totals">

        <span>
          Total paid
        </span>

        <strong>
          ${NL.money(
            order.total || 0
          )}
        </strong>

      </div>


      <!-- ===============================================
           DELIVERY ADDRESS
      ================================================ -->

      <div class="shipping-box">

        <strong>
          Delivery address
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


      ${trackingHtml}


      ${returnHtml}


    </div>

  `;


  /* =======================================================
     SAFE ATTRIBUTE ESCAPING
  ======================================================== */

  function escapeAttribute(value) {

    return String(
      value ?? ''
    )
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        "'",
        '&#039;'
      );

  }

});