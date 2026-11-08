document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const period = NL.qs('#dashboard-period');
  if (period) period.textContent = `1 Jan ${now.getFullYear()} – ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const [
    productsResult,
    ordersCountResult,
    customersResult,
    returnsResult,
    profitLossResult,
    balanceResult,
    recentOrdersResult,
    lowStockResult
  ] = await Promise.all([
    sb.from('products').select('id', { count: 'exact', head: true }),
    sb.from('orders').select('id', { count: 'exact', head: true }),
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    sb.from('return_requests').select('id,status'),
    sb.rpc('admin_profit_loss', { p_from: yearStart.toISOString(), p_to: now.toISOString() }),
    sb.rpc('admin_balance_snapshot'),
    sb.from('orders').select('id,order_number,created_at,total,status,profiles(name,email)').order('created_at', { ascending: false }).limit(6),
    sb.from('products').select('id', { count: 'exact', head: true }).lte('stock_quantity', 3).eq('status', 'active')
  ]);

  const failures = [
    productsResult.error,
    ordersCountResult.error,
    customersResult.error,
    returnsResult.error,
    profitLossResult.error,
    balanceResult.error,
    recentOrdersResult.error,
    lowStockResult.error
  ].filter(Boolean);

  const statusElement = NL.qs('#dashboard-status');
  if (failures.length && statusElement) {
    statusElement.textContent = 'Some dashboard figures could not be loaded. Check the Admin account permissions and refresh this page.';
    statusElement.classList.add('is-error');
    console.error('Dashboard query errors:', failures);
  }

  const setText = (selector, value) => {
    const element = NL.qs(selector);
    if (element) element.textContent = value;
  };
  const count = value => Number(value || 0).toLocaleString('en-IN');
  const money = value => NL.money(Number(value || 0));

  setText('#s-products', productsResult.error ? '—' : count(productsResult.count));
  setText('#s-orders', ordersCountResult.error ? '—' : count(ordersCountResult.count));
  setText('#s-customers', customersResult.error ? '—' : count(customersResult.count));
  setText('#s-returns', returnsResult.error ? '—' : count((returnsResult.data || []).filter(item => ['submitted', 'under_review', 'approved', 'refund_processing'].includes(item.status)).length));

  const profitLoss = profitLossResult.data || {};
  const balance = balanceResult.data || {};
  setText('#s-sales', profitLossResult.error ? '—' : money(profitLoss.revenue));
  setText('#s-profit', profitLossResult.error ? '—' : money(profitLoss.net_profit));
  setText('#cash-balance', balanceResult.error ? '—' : money(balance.cash));
  setText('#inventory-value', balanceResult.error ? '—' : money(balance.inventory));
  setText('#equity-value', balanceResult.error ? '—' : money(balance.equity));
  setText('#low-stock', lowStockResult.error ? '—' : count(lowStockResult.count));

  const recentContainer = NL.qs('#recent-orders-list');
  if (recentContainer) {
    if (recentOrdersResult.error) {
      recentContainer.innerHTML = '<p class="dashboard-empty">Recent orders are not available right now.</p>';
    } else {
      const orders = recentOrdersResult.data || [];
      if (!orders.length) {
        recentContainer.innerHTML = '<p class="dashboard-empty">No orders yet. Your new customer orders will appear here.</p>';
      } else {
        recentContainer.innerHTML = orders.map(order => {
          const customer = order.profiles?.name || order.profiles?.email || 'Customer';
          const date = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
          const status = String(order.status || 'unknown').replaceAll('_', ' ');
          const paymentPending = order.status === 'payment_pending';
          const closedOrder = ['cancelled', 'returned', 'refunded'].includes(order.status);
          const statusClass = paymentPending ? 'is-pending' : closedOrder ? 'is-closed' : 'is-paid';
          return `
            <a class="recent-order-row" href="order-details.html?id=${encodeURIComponent(order.id)}">
              <span class="recent-order-icon" aria-hidden="true">${paymentPending ? '◷' : closedOrder ? '–' : '✓'}</span>
              <span class="recent-order-main"><strong>${NL.esc(order.order_number || 'Order')}</strong><small>${NL.esc(customer)} · ${NL.esc(date)}</small></span>
              <span class="recent-order-end"><strong>${money(order.total)}</strong><small class="recent-order-status ${statusClass}">${NL.esc(status)}</small></span>
            </a>`;
        }).join('');
      }
    }
  }
});
