document.addEventListener('DOMContentLoaded', async () => {
  const profile = await NL.requireRole('admin');
  if (!profile) return;

  const [productsResult, ordersResult, customersResult, returnsResult, recentOrdersResult, lowStockResult] = await Promise.all([
    sb.from('products').select('id', { count: 'exact', head: true }),
    sb.from('orders').select('id', { count: 'exact', head: true }),
    sb.from('admin_customer_directory').select('customer_key', { count: 'exact', head: true }),
    sb.from('return_requests').select('id,status'),
    sb.from('orders').select('id,order_number,customer_name,customer_email,created_at,total,status,profiles(name,email)').order('created_at', { ascending: false }).limit(6),
    sb.from('products').select('id', { count: 'exact', head: true }).lte('stock_quantity', 3).eq('status', 'active')
  ]);

  const failures = [productsResult.error, ordersResult.error, customersResult.error, returnsResult.error, recentOrdersResult.error, lowStockResult.error].filter(Boolean);
  const statusElement = NL.qs('#dashboard-status');
  if (failures.length && statusElement) {
    statusElement.textContent = 'Some dashboard information could not be loaded. Check the admin account permissions and refresh.';
    statusElement.classList.add('is-error');
    console.error('Dashboard query errors:', failures);
  }
  const setText = (selector, value) => { const el = NL.qs(selector); if (el) el.textContent = value; };
  const count = value => Number(value || 0).toLocaleString('en-IN');
  setText('#s-products', productsResult.error ? '—' : count(productsResult.count));
  setText('#s-orders', ordersResult.error ? '—' : count(ordersResult.count));
  setText('#s-customers', customersResult.error ? '—' : count(customersResult.count));
  setText('#s-returns', returnsResult.error ? '—' : count((returnsResult.data || []).filter(item => ['submitted','under_review','approved','refund_processing'].includes(item.status)).length));
  setText('#low-stock', lowStockResult.error ? '—' : count(lowStockResult.count));

  const recentContainer = NL.qs('#recent-orders-list');
  if (recentContainer) {
    const orders = recentOrdersResult.data || [];
    if (recentOrdersResult.error) recentContainer.innerHTML = '<p class="dashboard-empty">Recent orders are not available right now.</p>';
    else if (!orders.length) recentContainer.innerHTML = '<p class="dashboard-empty">No orders yet. Your online and manual sales will appear here.</p>';
    else recentContainer.innerHTML = orders.map(order => {
      const customer = order.customer_name || order.profiles?.name || order.customer_email || order.profiles?.email || 'Customer';
      const date = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
      const status = String(order.status || 'unknown').replaceAll('_', ' ');
      const pending = order.status === 'payment_pending';
      const closed = ['cancelled','returned','refunded'].includes(order.status);
      return `<a class="recent-order-row" href="order-details.html?id=${encodeURIComponent(order.id)}"><span class="recent-order-icon" aria-hidden="true">${pending ? '◷' : closed ? '–' : '✓'}</span><span class="recent-order-main"><strong>${NL.esc(order.order_number || 'Order')}</strong><small>${NL.esc(customer)} · ${NL.esc(date)}</small></span><span class="recent-order-end"><strong>${NL.money(order.total)}</strong><small class="recent-order-status ${pending ? 'is-pending' : closed ? 'is-closed' : 'is-paid'}">${NL.esc(status)}</small></span></a>`;
    }).join('');
  }

  // Load current banner settings.
  const preview = NL.qs('#hero-banner-preview');
  const positionSelect = NL.qs('#hero-banner-position');
  const settings = await sb.from('store_settings').select('hero_image_url,hero_image_position').eq('id', true).maybeSingle();
  if (!settings.error && settings.data) {
    if (preview && settings.data.hero_image_url) preview.src = settings.data.hero_image_url;
    if (preview) preview.style.objectPosition = settings.data.hero_image_position || 'center';
    if (positionSelect) positionSelect.value = settings.data.hero_image_position || 'center';
  } else if (settings.error) console.warn('Banner settings are not available:', settings.error.message);

  const form = NL.qs('#hero-banner-form');
  const imageInput = NL.qs('#hero-banner-image');
  const bannerStatus = NL.qs('#hero-banner-status');
  imageInput?.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { imageInput.value = ''; NL.toast('Choose a JPG, PNG or WebP image.', 'warning'); return; }
    if (file.size > 12 * 1024 * 1024) { imageInput.value = ''; NL.toast('The banner photo must be 12 MB or smaller.', 'warning'); return; }
    const url = URL.createObjectURL(file);
    if (preview) preview.src = url;
  });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const file = imageInput?.files?.[0];
    if (!file) return NL.toast('Choose a banner photo first.', 'warning');
    const button = NL.qs('#save-hero-banner');
    if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
    if (bannerStatus) { bannerStatus.textContent = 'Uploading the new home page photo…'; bannerStatus.className = 'editor-status'; }
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `hero/banner-${Date.now()}.${extension}`;
      const upload = await sb.storage.from('store-assets').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upload.error) throw upload.error;
      const publicUrl = sb.storage.from('store-assets').getPublicUrl(path).data.publicUrl;
      const position = positionSelect?.value || 'center';
      const saved = await sb.from('store_settings').update({ hero_image_url: publicUrl, hero_image_position: position, updated_at: new Date().toISOString() }).eq('id', true);
      if (saved.error) throw saved.error;
      if (preview) { preview.src = publicUrl; preview.style.objectPosition = position; }
      if (bannerStatus) { bannerStatus.textContent = 'Home page banner updated successfully.'; bannerStatus.classList.add('is-success'); }
      NL.toast('Home page banner updated.', 'success');
      form.reset();
      if (positionSelect) positionSelect.value = position;
    } catch (error) {
      console.error('Banner upload failed:', error);
      if (bannerStatus) { bannerStatus.textContent = error.message || 'Banner could not be updated.'; bannerStatus.classList.add('is-error'); }
      NL.toast(error.message || 'Unable to update the banner.', 'error');
    } finally { if (button) { button.disabled = false; button.textContent = 'Update home banner'; } }
  });
});
