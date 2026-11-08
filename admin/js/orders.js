document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;
  const box = NL.qs('#orders-table');
  if (!box) return;

  const fulfilmentStages = [
    ['paid', 'Paid'], ['confirmed', 'Confirmed'], ['processing', 'Processing'],
    ['shipped', 'Shipped'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']
  ];
  const stageRank = Object.fromEntries(fulfilmentStages.map(([value], index) => [value, index]));

  async function load() {
    box.innerHTML = '<tr><td colspan="6">Loading orders…</td></tr>';
    const result = await sb.from('orders')
      .select('id,order_number,created_at,sale_date,total,status,sales_channel,customer_name,customer_email,customer_phone,profiles(name,email)')
      .order('created_at', { ascending: false });
    if (result.error) {
      console.error('Orders loading error:', result.error);
      box.innerHTML = `<tr><td colspan="6">${NL.esc(result.error.message || 'Orders could not be loaded.')}</td></tr>`;
      NL.toast('Orders could not be loaded. Please refresh.', 'error');
      return;
    }
    const orders = result.data || [];
    if (!orders.length) {
      box.innerHTML = '<tr><td colspan="6">No online or manual sales yet.</td></tr>';
      return;
    }
    box.innerHTML = orders.map(order => {
      const customerName = order.customer_name || order.profiles?.name || order.customer_email || order.profiles?.email || 'Walk-in customer';
      const date = order.sale_date || (order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—');
      const status = String(order.status || 'unknown');
      const rank = stageRank[status];
      const canChange = Number.isInteger(rank) && rank < fulfilmentStages.length - 1;
      const stageControl = canChange
        ? `<select data-id="${NL.esc(order.id)}" data-original-status="${NL.esc(status)}" class="status-sel" aria-label="Update fulfilment status">${fulfilmentStages.slice(rank).map(([value,label]) => `<option value="${value}" ${value===status?'selected':''}>${label}</option>`).join('')}</select>`
        : `<span class="order-status-readonly">${NL.esc(status.replaceAll('_',' '))}</span>`;
      const removeButton = status === 'cancelled'
        ? `<button class="btn btn-outline" type="button" data-remove-failed="${NL.esc(order.id)}">Remove</button>` : '';
      const markPaid = status === 'payment_pending' && order.sales_channel !== 'online'
        ? `<div class="manual-payment-action"><select aria-label="Payment received through" data-manual-mode="${NL.esc(order.id)}"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="other">Other</option></select><button class="btn btn-outline" type="button" data-mark-manual-paid="${NL.esc(order.id)}">Mark paid</button></div>` : '';
      const channel = String(order.sales_channel || 'online').replaceAll('_',' ');
      return `<tr>
        <td><a href="order-details.html?id=${encodeURIComponent(order.id)}">${NL.esc(order.order_number || '')}</a><small class="order-channel">${NL.esc(channel)}</small></td>
        <td>${NL.esc(customerName)}${order.customer_phone ? `<small>${NL.esc(order.customer_phone)}</small>` : ''}</td>
        <td>${NL.esc(date)}</td><td>${NL.money(order.total || 0)}</td>
        <td><div class="order-status-control">${stageControl}</div></td>
        <td><div class="order-row-actions"><a class="btn btn-outline" href="order-details.html?id=${encodeURIComponent(order.id)}">Open</a>${markPaid}${removeButton}</div></td>
      </tr>`;
    }).join('');

    NL.qsa('.status-sel', box).forEach(select => {
      select.addEventListener('change', async () => {
        const orderId = select.dataset.id, newStatus = select.value, oldStatus = select.dataset.originalStatus;
        if (!orderId || !newStatus || newStatus === oldStatus) return;
        select.disabled = true;
        const response = await sb.rpc('admin_set_order_status', { p_order_id: orderId, p_status: newStatus });
        if (response.error) {
          NL.toast(response.error.message || 'Unable to update fulfilment status.', 'error');
          select.value = oldStatus; select.disabled = false; return;
        }
        NL.toast('Fulfilment status updated.', 'success');
        await load();
      });
    });
    NL.qsa('[data-mark-manual-paid]', box).forEach(button => {
      button.addEventListener('click', async () => {
        const orderId=button.dataset.markManualPaid;
        const mode=box.querySelector(`[data-manual-mode="${CSS.escape(orderId)}"]`)?.value || 'cash';
        if(!window.confirm('Confirm that you have actually received this payment?')) return;
        button.disabled=true;
        const response=await sb.rpc('admin_mark_manual_order_paid',{p_order_id:orderId,p_payment_mode:mode,p_payment_date:new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10)});
        if(response.error){NL.toast(response.error.message||'Could not mark payment received.','error');button.disabled=false;return;}
        NL.toast('Manual payment recorded. Finance balance has been updated.','success');await load();
      });
    });
    NL.qsa('[data-remove-failed]', box).forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Permanently remove this cancelled order? Captured or authorised payments are protected and cannot be deleted.')) return;
        button.disabled = true;
        const response = await sb.rpc('admin_delete_failed_order', { p_order_id: button.dataset.removeFailed });
        if (response.error) {
          NL.toast(response.error.message || 'Order could not be removed.', 'error'); button.disabled = false; return;
        }
        NL.toast('Cancelled order removed.', 'success');
        await load();
      });
    });
  }
  await load();
  document.addEventListener('noolthari:orders-refresh', load);
});
