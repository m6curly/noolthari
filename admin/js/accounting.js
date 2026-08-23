document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ADMIN AUTH
  ======================================================== */

  const profile = await NL.requireRole('admin');

  if (!profile) {
    return;
  }


  /* =======================================================
     LOAD FINANCE DATA
  ======================================================== */

  const load = async () => {

    const yearStart =
      new Date(
        new Date().getFullYear(),
        0,
        1
      ).toISOString();

    const now =
      new Date().toISOString();


    const [
      profitLossResult,
      balanceResult,
      expensesResult
    ] = await Promise.all([

      sb.rpc(
        'admin_profit_loss',
        {
          p_from: yearStart,
          p_to: now
        }
      ),

      sb.rpc(
        'admin_balance_snapshot'
      ),

      sb
        .from('expenses')
        .select('*')
        .order(
          'expense_date',
          {
            ascending: false
          }
        )

    ]);


    /* =====================================================
       PROFIT & LOSS
    ====================================================== */

    const profitLoss =
      profitLossResult.data || {};

    const balance =
      balanceResult.data || {};


    const profitLossFields = [
      'revenue',
      'cogs',
      'expenses',
      'profit'
    ];


    profitLossFields.forEach(key => {

      const element =
        NL.qs(
          `#${key}`
        );

      if (!element) {
        return;
      }


      const value =
        key === 'profit'
          ? profitLoss.net_profit
          : profitLoss[key];


      element.textContent =
        NL.money(
          value || 0
        );

    });


    /* =====================================================
       BALANCE SNAPSHOT
    ====================================================== */

    const balanceFields = [
      'cash',
      'inventory',
      'receivables',
      'liabilities',
      'equity'
    ];


    balanceFields.forEach(key => {

      const element =
        NL.qs(
          `#bs-${key}`
        );

      if (!element) {
        return;
      }


      element.textContent =
        NL.money(
          balance[key] || 0
        );

    });


    /* =====================================================
       EXPENSE TABLE
    ====================================================== */

    const expenseTable =
      NL.qs(
        '#expense-table'
      );


    if (!expenseTable) {
      return;
    }


    const expenses =
      expensesResult.data || [];


    if (!expenses.length) {

      expenseTable.innerHTML =
        `
          <tr>
            <td colspan="4">
              No expenses.
            </td>
          </tr>
        `;

      return;
    }


    expenseTable.innerHTML =
      expenses
        .map(expense => `
          <tr>

            <td>
              ${NL.esc(
                expense.expense_date || ''
              )}
            </td>

            <td>
              ${NL.esc(
                expense.title || ''
              )}
            </td>

            <td>
              ${NL.money(
                expense.amount || 0
              )}
            </td>

            <td>
              ${NL.esc(
                expense.category || ''
              )}
            </td>

          </tr>
        `)
        .join('');

  };


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await load();


  /* =======================================================
     EXPENSE FORM
  ======================================================== */

  const form =
    NL.qs(
      '#expense-form'
    );


  if (!form) {
    return;
  }


  form.onsubmit =
    async event => {

      event.preventDefault();


      const formData =
        new FormData(
          event.target
        );


      const expense = {

        title:
          formData.get(
            'title'
          ),

        category:
          formData.get(
            'category'
          ),

        amount:
          Number(
            formData.get(
              'amount'
            ) || 0
          ),

        expense_date:
          formData.get(
            'expense_date'
          )

      };


      const result =
        await sb
          .from('expenses')
          .insert(
            expense
          );


      if (result.error) {

        NL.toast(
          result.error.message,
          'error'
        );

        return;
      }


      NL.toast(
        'Expense saved',
        'success'
      );


      form.reset();


      await load();

    };

});