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

  const box =
    NL.qs('#orders-table');

  if (!box) {
    return;
  }


  /* =======================================================
     ORDER STATUSES
  ======================================================== */

  const statuses = [
    'payment_pending',
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
  ];


  /* =======================================================
     LOAD ORDERS
  ======================================================== */

  async function load() {

    const result =
      await sb
        .from('orders')
        .select(`
          id,
          order_number,
          created_at,
          total,
          status,
          profiles(name,email)
        `)
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (result.error) {

      console.error(
        'Orders loading error:',
        result.error
      );

      box.innerHTML = `
        <tr>
          <td colspan="6">
            ${NL.esc(
              result.error.message
            )}
          </td>
        </tr>
      `;

      NL.toast(
        result.error.message,
        'error'
      );

      return;
    }


    const orders =
      result.data || [];


    /* =====================================================
       EMPTY STATE
    ====================================================== */

    if (!orders.length) {

      box.innerHTML = `
        <tr>
          <td colspan="6">
            No orders yet.
          </td>
        </tr>
      `;

      return;
    }


    /* =====================================================
       RENDER ORDERS
    ====================================================== */

    box.innerHTML =
      orders
        .map(order => {

          const customerName =
            order.profiles?.name ||
            order.profiles?.email ||
            'Customer';


          const createdDate =
            order.created_at
              ? new Date(
                  order.created_at
                ).toLocaleDateString(
                  'en-IN'
                )
              : '—';


          const currentStatus =
            order.status || '';


          return `
            <tr>

              <td>
                <a
                  href="order-details.html?id=${encodeURIComponent(
                    order.id
                  )}"
                >
                  ${NL.esc(
                    order.order_number || ''
                  )}
                </a>
              </td>


              <td>
                ${NL.esc(
                  customerName
                )}
              </td>


              <td>
                ${NL.esc(
                  createdDate
                )}
              </td>


              <td>
                ${NL.money(
                  order.total || 0
                )}
              </td>


              <td>

                <select
                  data-id="${NL.esc(
                    order.id
                  )}"
                  class="status-sel"
                  aria-label="Order status"
                >

                  ${statuses
                    .map(
                      status => `
                        <option
                          value="${status}"
                          ${
                            status ===
                            currentStatus
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
                    .join('')}

                </select>

              </td>


              <td>

                <a
                  class="btn btn-outline"
                  href="order-details.html?id=${encodeURIComponent(
                    order.id
                  )}"
                >
                  Open
                </a>

              </td>

            </tr>
          `;

        })
        .join('');


    /* =====================================================
       STATUS CHANGE
    ====================================================== */

    NL.qsa(
      '.status-sel',
      box
    ).forEach(select => {

      select.onchange =
        async () => {

          const orderId =
            select.dataset.id;

          const newStatus =
            select.value;


          if (!orderId) {
            return;
          }


          select.disabled =
            true;


          const result =
            await sb
              .from('orders')
              .update({
                status:
                  newStatus,

                updated_at:
                  new Date()
                    .toISOString()
              })
              .eq(
                'id',
                orderId
              );


          if (result.error) {

            console.error(
              'Order status update error:',
              result.error
            );

            NL.toast(
              result.error.message,
              'error'
            );

            select.disabled =
              false;

            return;
          }


          NL.toast(
            'Order status updated.',
            'success'
          );


          select.disabled =
            false;

        };

    });

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await load();

});