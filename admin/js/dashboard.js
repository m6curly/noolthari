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
  let currentBannerUrl = preview?.getAttribute('src') || '';
  let currentBannerPosition = 'center';
  const settings = await sb.from('store_settings').select('hero_image_url,hero_image_position').eq('id', true).maybeSingle();
  if (!settings.error && settings.data) {
    currentBannerUrl = settings.data.hero_image_url || currentBannerUrl;
    currentBannerPosition = settings.data.hero_image_position || 'center';
    if (preview && currentBannerUrl) preview.src = currentBannerUrl;
    if (preview) preview.style.objectPosition = currentBannerPosition;
    if (positionSelect) positionSelect.value = currentBannerPosition;
  } else if (settings.error) console.warn('Banner settings are not available:', settings.error.message);

  function restoreCurrentBannerPreview() {
    if (preview && currentBannerUrl) preview.src = currentBannerUrl;
    if (preview) preview.style.objectPosition = currentBannerPosition;
  }

  const form = NL.qs('#hero-banner-form');
  const imageInput = NL.qs('#hero-banner-image');
  const bannerStatus = NL.qs('#hero-banner-status');
  const saveButton = NL.qs('#save-hero-banner');
  let collageFile = null;
  let collagePreviewUrl = null;

  function setBannerStatus(message, kind = '') {
    if (!bannerStatus) return;
    bannerStatus.textContent = message || '';
    bannerStatus.className = `editor-status${kind ? ` is-${kind}` : ''}`;
  }

  async function decodeBannerPhoto(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close?.()
        };
      } catch (error) {
        console.info('Banner ImageBitmap fallback:', error?.message || error);
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error(`Could not open ${file.name}. Use JPG, PNG or WebP.`));
        element.src = objectUrl;
      });
      return {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  function roundedClip(context, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function drawCoverTile(context, photo, tile, radius = 18) {
    const { source, width, height } = photo;
    const scale = Math.max(tile.width / width, tile.height / height);
    const sourceWidth = tile.width / scale;
    const sourceHeight = tile.height / scale;
    const sourceX = Math.max(0, (width - sourceWidth) / 2);
    const sourceY = Math.max(0, (height - sourceHeight) / 2);

    context.save();
    roundedClip(context, tile.x, tile.y, tile.width, tile.height, radius);
    context.clip();
    context.fillStyle = '#eee8df';
    context.fillRect(tile.x, tile.y, tile.width, tile.height);
    context.drawImage(
      source,
      sourceX, sourceY, sourceWidth, sourceHeight,
      tile.x, tile.y, tile.width, tile.height
    );
    context.restore();
  }

  function createBannerTileLayout(count, width, height) {
    const outer = 26;
    const gap = 16;
    const innerWidth = width - outer * 2;
    const innerHeight = height - outer * 2;

    if (count >= 9) {
      const columns = count === 9 ? 3 : 4;
      const rows = Math.ceil(count / columns);
      const tileWidth = (innerWidth - gap * (columns - 1)) / columns;
      const tileHeight = (innerHeight - gap * (rows - 1)) / rows;
      return Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const rowItems = Math.min(columns, count - row * columns);
        const rowWidth = rowItems * tileWidth + Math.max(0, rowItems - 1) * gap;
        const rowStart = outer + Math.max(0, (innerWidth - rowWidth) / 2);
        return {
          x: rowStart + column * (tileWidth + gap),
          y: outer + row * (tileHeight + gap),
          width: tileWidth,
          height: tileHeight
        };
      });
    }

    // One generous hero tile plus a neatly balanced supporting-photo grid.
    const heroWidth = innerWidth * 0.56;
    const supportingX = outer + heroWidth + gap;
    const supportingWidth = innerWidth - heroWidth - gap;
    const remaining = count - 1;
    const columns = remaining <= 6 ? 2 : 3;
    const rows = Math.ceil(remaining / columns);
    const tileWidth = (supportingWidth - gap * (columns - 1)) / columns;
    const tileHeight = (innerHeight - gap * (rows - 1)) / rows;
    const tiles = [{
      x: outer,
      y: outer,
      width: heroWidth,
      height: innerHeight
    }];

    for (let index = 0; index < remaining; index++) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowItems = Math.min(columns, remaining - row * columns);
      const rowWidth = rowItems * tileWidth + Math.max(0, rowItems - 1) * gap;
      const rowStart = supportingX + Math.max(0, (supportingWidth - rowWidth) / 2);
      tiles.push({
        x: rowStart + column * (tileWidth + gap),
        y: outer + row * (tileHeight + gap),
        width: tileWidth,
        height: tileHeight
      });
    }
    return tiles;
  }

  async function makePremiumBannerCollage(files) {
    if (files.length < 4) {
      throw new Error('Please select at least 4 photos for the banner collage.');
    }
    if (files.length > 12) {
      throw new Error('You can select up to 12 photos for one banner collage.');
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    for (const file of files) {
      if (!allowedTypes.has(file.type)) {
        throw new Error(`${file.name} is not a supported JPG, PNG or WebP photo.`);
      }
      if (file.size > 12 * 1024 * 1024) {
        throw new Error(`${file.name} is larger than 12 MB. Choose a smaller photo.`);
      }
    }

    setBannerStatus('Preparing your premium collage…', '');
    const width = 2400;
    const height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not create the banner collage. Update the browser and try again.');

    context.fillStyle = '#f5f0e8';
    context.fillRect(0, 0, width, height);
    const tiles = createBannerTileLayout(files.length, width, height);

    // Decode, draw and release one source at a time. This keeps memory use
    // predictable on iPhones, Android phones and tablets with large photos.
    for (let index = 0; index < files.length; index++) {
      const photo = await decodeBannerPhoto(files[index]);
      try {
        drawCoverTile(context, photo, tiles[index], 18);
      } finally {
        photo.cleanup?.();
      }
    }

    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('The collage could not be exported.')), 'image/jpeg', 0.91);
      });

      const collage = new File(
        [blob],
        `noolthari-home-collage-${Date.now()}.jpg`,
        { type: 'image/jpeg', lastModified: Date.now() }
      );

      if (collage.size > 12 * 1024 * 1024) {
        throw new Error('The collage is larger than 12 MB. Please choose smaller source photos.');
      }
      return collage;
    } finally {
      // Release the high-resolution composition canvas after the JPEG blob is made.
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  imageInput?.addEventListener('change', async () => {
    const files = Array.from(imageInput.files || []);
    collageFile = null;

    if (collagePreviewUrl) {
      URL.revokeObjectURL(collagePreviewUrl);
      collagePreviewUrl = null;
    }
    restoreCurrentBannerPreview();
    if (!files.length) {
      restoreCurrentBannerPreview();
      setBannerStatus('', '');
      return;
    }
    if (files.length < 4 || files.length > 12) {
      imageInput.value = '';
      restoreCurrentBannerPreview();
      setBannerStatus('Select between 4 and 12 photos. Your current banner has not changed.', 'error');
      NL.toast('Choose at least 4 and no more than 12 photos.', 'warning');
      return;
    }

    if (saveButton) saveButton.disabled = true;
    try {
      collageFile = await makePremiumBannerCollage(files);
      collagePreviewUrl = URL.createObjectURL(collageFile);
      if (preview) {
        preview.src = collagePreviewUrl;
        preview.style.objectPosition = 'center';
      }
      setBannerStatus(`${files.length} photos arranged into a premium collage. Review the preview, then save.`, 'success');
    } catch (error) {
      collageFile = null;
      imageInput.value = '';
      restoreCurrentBannerPreview();
      setBannerStatus(error.message || 'The banner collage could not be created.', 'error');
      NL.toast(error.message || 'The banner collage could not be created.', 'error');
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!collageFile) {
      return NL.toast('Select at least 4 photos and wait for the collage preview.', 'warning');
    }

    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Uploading collage…'; }
    setBannerStatus('Uploading the new collage. The live banner will remain unchanged until the save completes…', '');
    try {
      const path = `hero/noolthari-home-collage-${Date.now()}.jpg`;
      const upload = await sb.storage.from('store-assets').upload(path, collageFile, {
        upsert: false,
        contentType: 'image/jpeg',
        cacheControl: '31536000'
      });
      if (upload.error) throw upload.error;

      const publicUrl = sb.storage.from('store-assets').getPublicUrl(path).data.publicUrl;
      const position = positionSelect?.value || 'center';
      const saved = await sb.from('store_settings').update({
        hero_image_url: publicUrl,
        hero_image_position: position,
        updated_at: new Date().toISOString()
      }).eq('id', true).select('id').single();

      if (saved.error) {
        await sb.storage.from('store-assets').remove([path]);
        throw saved.error;
      }

      currentBannerUrl = publicUrl;
      currentBannerPosition = position;
      if (preview) {
        preview.src = publicUrl;
        preview.style.objectPosition = position;
      }
      if (collagePreviewUrl) {
        URL.revokeObjectURL(collagePreviewUrl);
        collagePreviewUrl = null;
      }
      collageFile = null;
      form.reset();
      if (positionSelect) positionSelect.value = position;
      setBannerStatus('Your new NOOLTHARI home banner collage is live.', 'success');
      NL.toast('Home banner collage updated successfully.', 'success');
    } catch (error) {
      console.error('Banner collage upload failed:', error);
      setBannerStatus(error.message || 'Banner collage could not be saved. The previous banner is still live.', 'error');
      NL.toast(error.message || 'Unable to update the banner.', 'error');
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Update home banner';
      }
    }
  });
});
