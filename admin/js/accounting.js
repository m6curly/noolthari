document.addEventListener('DOMContentLoaded', async () => {
  const admin = await NL.requireRole('admin');
  if (!admin) return;
  const localDateString = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  const today = localDateString();
  const firstDay = `${new Date().getFullYear()}-01-01`;
  const fromInput = NL.qs('#finance-from'), toInput = NL.qs('#finance-to');
  fromInput.value = firstDay; toInput.value = today;
  const setText = (selector,value) => { const el=NL.qs(selector); if(el) el.textContent=value; };
  const money = value => NL.money(Number(value||0));
  const status = NL.qs('#finance-status');
  const forms = ['capital-form','expense-form','stock-form','vendor-payment-form','settlement-form'];
  const dateFields = ['capital-date','expense-date','stock-purchase-date','vendor-payment-date','settlement-date'];
  dateFields.forEach(id => { const el=NL.qs('#'+id); if(el && !el.value) el.value=today; });

  async function refresh() {
    status.textContent='Updating finance report…'; status.className='editor-status';
    const from=fromInput.value || firstDay, to=toInput.value || today;
    if (from>to) { status.textContent='The start date must be before the end date.'; status.className='editor-status is-error'; return; }
    const summary=await sb.rpc('admin_business_summary',{p_from:from,p_to:to});
    if(summary.error) { console.error('Finance summary error:',summary.error); status.textContent=summary.error.message||'Finance report could not be loaded. Apply the latest Supabase SQL.'; status.className='editor-status is-error'; return; }
    const d=summary.data||{};
    setText('#finance-period-label',`${from} to ${to}`);
    setText('#f-revenue',money(d.revenue)); setText('#f-cogs',money(d.cogs)); setText('#f-gross',money(d.gross_profit));
    setText('#f-expenses',money(d.expenses)); setText('#f-adjustments',money(Number(d.refunds||0)+Number(d.gateway_fees||0))); setText('#f-net',money(d.net_profit));
    setText('#f-cash',money(d.cash_balance)); setText('#f-bank',money(d.bank_balance)); setText('#f-upi',money(d.upi_balance));
    setText('#f-other',money(d.other_balance)); setText('#f-razorpay',money(d.razorpay_unsettled)); setText('#f-funds',money(d.business_funds));
    setText('#f-inventory',money(d.inventory_value)); setText('#f-vendor-due',money(d.vendor_payable)); setText('#f-capital',money(d.capital_invested)); setText('#f-customer-due',money(d.customer_due));
    const [ledger,purchases] = await Promise.all([
      sb.from('business_ledger_entries').select('id,entry_type,direction,account,amount,category,description,transaction_date,reference_id').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).limit(60),
      sb.from('purchases').select('id,total,paid_amount,purchase_date,notes,vendors(name)').order('purchase_date',{ascending:false})
    ]);
    const ledgerBody=NL.qs('#finance-ledger');
    if(ledger.error) ledgerBody.innerHTML=`<tr><td colspan="5">${NL.esc(ledger.error.message||'Ledger unavailable.')}</td></tr>`;
    else if(!(ledger.data||[]).length) ledgerBody.innerHTML='<tr><td colspan="5">No business transactions recorded yet. Add your opening investment and first business entries above.</td></tr>';
    else ledgerBody.innerHTML=ledger.data.map(row=>{
      const inwards=row.direction==='in'; const type=String(row.entry_type||'').replaceAll('_',' ');
      return `<tr><td>${NL.esc(row.transaction_date||'')}</td><td>${NL.esc(type)}</td><td>${NL.esc(row.description||row.category||'—')}</td><td>${NL.esc(row.account||'')}</td><td class="${inwards?'ledger-in':'ledger-out'}">${inwards?'+':'−'}${money(row.amount)}</td></tr>`;
    }).join('');
    const purchaseSelect=NL.qs('#vendor-purchase');
    const openPurchases=(purchases.data||[]).filter(item=>Number(item.total||0)-Number(item.paid_amount||0)>0.009);
    purchaseSelect.innerHTML='<option value="">Choose outstanding purchase</option>'+openPurchases.map(item=>{
      const due=Number(item.total||0)-Number(item.paid_amount||0);
      return `<option value="${NL.esc(item.id)}" data-due="${due}">${NL.esc(item.vendors?.name||'Vendor not set')} · ${NL.esc(item.purchase_date)} · Due ${money(due)}</option>`;
    }).join('');
    if(!openPurchases.length) purchaseSelect.innerHTML='<option value="">No vendor dues</option>';
    status.textContent='Finance data updated.'; status.className='editor-status is-success';
  }

  const [products,vendors] = await Promise.all([
    sb.from('products').select('id,saree_name,sku').eq('status','active').order('saree_name'),
    sb.from('vendors').select('id,name').order('name')
  ]);
  const productSelect=NL.qs('#stock-product');
  productSelect.innerHTML='<option value="">Choose product</option>'+(products.data||[]).map(item=>`<option value="${NL.esc(item.id)}">${NL.esc(item.saree_name)} · ${NL.esc(item.sku||'')}</option>`).join('');
  const vendorSelect=NL.qs('#stock-vendor');
  vendorSelect.innerHTML='<option value="">No vendor selected</option>'+(vendors.data||[]).map(item=>`<option value="${NL.esc(item.id)}">${NL.esc(item.name)}</option>`).join('');

  const stockQty=NL.qs('#stock-quantity'), stockCost=NL.qs('#stock-unit-cost'), stockPaid=NL.qs('#stock-paid-amount');
  const updateStockPaid=()=>{ if(stockPaid && !stockPaid.dataset.userEdited) stockPaid.value=(Number(stockQty.value||0)*Number(stockCost.value||0)).toFixed(2); };
  stockQty.addEventListener('input',updateStockPaid); stockCost.addEventListener('input',updateStockPaid);
  stockPaid.addEventListener('input',()=>{stockPaid.dataset.userEdited='true';});

  async function submitForm(id, handler, successMessage) {
    const form=NL.qs('#'+id); if(!form) return;
    form.addEventListener('submit',async event=>{
      event.preventDefault(); const button=form.querySelector('button[type="submit"]'); const label=button.textContent;
      button.disabled=true; button.textContent='Saving…';
      try { await handler(new FormData(form)); NL.toast(successMessage,'success'); form.reset(); dateFields.forEach(field=>{const el=NL.qs('#'+field); if(el)el.value=today;}); }
      catch(error){ console.error(`${id} failed:`,error); NL.toast(error.message||'Unable to save this entry.','error'); }
      finally { button.disabled=false; button.textContent=label; await refresh(); }
    });
  }

  await submitForm('capital-form',async data=>{
    const r=await sb.rpc('admin_add_capital',{p_amount:Number(data.get('amount')),p_account:String(data.get('account')),p_transaction_date:String(data.get('transaction_date')),p_description:String(data.get('description')||'').trim()||null});
    if(r.error)throw r.error;
  },'Investment recorded.');

  await submitForm('expense-form',async data=>{
    const r=await sb.from('expenses').insert({title:String(data.get('title')).trim(),category:String(data.get('category')),amount:Number(data.get('amount')),expense_date:String(data.get('expense_date')),paid_from:String(data.get('paid_from')),notes:String(data.get('notes')||'').trim()||null,created_by:admin.id});
    if(r.error)throw r.error;
  },'Expense recorded.');

  await submitForm('stock-form',async data=>{
    const qty=Number(data.get('quantity')), unit=Number(data.get('unit_cost'));
    const paidRaw=String(data.get('paid_amount')||'').trim();
    const paid=paidRaw===''?qty*unit:Number(paidRaw);
    const r=await sb.rpc('admin_receive_stock',{
      p_product_id:String(data.get('product_id')),p_quantity:qty,p_unit_cost:unit,
      p_vendor_id:String(data.get('vendor_id')||'').trim()||null,p_paid_amount:paid,
      p_payment_account:String(data.get('payment_account')),p_notes:String(data.get('notes')||'').trim()||null,
      p_client_reference:crypto.randomUUID(),p_purchase_date:String(data.get('purchase_date'))
    });
    if(r.error)throw r.error;
    stockPaid.dataset.userEdited='';
  },'Stock and vendor purchase recorded.');

  NL.qs('#vendor-purchase').addEventListener('change',event=>{
    const due=event.target.selectedOptions[0]?.dataset.due;
    if(due) NL.qs('#vendor-payment-amount').max=due;
  });
  await submitForm('vendor-payment-form',async data=>{
    const r=await sb.rpc('admin_pay_vendor_balance',{
      p_purchase_id:String(data.get('purchase_id')),p_amount:Number(data.get('amount')),
      p_payment_account:String(data.get('payment_account')),p_transaction_date:String(data.get('transaction_date')),
      p_reference:String(data.get('reference')||'').trim()||null,p_idempotency_key:crypto.randomUUID()
    });
    if(r.error)throw r.error;
  },'Vendor payment recorded.');

  await submitForm('settlement-form',async data=>{
    const r=await sb.rpc('admin_record_razorpay_settlement',{
      p_gross_amount:Number(data.get('gross_amount')),p_bank_credit:Number(data.get('bank_credit')),
      p_fee:Number(data.get('fee')),p_settlement_date:String(data.get('settlement_date')),
      p_reference:String(data.get('reference')).trim()
    });
    if(r.error)throw r.error;
  },'Razorpay payout reconciled.');

  NL.qs('#finance-refresh').addEventListener('click',refresh);
  await refresh();
});
