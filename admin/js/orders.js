document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;

  const box = NL.qs('#orders-table');
  if (!box) return;

  const fulfilmentStages = [
    ['paid', 'Paid'],
    ['confirmed', 'Confirmed'],
    ['processing', 'Processing'],
    ['shipped', 'Shipped'],
    ['out_for_delivery', 'Out for delivery'],
    ['delivered', 'Delivered']
  ];
  const stageRank = Object.fromEntries(fulfilmentStages.map(([value], index) => [value, index]));

  async function load() {
    box.innerHTML = '<tr><td colspan="6">Loading orders…</td></tr>';
    const result = await sb
      .from('orders')
      .select(`id,order_number,created_at,total,status,profiles(name,email)`)
      .order('created_at', { ascending: false });

    if (result.error) {
      console.error('Orders loading error:', result.error);
      box.innerHTML = `<tr><td colspan="6">${NL.esc(result.error.message || 'Orders could not be loaded.')}</td></tr>`;
      NL.toast('Orders could not be loaded. Please refresh.', 'error');
      return;
    }

    const orders = result.data || [];
    if (!orders.length) {
      box.innerHTML = '<tr><td colspan="6">No orders yet. Customer orders will appear here automatically.</td></tr>';
      return;
    }

    box.innerHTML = orders.map(order => {
      const customerName = order.profiles?.name || order.profiles?.email || 'Customer';
      const createdDate = order.created_at
        ? new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
      const status = String(order.status || 'unknown');
      const currentRank = stageRank[status];
      const isFulfilmentStatus = Number.isInteger(currentRank);
      const canChangeStatus = isFulfilmentStatus && currentRank < fulfilmentStages.length - 1;
      const stageControl = canChangeStatus
        ? `<select data-id="${NL.esc(order.id)}" data-original-status="${NL.esc(status)}" class="status-sel" aria-label="Update fulfilment status">
            ${fulfilmentStages.slice(currentRank).map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}
          </select>`
        : `<span class="order-status-readonly">${NL.esc(status.replaceAll('_', ' '))}</span>`;
      const statusHint = status === 'payment_pending'
        ? '<small class="order-status-hint">Awaiting Razorpay verification</small>'
        : ['return_requested', 'returned', 'refund_processing', 'refunded'].includes(status)
          ? '<small class="order-status-hint">Managed in Returns</small>'
          : ['cancelled'].includes(status)
            ? '<small class="order-status-hint">Closed order</small>'
            : '';

      return `
        <tr>
          <td><a href="order-details.html?id=${encodeURIComponent(order.id)}">${NL.esc(order.order_number || '')}</a></td>
          <td>${NL.esc(customerName)}</td>
          <td>${NL.esc(createdDate)}</td>
          <td>${NL.money(order.total || 0)}</td>
          <td><div class="order-status-control">${stageControl}${statusHint}</div></td>
          <td><a class="btn btn-outline" href="order-details.html?id=${encodeURIComponent(order.id)}">Open</a></td>
        </tr>`;
    }).join('');

    NL.qsa('.status-sel', box).forEach(select => {
      select.addEventListener('change', async () => {
        const orderId = select.dataset.id;
        const newStatus = select.value;
        const oldStatus = select.dataset.originalStatus;
        if (!orderId || !newStatus || newStatus === oldStatus) return;
        select.disabled = true;

        try {
          const response = await sb.rpc('admin_set_order_status', {
            p_order_id: orderId,
            p_status: newStatus
          });
          if (response.error) throw response.error;
          NL.toast('Fulfilment status updated.', 'success');
          await load();
        } catch (error) {
          console.error('Order status update failed:', error);
          NL.toast(error.message || 'Unable to update fulfilment status.', 'error');
          select.value = oldStatus;
          select.disabled = false;
        }
      });
    });
  }

  await load();
});
