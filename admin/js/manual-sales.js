document.addEventListener('DOMContentLoaded', async () => {
  const form = NL.qs('#manual-sale-form');
  if (!form) return;
  const admin = await NL.requireRole('admin');
  if (!admin) return;
  const productSelect = NL.qs('#manual-product');
  const customerSelect = NL.qs('#manual-customer-account');
  const dateInput = NL.qs('#manual-sale-date');
  const status = NL.qs('#manual-sale-status');
  const submit = NL.qs('#manual-sale-submit');
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10);
  if (dateInput && !dateInput.value) dateInput.value = today;

  const [products, customers] = await Promise.all([
    sb.from('admin_products').select('id,saree_name,sku,selling_price,stock_quantity,reserved_quantity').eq('status','active').order('saree_name'),
    sb.from('profiles').select('id,name,email,phone').eq('role','customer').order('name')
  ]);
  if (products.error) { NL.toast('Products could not be loaded for manual sale.', 'error'); productSelect.innerHTML='<option value="">Products unavailable</option>'; }
  else {
    productSelect.innerHTML = '<option value="">Choose a saree</option>' + (products.data||[]).map(item => {
      const available = Math.max(0, Number(item.stock_quantity||0)-Number(item.reserved_quantity||0));
      return `<option value="${NL.esc(item.id)}" data-price="${Number(item.selling_price||0)}" ${available<1?'disabled':''}>${NL.esc(item.saree_name)} · ${NL.esc(item.sku||'')} · Stock ${available}</option>`;
    }).join('');
  }
  if (customers.error) console.warn('Customer account list unavailable:', customers.error);
  else customerSelect.innerHTML += (customers.data||[]).map(item => `<option value="${NL.esc(item.id)}" data-name="${NL.esc(item.name||'')}" data-phone="${NL.esc(item.phone||'')}" data-email="${NL.esc(item.email||'')}">${NL.esc(item.name||item.email||'Customer')} ${item.phone?'· '+NL.esc(item.phone):''}</option>`).join('');

  const params = new URLSearchParams(location.search);
  const requestedProduct = params.get('product_id');
  if (requestedProduct && productSelect.querySelector(`option[value="${CSS.escape(requestedProduct)}"]`)) {
    productSelect.value = requestedProduct;
    const option = productSelect.selectedOptions[0];
    NL.qs('#manual-unit-price').value = option?.dataset.price || '';
  }
  productSelect.addEventListener('change', () => {
    const price = productSelect.selectedOptions[0]?.dataset.price;
    if (price) NL.qs('#manual-unit-price').value = price;
  });
  customerSelect.addEventListener('change', () => {
    const option = customerSelect.selectedOptions[0];
    if (!option?.value) return;
    NL.qs('#manual-customer-name').value = option.dataset.name || '';
    NL.qs('#manual-customer-phone').value = option.dataset.phone || '';
    NL.qs('#manual-customer-email').value = option.dataset.email || '';
  });
  const channelSelect = NL.qs('#manual-channel');
  const modeSelect = NL.qs('#manual-payment-mode');
  const priceInput = NL.qs('#manual-unit-price');
  const paidInput = NL.qs('#manual-is-paid');
  channelSelect.addEventListener('change', () => {
    if (['gift','collaboration'].includes(channelSelect.value)) {
      priceInput.value = '0'; modeSelect.value = 'none'; paidInput.checked = true;
    } else if (Number(priceInput.value) === 0) {
      priceInput.value = productSelect.selectedOptions[0]?.dataset.price || '';
      modeSelect.value = 'cash';
    }
  });
  modeSelect.addEventListener('change', () => { if (['credit','none'].includes(modeSelect.value)) paidInput.checked = false; });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const productId = String(data.get('product_id')||'');
    if (!productId) return NL.toast('Choose a saree first.', 'warning');
    const quantity = Number(data.get('quantity'));
    const unitPrice = Number(data.get('unit_price'));
    if (!Number.isInteger(quantity) || quantity < 1) return NL.toast('Enter a valid quantity.', 'warning');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NL.toast('Enter a valid selling price.', 'warning');
    if (['gift','collaboration'].includes(data.get('sales_channel')) && unitPrice !== 0) return NL.toast('For a gift or collaboration, set the selling price to ₹0.', 'warning');
    submit.disabled = true; submit.textContent='Saving sale…';
    status.textContent='Creating order, recording stock movement and updating finance…'; status.className='editor-status';
    try {
      const result = await sb.rpc('admin_record_manual_sale', {
        p_product_id: productId,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_customer_name: String(data.get('customer_name')||'').trim(),
        p_customer_phone: String(data.get('customer_phone')||'').trim() || null,
        p_customer_email: String(data.get('customer_email')||'').trim() || null,
        p_customer_id: String(data.get('customer_id')||'').trim() || null,
        p_sales_channel: String(data.get('sales_channel')||'offline'),
        p_payment_mode: String(data.get('payment_mode')||'cash'),
        p_is_paid: paidInput.checked,
        p_internal_note: String(data.get('internal_note')||'').trim() || null,
        p_sale_date: String(data.get('sale_date')||today)
      });
      if (result.error) throw result.error;
      const order = result.data || {};
      status.textContent = `Saved ${order.order_number || 'order'} successfully. Stock and finance have been updated.`;
      status.className='editor-status is-success';
      NL.toast(`Manual sale saved: ${order.order_number || 'order created'}.`, 'success');
      form.reset(); dateInput.value=today; paidInput.checked=true; modeSelect.value='cash';
      const q = new URLSearchParams(location.search); q.delete('product_id'); history.replaceState({},'',`${location.pathname}${q.toString()?'?'+q.toString():''}`);
      await Promise.all([loadAvailableProducts(), refreshOrderSummary()]);
    } catch (error) {
      console.error('Manual sale save failed:', error);
      status.textContent = error.message || 'Manual sale could not be saved.';
      status.className='editor-status is-error';
      NL.toast(error.message || 'Unable to save the manual sale.', 'error');
    } finally { submit.disabled=false; submit.textContent='Save sale and update stock'; }
  });

  async function loadAvailableProducts() {
    const result = await sb.from('admin_products').select('id,saree_name,sku,selling_price,stock_quantity,reserved_quantity').eq('status','active').order('saree_name');
    if (result.error) return;
    const selected = productSelect.value;
    productSelect.innerHTML = '<option value="">Choose a saree</option>' + (result.data||[]).map(item => {
      const available = Math.max(0,Number(item.stock_quantity||0)-Number(item.reserved_quantity||0));
      return `<option value="${NL.esc(item.id)}" data-price="${Number(item.selling_price||0)}" ${available<1?'disabled':''}>${NL.esc(item.saree_name)} · ${NL.esc(item.sku||'')} · Stock ${available}</option>`;
    }).join('');
    if (selected) productSelect.value=selected;
  }
  async function refreshOrderSummary() {
    const target=NL.qs('#orders-table');
    if (!target) return;
    // The orders renderer is on the same page; trigger a lightweight reload.
    const event = new CustomEvent('noolthari:orders-refresh');
    document.dispatchEvent(event);
  }
});
