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
     CUSTOMER TABLE
  ======================================================== */

  const table =
    NL.qs('#customers-table');

  if (!table) {
    return;
  }


  const result =
    await sb
      .from('profiles')
      .select(
        'id,name,email,phone,created_at'
      )
      .eq(
        'role',
        'customer'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  /* =======================================================
     ERROR HANDLING
  ======================================================== */

  if (result.error) {

    console.error(
      'Customer loading error:',
      result.error
    );

    NL.toast(
      result.error.message,
      'error'
    );

    table.innerHTML = `
      <tr>
        <td colspan="4">
          Unable to load customers.
        </td>
      </tr>
    `;

    return;
  }


  const customers =
    result.data || [];


  /* =======================================================
     EMPTY STATE
  ======================================================== */

  if (!customers.length) {

    table.innerHTML = `
      <tr>
        <td colspan="4">
          No customers found.
        </td>
      </tr>
    `;

    return;
  }


  /* =======================================================
     RENDER CUSTOMERS
  ======================================================== */

  table.innerHTML =
    customers
      .map(customer => {

        const createdDate =
          customer.created_at
            ? new Date(
                customer.created_at
              ).toLocaleDateString(
                'en-IN'
              )
            : '—';


        return `
          <tr>

            <td>
              ${NL.esc(
                customer.name || ''
              )}
            </td>

            <td>
              ${NL.esc(
                customer.email || ''
              )}
            </td>

            <td>
              ${NL.esc(
                customer.phone || ''
              )}
            </td>

            <td>
              ${NL.esc(
                createdDate
              )}
            </td>

          </tr>
        `;

      })
      .join('');

});