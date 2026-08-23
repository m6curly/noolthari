document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ELEMENTS
  ======================================================== */

  const orderList =
    NL.qs('#orders-list');

  if (!orderList) {
    return;
  }


  /* =======================================================
     CUSTOMER AUTH
  ======================================================== */

  const profile =
    await NL.requireRole('customer');

  if (!profile) {
    return;
  }


  /* =======================================================
     LOAD CUSTOMER ORDERS
  ======================================================== */

  const result =
    await sb
      .from('orders')
      .select('*')
      .eq(
        'customer_id',
        profile.id
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  /* =======================================================
     ERROR
  ======================================================== */

  if (result.error) {

    console.error(
      'Customer orders loading error:',
      result.error
    );


    orderList.innerHTML = `
      <p class="empty">
        ${NL.esc(
          result.error.message
        )}
      </p>
    `;

    return;
  }


  const orders =
    result.data || [];


  /* =======================================================
     EMPTY STATE
  ======================================================== */

  if (!orders.length) {

    orderList.innerHTML = `
      <p class="empty">
        No orders yet.
      </p>
    `;

    return;
  }


  /* =======================================================
     RENDER ORDERS
  ======================================================== */

  orderList.innerHTML =
    orders
      .map(order => {

        const orderDate =
          order.created_at
            ? new Date(
                order.created_at
              ).toLocaleDateString(
                'en-IN'
              )
            : '—';


        const status =
          order.status ||
          'unknown';


        return `
          <div class="order-row">


            <div>

              <strong>
                ${NL.esc(
                  order.order_number ||
                  ''
                )}
              </strong>


              <span>
                ${NL.esc(
                  orderDate
                )}
              </span>

            </div>


            <span class="status">
              ${NL.esc(
                status
              ).replaceAll(
                '_',
                ' '
              )}
            </span>


            <strong>
              ${NL.money(
                order.total || 0
              )}
            </strong>


            <a
              class="btn btn-outline"
              href="${NL.path(
                'order-details.html?id=' +
                encodeURIComponent(
                  order.id
                )
              )}"
            >
              View
            </a>


          </div>
        `;

      })
      .join('');

});