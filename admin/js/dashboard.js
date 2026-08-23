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
     DATE RANGE
     Current calendar year
  ======================================================== */

  const now =
    new Date();

  const from =
    new Date(
      now.getFullYear(),
      0,
      1
    );


  /* =======================================================
     LOAD DASHBOARD DATA
  ======================================================== */

  const [
    productsResult,
    ordersResult,
    customersResult,
    returnsResult,
    profitLossResult,
    balanceResult
  ] = await Promise.all([

    sb
      .from('products')
      .select(
        'id',
        {
          count: 'exact',
          head: true
        }
      ),

    sb
      .from('orders')
      .select(
        'id,status,total'
      ),

    sb
      .from('profiles')
      .select(
        'id',
        {
          count: 'exact',
          head: true
        }
      )
      .eq(
        'role',
        'customer'
      ),

    sb
      .from('return_requests')
      .select(
        'id,status'
      ),

    sb.rpc(
      'admin_profit_loss',
      {
        p_from:
          from.toISOString(),

        p_to:
          now.toISOString()
      }
    ),

    sb.rpc(
      'admin_balance_snapshot'
    )

  ]);


  /* =======================================================
     CHECK FOR MAJOR QUERY ERRORS
  ======================================================== */

  const queryError =
    productsResult.error ||
    ordersResult.error ||
    customersResult.error ||
    returnsResult.error ||
    profitLossResult.error ||
    balanceResult.error;


  if (queryError) {

    console.error(
      'Admin dashboard loading error:',
      queryError
    );

    NL.toast(
      queryError.message ||
      'Unable to load dashboard data.',
      'error'
    );

  }


  /* =======================================================
     NORMALIZED DATA
  ======================================================== */

  const orders =
    ordersResult.data || [];

  const returns =
    returnsResult.data || [];

  const profitLoss =
    profitLossResult.data || {};

  const balance =
    balanceResult.data || {};


  /* =======================================================
     BASIC STATISTICS
  ======================================================== */

  const productsElement =
    NL.qs('#s-products');

  if (productsElement) {
    productsElement.textContent =
      productsResult.count || 0;
  }


  const ordersElement =
    NL.qs('#s-orders');

  if (ordersElement) {
    ordersElement.textContent =
      orders.length;
  }


  const customersElement =
    NL.qs('#s-customers');

  if (customersElement) {
    customersElement.textContent =
      customersResult.count || 0;
  }


  /* =======================================================
     PENDING RETURNS
     submitted + under_review
  ======================================================== */

  const returnsElement =
    NL.qs('#s-returns');

  if (returnsElement) {

    const pendingReturns =
      returns.filter(
        item =>
          [
            'submitted',
            'under_review'
          ].includes(
            item.status
          )
      ).length;

    returnsElement.textContent =
      pendingReturns;
  }


  /* =======================================================
     SALES / PROFIT
  ======================================================== */

  const salesElement =
    NL.qs('#s-sales');

  if (salesElement) {

    salesElement.textContent =
      NL.money(
        profitLoss.revenue || 0
      );

  }


  const profitElement =
    NL.qs('#s-profit');

  if (profitElement) {

    profitElement.textContent =
      NL.money(
        profitLoss.net_profit || 0
      );

  }


  /* =======================================================
     BALANCE SNAPSHOT
  ======================================================== */

  const cashElement =
    NL.qs('#cash-balance');

  if (cashElement) {

    cashElement.textContent =
      NL.money(
        balance.cash || 0
      );

  }


  const inventoryElement =
    NL.qs('#inventory-value');

  if (inventoryElement) {

    inventoryElement.textContent =
      NL.money(
        balance.inventory || 0
      );

  }


  const equityElement =
    NL.qs('#equity-value');

  if (equityElement) {

    equityElement.textContent =
      NL.money(
        balance.equity || 0
      );

  }


  /* =======================================================
     LOW STOCK
     Active products with stock <= 3
  ======================================================== */

  const lowStockElement =
    NL.qs('#low-stock');


  if (lowStockElement) {

    const lowStockResult =
      await sb
        .from('products')
        .select(
          'id',
          {
            count: 'exact',
            head: true
          }
        )
        .lte(
          'stock_quantity',
          3
        )
        .eq(
          'status',
          'active'
        );


    if (lowStockResult.error) {

      console.error(
        'Low stock query error:',
        lowStockResult.error
      );

      lowStockElement.textContent =
        '—';

    } else {

      lowStockElement.textContent =
        String(
          lowStockResult.count || 0
        );

    }

  }

});