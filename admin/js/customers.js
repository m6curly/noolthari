document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;

  const table = NL.qs('#customers-table');
  if (!table) return;

  const result = await sb
    .from('admin_customer_directory')
    .select('customer_key,profile_id,customer_name,customer_email,customer_phone,has_account,first_seen,last_activity_at,order_count,paid_order_value')
    .order('last_activity_at', { ascending: false });

  if (result.error) {
    console.error('Customer directory loading error:', result.error);
    NL.toast(result.error.message || 'Customer list could not be loaded.', 'error');
    table.innerHTML = '<tr><td colspan="7">Unable to load customers. Apply the latest Supabase migration.</td></tr>';
    return;
  }

  const customers = result.data || [];
  if (!customers.length) {
    table.innerHTML = '<tr><td colspan="7">No registered or manual-sale customers yet.</td></tr>';
    return;
  }

  const date = value => value
    ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  table.innerHTML = customers.map(customer => `
    <tr>
      <td><strong>${NL.esc(customer.customer_name || 'Customer')}</strong></td>
      <td><span class="customer-type ${customer.has_account ? 'is-account' : 'is-manual'}">${customer.has_account ? 'Website account' : 'Offline / no login'}</span></td>
      <td>${NL.esc(customer.customer_email || '—')}</td>
      <td>${NL.esc(customer.customer_phone || '—')}</td>
      <td>${Number(customer.order_count || 0)}</td>
      <td>${NL.money(customer.paid_order_value || 0)}</td>
      <td>${date(customer.last_activity_at || customer.first_seen)}</td>
    </tr>
  `).join('');
});
