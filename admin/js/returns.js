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

  const table =
    NL.qs('#returns-table');

  if (!table) {
    return;
  }


  /* =======================================================
     RETURN STATUSES
  ======================================================== */

  const statuses = [
    'submitted',
    'approved',
    'rejected',
    'refund_processing',
    'refunded'
  ];


  /* =======================================================
     LOAD RETURNS
  ======================================================== */

  async function load() {

    const result =
      await sb
        .from('return_requests')
        .select(`
          id,
          created_at,
          reason,
          status,
          description,
          order_number:orders(order_number),
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
        'Returns loading error:',
        result.error
      );


      table.innerHTML = `
        <tr>
          <td colspan="5">
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


    const returns =
      result.data || [];


    /* =====================================================
       EMPTY STATE
    ====================================================== */

    if (!returns.length) {

      table.innerHTML = `
        <tr>
          <td colspan="5">
            No return requests yet.
          </td>
        </tr>
      `;

      return;
    }


    /* =====================================================
       RENDER RETURNS
    ====================================================== */

    table.innerHTML =
      returns
        .map(returnRequest => {

          const orderNumber =
            returnRequest
              .order_number
              ?.order_number ||
            '';


          const customer =
            returnRequest
              .profiles
              ?.name ||
            returnRequest
              .profiles
              ?.email ||
            '';


          const currentStatus =
            returnRequest.status ||
            'submitted';


          return `
            <tr>

              <td>
                ${NL.esc(
                  orderNumber
                )}
              </td>


              <td>
                ${NL.esc(
                  customer
                )}
              </td>


              <td>
                ${NL.esc(
                  returnRequest.reason ||
                  ''
                )}
              </td>


              <td>

                <select
                  class="return-status"
                  data-id="${NL.esc(
                    returnRequest.id
                  )}"
                  aria-label="Return status"
                >

                  ${
                    statuses
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
                      .join('')
                  }

                </select>

              </td>


              <td>
                ${NL.esc(
                  returnRequest.description ||
                  ''
                )}
              </td>

            </tr>
          `;

        })
        .join('');


    /* =====================================================
       STATUS UPDATE
    ====================================================== */

    NL.qsa(
      '.return-status',
      table
    ).forEach(select => {

      select.onchange =
        async () => {

          const returnId =
            select.dataset.id;

          const status =
            select.value;


          if (!returnId) {
            return;
          }


          select.disabled =
            true;


          const result =
            await sb
              .from('return_requests')
              .update({
                status
              })
              .eq(
                'id',
                returnId
              );


          if (result.error) {

            console.error(
              'Return status update error:',
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
            'Return status updated.',
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