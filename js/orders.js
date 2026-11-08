document.addEventListener('DOMContentLoaded', async () => {
  const orderList = NL.qs('#orders-list');
  if (!orderList) return;
  const profile = await NL.requireRole('customer');
  if (!profile) return;

  async function loadOrders() {
    orderList.innerHTML = '<p class="empty">Loading your orders…</p>';
    const result = await sb.from('orders')
      .select('id,order_number,created_at,sale_date,total,status,sales_channel,payments(status)')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false });
    if (result.error) {
      console.error('Customer orders loading error:', result.error);
      orderList.innerHTML = `<p class="empty">${NL.esc(result.error.message || 'Orders could not be loaded.')}</p>`;
      return;
    }
    const orders = result.data || [];
    if (!orders.length) {
      orderList.innerHTML = '<p class="empty">No orders yet. Your orders will appear here after checkout.</p>';
      return;
    }
    orderList.innerHTML = orders.map(order => {
      const orderDate = order.sale_date || (order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—');
      const status = String(order.status || 'unknown');
      const paymentStatuses = (order.payments || []).map(payment => payment.status);
      const safeToDelete = status === 'cancelled' && !paymentStatuses.some(value => ['captured','authorized'].includes(value));
      return `
        <article class="order-row">
          <div><strong>${NL.esc(order.order_number || '')}</strong><span>${NL.esc(orderDate)}</span></div>
          <span class="status">${NL.esc(status.replaceAll('_',' '))}</span>
          <strong>${NL.money(order.total || 0)}</strong>
          <div class="order-row-actions">
            <a class="btn btn-outline" href="${NL.path('order-details.html?id=' + encodeURIComponent(order.id))}">View</a>
            ${safeToDelete ? `<button class="btn btn-outline" type="button" data-delete-failed-order="${NL.esc(order.id)}">Remove failed order</button>` : ''}
          </div>
        </article>`;
    }).join('');
    NL.qsa('[data-delete-failed-order]', orderList).forEach(button => {
      button.addEventListener('click', async () => {
        const orderId = button.dataset.deleteFailedOrder;
        if (!orderId || !window.confirm('Remove this cancelled payment order from your account? This cannot be undone.')) return;
        button.disabled = true;
        button.textContent = 'Removing…';
        const deleted = await sb.rpc('delete_own_failed_order', { p_order_id: orderId });
        if (deleted.error) {
          console.error('Failed order removal error:', deleted.error);
          NL.toast(deleted.error.message || 'This order could not be removed.', 'error');
          button.disabled = false;
          button.textContent = 'Remove failed order';
          return;
        }
        NL.toast('Cancelled order removed.', 'success');
        await loadOrders();
      });
    });
  }
  await loadOrders();
});
