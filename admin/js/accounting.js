document.addEventListener('DOMContentLoaded', async () => {
  const admin = await NL.requireRole('admin');
  if (!admin) return;

  const localDateString = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = localDateString();
  const firstDay = `${new Date().getFullYear()}-01-01`;
  const fromInput = NL.qs('#finance-from');
  const toInput = NL.qs('#finance-to');
  const status = NL.qs('#finance-status');
  const setText = (selector, value) => { const el = NL.qs(selector); if (el) el.textContent = value; };
  const money = value => NL.money(Number(value || 0));
  const dateFields = ['expense-date'];

  if (fromInput) fromInput.value = firstDay;
  if (toInput) toInput.value = today;
  dateFields.forEach(id => { const el = NL.qs(`#${id}`); if (el && !el.value) el.value = today; });

  async function refresh() {
    if (status) { status.textContent = 'Updating finance report…'; status.className = 'editor-status'; }
    const from = fromInput?.value || firstDay;
    const to = toInput?.value || today;
    if (from > to) {
      if (status) { status.textContent = 'The start date must be before the end date.'; status.className = 'editor-status is-error'; }
      return;
    }

    const summary = await sb.rpc('admin_business_summary', { p_from: from, p_to: to });
    if (summary.error) {
      console.error('Finance summary error:', summary.error);
      if (status) { status.textContent = summary.error.message || 'Finance report could not be loaded.'; status.className = 'editor-status is-error'; }
      return;
    }

    const d = summary.data || {};
    setText('#finance-period-label', `${from} to ${to}`);
    setText('#f-revenue', money(d.revenue));
    setText('#f-cogs', money(d.cogs));
    setText('#f-gross', money(d.gross_profit));
    setText('#f-expenses', money(d.expenses));
    setText('#f-adjustments', money(Number(d.refunds || 0) + Number(d.gateway_fees || 0)));
    setText('#f-net', money(d.net_profit));
    setText('#f-cash', money(d.cash_balance));
    setText('#f-bank', money(d.bank_balance));
    setText('#f-upi', money(d.upi_balance));
    setText('#f-other', money(d.other_balance));
    setText('#f-razorpay', money(d.razorpay_unsettled));
    setText('#f-funds', money(d.business_funds));
    setText('#f-inventory', money(d.inventory_value));
    setText('#f-vendor-due', money(d.vendor_payable));
    setText('#f-customer-due', money(d.customer_due));

    const ledger = await sb.from('business_ledger_entries')
      .select('id,entry_type,direction,account,amount,category,description,transaction_date,reference_id')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60);
    const ledgerBody = NL.qs('#finance-ledger');
    if (ledgerBody) {
      if (ledger.error) ledgerBody.innerHTML = `<tr><td colspan="5">${NL.esc(ledger.error.message || 'Ledger unavailable.')}</td></tr>`;
      else if (!(ledger.data || []).length) ledgerBody.innerHTML = '<tr><td colspan="5">No business transactions recorded yet. Add your first expense or sale to begin the register.</td></tr>';
      else ledgerBody.innerHTML = ledger.data.map(row => {
        const isIn = row.direction === 'in';
        const type = String(row.entry_type || '').replaceAll('_', ' ');
        return `<tr><td>${NL.esc(row.transaction_date || '')}</td><td>${NL.esc(type)}</td><td>${NL.esc(row.description || row.category || '—')}</td><td>${NL.esc(row.account || '')}</td><td class="${isIn ? 'ledger-in' : 'ledger-out'}">${isIn ? '+' : '−'}${money(row.amount)}</td></tr>`;
      }).join('');
    }
    if (status) { status.textContent = 'Finance data updated.'; status.className = 'editor-status is-success'; }
  }

  async function bindForm(id, handler, successMessage) {
    const form = NL.qs(`#${id}`);
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const label = button?.textContent || 'Save';
      if (button) { button.disabled = true; button.textContent = 'Saving…'; }
      try {
        await handler(new FormData(form));
        NL.toast(successMessage, 'success');
        form.reset();
        dateFields.forEach(field => { const el = NL.qs(`#${field}`); if (el) el.value = today; });
      } catch (error) {
        console.error(`${id} failed:`, error);
        NL.toast(error.message || 'Unable to save this entry.', 'error');
      } finally {
        if (button) { button.disabled = false; button.textContent = label; }
        await refresh();
      }
    });
  }

  await bindForm('expense-form', async data => {
    const result = await sb.from('expenses').insert({
      title: String(data.get('title') || '').trim(),
      category: String(data.get('category') || 'Other'),
      amount: Number(data.get('amount')),
      expense_date: String(data.get('expense_date')),
      paid_from: String(data.get('paid_from')),
      notes: String(data.get('notes') || '').trim() || null,
      created_by: admin.id
    });
    if (result.error) throw result.error;
  }, 'Expense recorded.');

  NL.qs('#finance-refresh')?.addEventListener('click', refresh);
  await refresh();
});
