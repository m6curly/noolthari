/* =========================================================
   NOOLTHARI™ CUSTOMER ORDER DETAILS

   Includes:
   - Order details
   - Payment status
   - Shipment / tracking
   - Delivered status
   - Damage / defect return request
   - Customer return status
   - Automatic return-status refresh
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    /* =====================================================
       ELEMENTS
    ====================================================== */

    const rootEl =
      NL.qs(
        '#order-view'
      );


    if (!rootEl) {
      return;
    }


    /* =====================================================
       AUTHENTICATION
    ====================================================== */

    const profile =
      await NL.requireAuth();


    if (!profile) {
      return;
    }


    /* =====================================================
       ORDER ID
    ====================================================== */

    const orderId =
      NL.query.get(
        'id'
      );


    if (!orderId) {

      rootEl.innerHTML = `
        <p class="empty">
          Missing order ID.
        </p>
      `;

      return;

    }


    /* =====================================================
       HELPERS
    ====================================================== */

    function escapeAttribute(
      value
    ) {

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


    function formatReturnStatus(
      status
    ) {

      return String(
        status ||
        'submitted'
      )
        .replaceAll(
          '_',
          ' '
        )
        .replace(
          /\b\w/g,
          character =>
            character.toUpperCase()
        );

    }


    function returnStatusClass(
      status
    ) {

      switch (
        status
      ) {

        case 'approved':

          return 'badge';


        case 'refund_processing':

          return 'badge';


        case 'refunded':

          return 'badge';


        case 'rejected':

          return 'badge';


        case 'under_review':

          return 'badge';


        default:

          return 'badge';

      }

    }


    /* =====================================================
       LOAD ORDER
    ====================================================== */

    let orderQuery =
      sb
        .from('orders')
        .select(`
          *,
          order_items(*),
          payments(*)
        `)
        .eq(
          'id',
          orderId
        );


    /*
       CUSTOMER:
       Can only access own order.

       ADMIN:
       Can access requested order.
    */

    if (
      profile.role === 'customer'
    ) {

      orderQuery =
        orderQuery.eq(
          'customer_id',
          profile.id
        );

    }


    const orderResult =
      await orderQuery.single();


    if (orderResult.error) {

      console.error(
        'Order loading error:',
        orderResult.error
      );


      rootEl.innerHTML = `
        <p class="empty">
          ${NL.esc(
            orderResult.error.message
          )}
        </p>
      `;

      return;

    }


    const order =
      orderResult.data;


    /* =====================================================
       LOAD SHIPMENT SEPARATELY
    ====================================================== */

    let shipment = null;


    const shipmentResult =
      await sb
        .from('shipments')
        .select(`
          id,
          order_id,
          carrier,
          tracking_number,
          tracking_url,
          status,
          updated_at
        `)
        .eq(
          'order_id',
          order.id
        )
        .maybeSingle();


    if (
      shipmentResult.error
    ) {

      console.error(
        'Shipment loading error:',
        shipmentResult.error
      );

    } else {

      shipment =
        shipmentResult.data ||
        null;

    }


    /* =====================================================
       LOAD RETURN REQUEST
       CUSTOMER ONLY
    ====================================================== */

    let returnRequest =
      null;


    if (
      profile.role === 'customer'
    ) {

      const returnResult =
        await sb
          .from(
            'return_requests'
          )
          .select(`
            id,
            order_id,
            customer_id,
            product_id,
            order_item_id,
            reason,
            description,
            status,
            admin_note,
            created_at,
            updated_at
          `)
          .eq(
            'order_id',
            order.id
          )
          .eq(
            'customer_id',
            profile.id
          )
          .order(
            'created_at',
            {
              ascending:false
            }
          )
          .limit(1)
          .maybeSingle();


      if (
        returnResult.error
      ) {

        console.error(
          'Return request loading error:',
          returnResult.error
        );

      } else {

        returnRequest =
          returnResult.data ||
          null;

      }

    }


    /* =====================================================
       PAYMENT
    ====================================================== */

    const payment =
      order.payments?.[0] ||
      null;


    /* =====================================================
       ORDER STATUS
    ====================================================== */

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

      payment_pending:0,

      paid:1,

      confirmed:1,

      processing:2,

      shipped:3,

      out_for_delivery:4,

      delivered:5

    };


    const currentRank =
      statusRank[
        order.status
      ] || 0;


    /* =====================================================
       FORMAT DATE
    ====================================================== */

    const formattedDate =
      order.created_at
        ? new Date(
            order.created_at
          ).toLocaleString(
            'en-IN'
          )
        : '—';


    /* =====================================================
       ITEMS
    ====================================================== */

    const orderItems =
      order.order_items ||
      [];


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
                      item.quantity ||
                      0
                    )}

                  </span>


                  <strong>

                    ${NL.money(
                      item.line_total ||
                      0
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


    /* =====================================================
       TRACKING
    ====================================================== */

    const hasTracking =
      Boolean(
        shipment?.tracking_number
      );


    const hasTrackingUrl =
      Boolean(
        shipment?.tracking_url
      );


    let trackingHtml =
      '';


    if (hasTracking) {

      trackingHtml = `

        <div
          class="shipping-box"
          style="margin-top:16px"
        >

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
            shipment.status
              ? `
                  <p>
                    Status:
                    ${NL.esc(
                      shipment.status
                    ).replaceAll(
                      '_',
                      ' '
                    )}
                  </p>
                `
              : ''
          }


          ${
            hasTrackingUrl
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

      `;

    }


    /* =====================================================
       RETURN SECTION
    ====================================================== */

    function buildReturnHtml(
      currentReturnRequest
    ) {

      /*
         RETURN REQUEST ALREADY EXISTS
      */

      if (
        currentReturnRequest
      ) {

        const status =
          currentReturnRequest.status ||
          'submitted';


        const statusLabel =
          formatReturnStatus(
            status
          );


        const adminNote =
          currentReturnRequest.admin_note ||
          '';


        return `

          <div
            class="order-return-cta"
            data-return-section
          >

            <div class="eyebrow">
              Return request
            </div>


            <h3
              style="
                margin-top:10px;
                margin-bottom:10px;
              "
            >
              Damage / defect return
            </h3>


            <p>
              Your return request has been submitted
              and is currently under review.
            </p>


            <div
              style="
                display:flex;
                align-items:center;
                gap:12px;
                flex-wrap:wrap;
                margin-top:14px;
              "
            >

              <span
                class="${returnStatusClass(
                  status
                )}"
              >
                ${NL.esc(
                  statusLabel
                )}
              </span>

            </div>


            ${
              currentReturnRequest.reason
                ? `
                    <p
                      style="
                        margin-top:16px;
                        margin-bottom:6px;
                      "
                    >
                      <strong>
                        Reason:
                      </strong>

                      ${NL.esc(
                        formatReturnStatus(
                          currentReturnRequest.reason
                        )
                      )}
                    </p>
                  `
                : ''
            }


            ${
              adminNote
                ? `
                    <div
                      class="shipping-box"
                      style="
                        margin-top:16px;
                      "
                    >

                      <strong>
                        NOOLTHARI update
                      </strong>

                      <p
                        style="
                          margin-top:8px;
                          margin-bottom:0;
                        "
                      >
                        ${NL.esc(
                          adminNote
                        )}
                      </p>

                    </div>
                  `
                : ''
            }


          </div>

        `;

      }


      /*
         NO RETURN REQUEST YET
      */

      if (
        order.status ===
        'delivered'
      ) {

        return `

          <div
            class="order-return-cta"
            data-return-section
          >

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

        `;

      }


      return '';

    }


    let returnHtml =
      buildReturnHtml(
        returnRequest
      );


    /* =====================================================
       RENDER ORDER
    ====================================================== */

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
             ORDER STATUS
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
              order.total ||
              0
            )}

          </strong>

        </div>


        <!-- ===============================================
             DELIVERY ADDRESS
        ================================================ -->

        <div
          class="shipping-box"
          style="margin-top:16px"
        >

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


        <!-- ===============================================
             SHIPMENT / TRACKING
        ================================================ -->

        ${trackingHtml}


        <!-- ===============================================
             RETURN
        ================================================ -->

        <div
          id="return-status-container"
        >

          ${returnHtml}

        </div>


      </div>

    `;


    /* =====================================================
       AUTO REFRESH RETURN STATUS

       Checks every 10 seconds.

       This means:
       Admin changes return status
            ↓
       customer page checks database
            ↓
       customer sees new status
    ====================================================== */

    if (
      profile.role === 'customer'
    ) {

      let lastReturnStatus =
        returnRequest?.status ||
        '';


      let lastReturnUpdatedAt =
        returnRequest?.updated_at ||
        '';


      const refreshReturnStatus =
        async () => {

          try {

            const result =
              await sb
                .from(
                  'return_requests'
                )
                .select(`
                  id,
                  order_id,
                  customer_id,
                  product_id,
                  order_item_id,
                  reason,
                  description,
                  status,
                  admin_note,
                  created_at,
                  updated_at
                `)
                .eq(
                  'order_id',
                  order.id
                )
                .eq(
                  'customer_id',
                  profile.id
                )
                .order(
                  'created_at',
                  {
                    ascending:false
                  }
                )
                .limit(1)
                .maybeSingle();


            if (result.error) {

              console.error(
                'Return status refresh error:',
                result.error
              );

              return;

            }


            const freshReturn =
              result.data ||
              null;


            const freshStatus =
              freshReturn?.status ||
              '';


            const freshUpdatedAt =
              freshReturn?.updated_at ||
              '';


            const changed =
              freshStatus !==
                lastReturnStatus ||
              freshUpdatedAt !==
                lastReturnUpdatedAt;


            if (!changed) {
              return;
            }


            lastReturnStatus =
              freshStatus;


            lastReturnUpdatedAt =
              freshUpdatedAt;


            const container =
              NL.qs(
                '#return-status-container'
              );


            if (!container) {
              return;
            }


            container.innerHTML =
              buildReturnHtml(
                freshReturn
              );

          } catch (error) {

            console.error(
              'NOOLTHARI return refresh error:',
              error
            );

          }

        };


      window.setInterval(
        refreshReturnStatus,
        10000
      );

    }

  }
);