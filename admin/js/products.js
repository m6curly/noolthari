/* =========================================================
   NOOLTHARI™ ADMIN PRODUCTS
   Product editor, Instagram video link, responsive watermark
   and safe product listing/removal.
========================================================= */

const NOOLTHARI_WATERMARK = Object.freeze({
  text: 'NOOLTHARI™',
  maxImageEdge: 3000,
  opacity: 0.24,
  fontRatio: 0.026,
  quality: 0.95,
  maxFiles: 8,
  maxFileBytes: 15 * 1024 * 1024
});

let activeProductId = null;
let loadedProduct = null;
let existingProductImageCount = 0;
let holdUntilUploadComplete = false;
let productWasCreatedInThisSession = false;
const watermarkedImageCache = new Map();
const uploadedImageKeys = new Set();
const previewObjectUrls = [];

function productFileKey(file) {
  return [file.name, file.size, file.lastModified].join('|');
}

function setEditorStatus(message, kind = '') {
  const status = NL.qs('#product-form-status');
  if (status) {
    status.textContent = message || '';
    status.className = `editor-status${kind ? ` is-${kind}` : ''}`;
  }
}

function setImageStatus(message, kind = '') {
  const status = NL.qs('#image-processing-status');
  if (status) {
    status.textContent = message || '';
    status.className = `editor-status${kind ? ` is-${kind}` : ''}`;
  }
}

function localDateString(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatRupees(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function makeSku() {
  const randomPart = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(3)), value => value.toString(16).padStart(2, '0')).join('').toUpperCase()
    : Math.random().toString(36).slice(2, 8).toUpperCase();
  return `NT-${Date.now().toString(36).slice(-5).toUpperCase()}-${randomPart}`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeInstagramUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter a complete Instagram link beginning with https://.');
  }

  const allowedHosts = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error('Please use a valid Instagram Reel or video link.');
  }
  if (url.pathname === '/' || url.pathname.length < 2) {
    throw new Error('Paste the direct Instagram Reel or video link, not only the Instagram homepage.');
  }
  return url.href;
}

function updatePriceInsight() {
  const cost = Number(NL.qs('[name="purchase_price"]')?.value || 0);
  const regular = Number(NL.qs('[name="selling_price"]')?.value || 0);

  const output = NL.qs('#price-insight');
  if (!output) return;

  if (!Number.isFinite(cost) || !Number.isFinite(regular) || cost < 0 || regular <= 0) {
    output.textContent = 'Enter your cost price and selling price to see the estimated margin.';
    output.classList.remove('is-positive', 'is-negative');
    return;
  }

  const actualSelling = regular;
  const margin = actualSelling - cost;
  const marginPercent = actualSelling > 0 ? (margin / actualSelling) * 100 : 0;
  output.textContent = `Selling price: ${formatRupees(actualSelling)}  ·  Estimated gross margin before other business costs: ${formatRupees(margin)} (${marginPercent.toFixed(1)}%) per saree`;
  output.classList.toggle('is-positive', margin >= 0);
  output.classList.toggle('is-negative', margin < 0);
}

/* ---------------------------------------------------------
   Product listing
--------------------------------------------------------- */
async function adminProductTable() {
  const table = NL.qs('#products-table');
  if (!table) return;

  // Purchase cost/vendor/reserved stock are intentionally protected from the
  // public products table. Admin-only details are read through admin_products.
  const productsResult = await sb
    .from('admin_products')
    .select('id,saree_name,sku,category_id,vendor_id,selling_price,stock_quantity,status,created_at')
    .order('created_at', { ascending: false });

  if (productsResult.error) {
    console.error('Admin product view error:', productsResult.error);
    NL.toast(productsResult.error.message || 'Unable to load products.', 'error');
    table.innerHTML = '<tr><td colspan="7">Products could not be loaded. Check the Admin Products permission and refresh.</td></tr>';
    return;
  }

  const products = productsResult.data || [];
  if (!products.length) {
    table.innerHTML = '<tr><td colspan="7">No products yet. Add your first saree to start the catalogue.</td></tr>';
    return;
  }

  const productIds = products.map(product => product.id);
  const categoryIds = [...new Set(products.map(product => product.category_id).filter(Boolean))];
  const vendorIds = [...new Set(products.map(product => product.vendor_id).filter(Boolean))];
  const [categoriesResult, vendorsResult, imagesResult] = await Promise.all([
    categoryIds.length
      ? sb.from('categories').select('id,name').in('id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
    vendorIds.length
      ? sb.from('vendors').select('id,name').in('id', vendorIds)
      : Promise.resolve({ data: [], error: null }),
    sb.from('product_images').select('product_id,public_url,sort_order').in('product_id', productIds).order('sort_order', { ascending: true })
  ]);

  const relatedError = categoriesResult.error || vendorsResult.error || imagesResult.error;
  if (relatedError) {
    console.error('Product related data error:', relatedError);
    NL.toast(relatedError.message || 'Product details could not be loaded.', 'error');
    table.innerHTML = '<tr><td colspan="7">Product category, vendor or photo information could not be loaded.</td></tr>';
    return;
  }

  const categoryNames = new Map((categoriesResult.data || []).map(item => [item.id, item.name]));
  const vendorNames = new Map((vendorsResult.data || []).map(item => [item.id, item.name]));
  const firstImages = new Map();
  (imagesResult.data || []).forEach(item => {
    if (!firstImages.has(item.product_id)) firstImages.set(item.product_id, item.public_url);
  });

  table.innerHTML = products.map(product => {
    const inactive = product.status === 'inactive';
    const image = firstImages.get(product.id);
    const actualPrice = Number(product.selling_price || 0);
    return `
      <tr>
        <td>
          <div class="product-table-name">
            ${image ? `<img src="${NL.esc(image)}" alt="" loading="lazy">` : '<span class="product-table-placeholder" aria-hidden="true">N</span>'}
            <span><strong>${NL.esc(product.saree_name || 'Untitled product')}</strong><small>${NL.esc(categoryNames.get(product.category_id) || 'Uncategorised')}</small></span>
          </div>
        </td>
        <td>${NL.esc(product.sku || '—')}</td>
        <td>${NL.money(actualPrice)}</td>
        <td>${NL.esc(vendorNames.get(product.vendor_id) || '—')}</td>
        <td>${Number(product.stock_quantity || 0).toLocaleString('en-IN')}</td>
        <td><span class="product-status ${inactive ? 'is-inactive' : 'is-active'}">${inactive ? 'Inactive' : 'Active'}</span></td>
        <td>
          <div class="product-row-actions">
            <a class="btn btn-outline" href="${NL.path(`admin/product-edit.html?id=${encodeURIComponent(product.id)}`)}">Edit</a>
            <a class="btn btn-outline" href="${NL.path(`admin/orders.html?product_id=${encodeURIComponent(product.id)}`)}">Record sale</a>
            <button class="btn product-remove-btn" type="button"
              data-remove-product="${NL.esc(product.id)}"
              data-product-name="${NL.esc(product.saree_name || '')}"
              ${inactive ? 'disabled' : ''}>${inactive ? 'Inactive' : 'Hide'}</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  bindProductRemoveButtons();
}

function bindProductRemoveButtons() {
  NL.qsa('[data-remove-product]').forEach(button => {
    button.onclick = async () => {
      const productId = button.dataset.removeProduct;
      const productName = button.dataset.productName || 'this product';
      if (!productId) return;

      const confirmed = window.confirm(
        `Hide “${productName}” from the online store?\n\nThe product, stock history and existing orders will be preserved. You can edit and activate it again later.`
      );
      if (!confirmed) return;

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Saving…';

      try {
        const result = await sb
          .from('products')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('id', productId);
        if (result.error) throw result.error;
        NL.toast('Product hidden from the store. Its data has been preserved.', 'success');
        await adminProductTable();
      } catch (error) {
        console.error('Product status update failed:', error);
        NL.toast(error.message || 'Unable to update product.', 'error');
        button.disabled = false;
        button.textContent = originalText;
      }
    };
  });
}

/* ---------------------------------------------------------
   Device-correct photo decoding and watermark rendering
--------------------------------------------------------- */
async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close?.() };
    } catch (error) {
      console.info('ImageBitmap decode fallback:', error?.message || error);
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This photo format could not be opened. Please use JPG, PNG or WebP.'));
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

async function createWatermarkedImage(file) {
  if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) {
    throw new Error('Please select a supported image file.');
  }
  if (file.size > NOOLTHARI_WATERMARK.maxFileBytes) {
    throw new Error(`“${file.name}” is larger than 15 MB. Please choose a smaller photo.`);
  }

  const decoded = await decodeImageFile(file);
  try {
    const sourceWidth = Number(decoded.width);
    const sourceHeight = Number(decoded.height);
    if (!sourceWidth || !sourceHeight) throw new Error('The selected photo has invalid dimensions.');

    const scale = Math.min(1, NOOLTHARI_WATERMARK.maxImageEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw new Error('Photo processing is not supported by this browser. Please try an updated browser.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    // Repeated centered watermark tiles make simple cropping less useful while
    // keeping the saree weave and colours visible. Marks use one soft neutral grey.
    const minDimension = Math.min(width, height);
    const columns = Math.max(3, Math.min(6, Math.round(2.5 + (width / height))));
    const rows = Math.max(4, Math.min(7, Math.round(2.5 + (height / width))));
    let fontSize = Math.max(13, Math.min(34, Math.round(minDimension * NOOLTHARI_WATERMARK.fontRatio)));
    if (document.fonts?.load) {
      try { await document.fonts.load(`600 ${fontSize}px Poppins`); } catch { /* fallback below */ }
    }
    context.font = `600 ${fontSize}px Poppins, Arial, sans-serif`;
    const cellWidth = width / columns;
    const maxWatermarkWidth = cellWidth * 0.78;
    const measuredWidth = context.measureText(NOOLTHARI_WATERMARK.text).width;
    if (measuredWidth > maxWatermarkWidth) {
      fontSize = Math.max(11, Math.floor(fontSize * (maxWatermarkWidth / measuredWidth)));
      context.font = `600 ${fontSize}px Poppins, Arial, sans-serif`;
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#778184';
    context.globalAlpha = NOOLTHARI_WATERMARK.opacity;
    context.shadowColor = 'rgba(35, 46, 49, 0.16)';
    context.shadowBlur = Math.max(1, fontSize * 0.06);
    const cellHeight = height / rows;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const stagger = row % 2 ? 0.12 : -0.12;
        const x = Math.max(0, Math.min(width, (column + 0.5 + stagger) * cellWidth));
        const y = (row + 0.5) * cellHeight;
        context.save();
        context.translate(x, y);
        context.rotate(-17 * Math.PI / 180);
        context.fillText(NOOLTHARI_WATERMARK.text, 0, 0, maxWatermarkWidth);
        context.restore();
      }
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('The watermarked photo could not be created. Please try another photo.'));
      }, 'image/jpeg', NOOLTHARI_WATERMARK.quality);
    });

    const baseName = String(file.name || 'noolthari-product').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
    return new File([blob], `${baseName}-noolthari.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } finally {
    decoded.cleanup?.();
  }
}

function clearPreviewUrls() {
  previewObjectUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
}

async function prepareProductImagePreviews(input) {
  const preview = NL.qs('#product-image-preview');
  if (!preview || !input) return;

  clearPreviewUrls();
  preview.innerHTML = '';
  const files = Array.from(input.files || []);
  if (!files.length) {
    setImageStatus('', '');
    return;
  }

  if (files.length + existingProductImageCount > NOOLTHARI_WATERMARK.maxFiles) {
    input.value = '';
    setImageStatus(`A product can have up to ${NOOLTHARI_WATERMARK.maxFiles} photos in total. This product already has ${existingProductImageCount}.`, 'error');
    return;
  }

  setImageStatus('Preparing photo previews and adding the light watermark…', '');
  const fragment = document.createDocumentFragment();
  try {
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error(`“${file.name}” is not JPG, PNG or WebP. Please convert it and try again.`);
      }
      const key = productFileKey(file);
      let watermarkedFile = watermarkedImageCache.get(key);
      if (!watermarkedFile) {
        watermarkedFile = await createWatermarkedImage(file);
        watermarkedImageCache.set(key, watermarkedFile);
      }

      const objectUrl = URL.createObjectURL(watermarkedFile);
      previewObjectUrls.push(objectUrl);
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      const image = document.createElement('img');
      image.src = objectUrl;
      image.alt = `Watermarked preview of ${file.name}`;
      const caption = document.createElement('span');
      caption.textContent = file.name;
      item.append(image, caption);
      fragment.appendChild(item);
    }
    preview.appendChild(fragment);
    setImageStatus(`${files.length} photo${files.length === 1 ? '' : 's'} ready. Check the light NOOLTHARI™ watermark in the preview.`, 'success');
  } catch (error) {
    preview.innerHTML = '';
    setImageStatus(error.message || 'Unable to prepare the selected photos.', 'error');
    NL.toast(error.message || 'Unable to prepare photos.', 'error');
  }
}

async function uploadWatermarkedProductImage(productId, file, sortOrder, isPrimary) {
  const key = productFileKey(file);
  let watermarkedFile = watermarkedImageCache.get(key);
  if (!watermarkedFile) {
    watermarkedFile = await createWatermarkedImage(file);
    watermarkedImageCache.set(key, watermarkedFile);
  }

  const uniqueId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const safeBaseName = watermarkedFile.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9._-]/gi, '_');
  const path = `${productId}/${uniqueId}-${safeBaseName}.jpg`;

  const upload = await sb.storage.from('product-images').upload(path, watermarkedFile, {
    cacheControl: '31536000',
    upsert: false,
    contentType: 'image/jpeg'
  });
  if (upload.error) throw upload.error;

  const publicUrl = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  const imageRecord = await sb.from('product_images').insert({
    product_id: productId,
    path,
    public_url: publicUrl,
    sort_order: sortOrder,
    is_primary: isPrimary
  }).select('id').single();

  if (imageRecord.error) {
    await sb.storage.from('product-images').remove([path]);
    throw imageRecord.error;
  }
  return imageRecord.data;
}

async function uploadProductImages(productId, input) {
  const files = Array.from(input?.files || []);
  if (!files.length) return;

  const existingResult = await sb
    .from('product_images')
    .select('id,sort_order,is_primary')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false });
  if (existingResult.error) throw existingResult.error;

  const existingImages = existingResult.data || [];
  const lastImage = existingImages[0];
  let nextSortOrder = lastImage ? Number(lastImage.sort_order || 0) + 1 : 0;
  let hasPrimary = existingImages.some(image => Boolean(image.is_primary));

  const failures = [];
  for (const file of files) {
    const key = productFileKey(file);
    if (uploadedImageKeys.has(key)) continue;

    try {
      await uploadWatermarkedProductImage(productId, file, nextSortOrder, !hasPrimary);
      uploadedImageKeys.add(key);
      existingProductImageCount++;
      nextSortOrder++;
      hasPrimary = true;
      setImageStatus(`Uploaded ${uploadedImageKeys.size} selected photo${uploadedImageKeys.size === 1 ? '' : 's'}…`, 'success');
    } catch (error) {
      console.error(`Photo upload failed for ${file.name}:`, error);
      failures.push(`${file.name}: ${error.message || 'upload failed'}`);
    }
  }

  if (failures.length) {
    throw new Error(`Product details are saved, but ${failures.length} photo(s) could not be uploaded. Check your connection and press Save again. ${failures.join(' · ')}`);
  }
}

/* ---------------------------------------------------------
   Categories and product edit loading
--------------------------------------------------------- */
async function loadProductCategories(selectedId = '') {
  const select = NL.qs('#category');
  if (!select) return;
  const result = await sb.from('categories').select('id,name').eq('active', true).order('name');
  if (result.error) throw result.error;
  const categories = result.data || [];
  select.innerHTML = '<option value="">Choose a category</option>' + categories.map(category => `
    <option value="${NL.esc(category.id)}">${NL.esc(category.name)}</option>
  `).join('');
  if (selectedId) select.value = selectedId;
}

async function loadProductVendors(selectedId = '') {
  const select = NL.qs('#vendor');
  if (!select) return;
  const result = await sb.from('vendors').select('id,name').order('name');
  if (result.error) throw result.error;
  const vendors = result.data || [];
  select.innerHTML = '<option value="">Select vendor (optional)</option>' + vendors.map(vendor => `
    <option value="${NL.esc(vendor.id)}">${NL.esc(vendor.name)}</option>
  `).join('');
  if (selectedId) select.value = selectedId;
}

function bindInlineCreateForms() {
  const bindToggle = (buttonId, panelId, inputId) => {
    const button = NL.qs(`#${buttonId}`);
    const panel = NL.qs(`#${panelId}`);
    const input = NL.qs(`#${inputId}`);
    button?.addEventListener('click', () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) input?.focus();
    });
  };
  bindToggle('add-category-toggle', 'new-category-panel', 'new-category-name');
  bindToggle('add-vendor-toggle', 'new-vendor-panel', 'new-vendor-name');

  NL.qs('#save-new-category')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const input = NL.qs('#new-category-name');
    const name = String(input?.value || '').trim();
    if (!name) return NL.toast('Enter a category name.', 'warning');
    button.disabled = true;
    try {
      const slug = slugify(name);
      const result = await sb.from('categories').insert({ name, slug, active: true }).select('id').single();
      if (result.error) throw result.error;
      await loadProductCategories(result.data.id);
      if (input) input.value = '';
      NL.qs('#new-category-panel').hidden = true;
      NL.toast('Category added and selected.', 'success');
    } catch (error) {
      NL.toast(error.message || 'Unable to add this category.', 'error');
    } finally { button.disabled = false; }
  });

  NL.qs('#save-new-vendor')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const nameInput = NL.qs('#new-vendor-name');
    const phoneInput = NL.qs('#new-vendor-phone');
    const name = String(nameInput?.value || '').trim();
    if (!name) return NL.toast('Enter a vendor name.', 'warning');
    button.disabled = true;
    try {
      const result = await sb.from('vendors').insert({ name, phone: String(phoneInput?.value || '').trim() || null }).select('id').single();
      if (result.error) throw result.error;
      await loadProductVendors(result.data.id);
      if (nameInput) nameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      NL.qs('#new-vendor-panel').hidden = true;
      NL.toast('Vendor added and selected.', 'success');
    } catch (error) {
      NL.toast(error.message || 'Unable to add this vendor.', 'error');
    } finally { button.disabled = false; }
  });
}

function setField(name, value) {
  const element = document.querySelector(`[name="${name}"]`);
  if (element) element.value = value ?? '';
}

function setCheckbox(name, value) {
  const element = document.querySelector(`[name="${name}"]`);
  if (element) element.checked = Boolean(value);
}

async function renderExistingProductImages(productId) {
  const container = NL.qs('#existing-product-images');
  if (!container) return;

  const result = await sb
    .from('product_images')
    .select('id,public_url,sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (result.error) throw result.error;

  const images = result.data || [];
  existingProductImageCount = images.length;
  container.innerHTML = images.map((item, index) => `
    <div class="image-preview-item saved-image">
      <img src="${NL.esc(item.public_url || '')}" alt="Saved product photo ${index + 1}" loading="lazy">
      <span>Saved photo ${index + 1}</span>
    </div>
  `).join('');
}

async function loadEditProduct() {
  if (!activeProductId) return;

  const result = await sb
    .from('admin_products')
    .select('*')
    .eq('id', activeProductId)
    .single();
  if (result.error) throw result.error;

  loadedProduct = result.data;
  const product = loadedProduct;
  setField('saree_name', product.saree_name);
  setField('sku', product.sku);
  setField('category_id', product.category_id);
  setField('instagram_url', product.instagram_url);
  setField('description', product.description);
  setField('colour', product.colour);
  await loadProductVendors(product.vendor_id);
  setField('purchase_price', product.purchase_price);
  setField('selling_price', product.selling_price);
  setField('stock_quantity', product.stock_quantity);
  setField('purchase_account', 'bank');
  const initialPaymentField = NL.qs('#initial-stock-payment-field');
  const initialAccountField = NL.qs('#initial-stock-account-field');
  if (initialPaymentField) initialPaymentField.hidden = true;
  if (initialAccountField) initialAccountField.hidden = true;
  const stockInput = NL.qs('#stock-quantity');
  const costInput = NL.qs('#purchase-price');
  const vendorInput = NL.qs('#vendor');
  if (stockInput) stockInput.readOnly = true;
  if (costInput) costInput.readOnly = true;
  if (vendorInput) vendorInput.disabled = true;
  const stockHelp = NL.qs('#stock-field-help');
  if (stockHelp) stockHelp.textContent = 'Current stock is protected from accidental edits. Use the Receive additional stock panel below to record a new vendor purchase.';
  setCheckbox('blouse_included', product.blouse_included);
  setCheckbox('featured', product.featured);
  setCheckbox('bestseller', product.bestseller);
  setCheckbox('active_toggle', product.status === 'active');

  const title = NL.qs('#editor-title');
  if (title) title.textContent = 'Edit product';
  document.title = 'Edit product | NOOLTHARI™';
  const saveButton = NL.qs('[data-save-product]');
  if (saveButton) saveButton.textContent = 'Save changes';

  await renderExistingProductImages(activeProductId);
  updatePriceInsight();
}


async function initializeAdditionalStockPanel() {
  const panel = NL.qs('#additional-stock-panel');
  if (!panel || !activeProductId) return;
  panel.hidden = false;

  const vendorSelect = NL.qs('#additional-stock-vendor');
  const vendorResult = await sb.from('vendors').select('id,name').order('name');
  if (vendorResult.error) throw vendorResult.error;
  vendorSelect.innerHTML = '<option value="">Use current product vendor</option>' + (vendorResult.data || []).map(vendor =>
    `<option value="${NL.esc(vendor.id)}">${NL.esc(vendor.name)}</option>`
  ).join('');
  if (loadedProduct?.vendor_id) vendorSelect.value = loadedProduct.vendor_id;

  const dateInput = NL.qs('#additional-stock-date');
  if (dateInput && !dateInput.value) dateInput.value = localDateString();
  const qty = NL.qs('#additional-stock-quantity');
  const cost = NL.qs('#additional-stock-cost');
  const paid = NL.qs('#additional-stock-paid');
  const refreshPaid = () => {
    if (paid?.dataset.userEdited === 'true') return;
    paid.value = (Number(qty?.value || 0) * Number(cost?.value || 0)).toFixed(2);
  };
  qty?.addEventListener('input', refreshPaid);
  cost?.addEventListener('input', refreshPaid);
  paid?.addEventListener('input', () => { paid.dataset.userEdited = 'true'; });
  refreshPaid();

  const button = NL.qs('#save-additional-stock');
  const status = NL.qs('#additional-stock-status');
  button?.addEventListener('click', async () => {
    const quantity = Number(qty?.value);
    const unitCost = Number(cost?.value);
    const amountRaw = String(paid?.value ?? '').trim();
    const paidAmount = amountRaw === '' ? quantity * unitCost : Number(amountRaw);
    if (!Number.isInteger(quantity) || quantity < 1) return NL.toast('Enter a valid received quantity.', 'warning');
    if (!Number.isFinite(unitCost) || unitCost < 0) return NL.toast('Enter a valid purchase cost per saree.', 'warning');
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > quantity * unitCost) return NL.toast('Amount paid cannot be more than the total purchase cost.', 'warning');

    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = 'Saving stock…';
    if (status) { status.textContent = 'Recording purchase, vendor and stock movement…'; status.className = 'editor-status'; }
    try {
      const response = await sb.rpc('admin_receive_stock', {
        p_product_id: activeProductId,
        p_quantity: quantity,
        p_unit_cost: unitCost,
        p_vendor_id: String(vendorSelect?.value || loadedProduct?.vendor_id || '').trim() || null,
        p_paid_amount: paidAmount,
        p_payment_account: String(NL.qs('#additional-stock-account')?.value || 'bank'),
        p_notes: String(NL.qs('#additional-stock-notes')?.value || '').trim() || null,
        p_client_reference: `product-edit:${activeProductId}:${(typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)}`,
        p_purchase_date: String(dateInput?.value || localDateString())
      });
      if (response.error) throw response.error;
      const stock = Number(response.data?.stock_quantity);
      const stockField = NL.qs('#stock-quantity');
      if (stockField && Number.isFinite(stock)) stockField.value = String(stock);
      if (status) { status.textContent = 'Stock purchase saved. Inventory, vendor and finance records are updated.'; status.className = 'editor-status is-success'; }
      NL.toast('Additional stock recorded successfully.', 'success');
      qty.value = '';
      cost.value = '';
      paid.value = '';
      paid.dataset.userEdited = '';
      NL.qs('#additional-stock-notes').value = '';
    } catch (error) {
      console.error('Additional stock receipt failed:', error);
      if (status) { status.textContent = error.message || 'Could not record the stock purchase.'; status.className = 'editor-status is-error'; }
      NL.toast(error.message || 'Could not record the stock purchase.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  });
}

/* ---------------------------------------------------------
   Save product and initialize editor
--------------------------------------------------------- */
async function saveProduct(formElement) {
  const form = new FormData(formElement);
  const name = String(form.get('saree_name') || '').trim();
  const categoryId = String(form.get('category_id') || '').trim();
  const sku = String(form.get('sku') || '').trim().toUpperCase() || makeSku();
  const purchasePrice = Number(form.get('purchase_price'));
  const sellingPrice = Number(form.get('selling_price'));
  const stockQuantity = Number(form.get('stock_quantity'));
  const vendorId = String(form.get('vendor_id') || '').trim() || null;
  const purchaseAccount = String(form.get('purchase_account') || 'bank');
  const initialPaidRaw = String(form.get('initial_stock_paid') || '').trim();
  const initialStockPaid = initialPaidRaw === '' ? stockQuantity * purchasePrice : Number(initialPaidRaw);
  const selectedFiles = Array.from(NL.qs('[name="images"]')?.files || []);

  if (!name) throw new Error('Enter a product title.');
  if (!categoryId) throw new Error('Choose a category.');
  if (!activeProductId && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) throw new Error('Enter the unit purchase cost.');
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error('Enter a selling price greater than zero.');
  if (!activeProductId && (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 1000000)) throw new Error('Enter the initial stock quantity.');
  if (!activeProductId && (!Number.isFinite(initialStockPaid) || initialStockPaid < 0 || initialStockPaid > stockQuantity * purchasePrice)) throw new Error('Enter a valid amount paid to the vendor (it cannot exceed the total stock cost).');
  if (selectedFiles.length + existingProductImageCount > NOOLTHARI_WATERMARK.maxFiles) throw new Error(`A product can have up to ${NOOLTHARI_WATERMARK.maxFiles} photos in total.`);
  if (!activeProductId && selectedFiles.length === 0) throw new Error('Please add at least one product photo before publishing.');
  const requestedStatus = form.get('active_toggle') === 'on' ? 'active' : 'inactive';
  if (requestedStatus === 'active' && existingProductImageCount + selectedFiles.length === 0) throw new Error('Add at least one product photo before showing this saree in the store.');

  const instagramUrl = normalizeInstagramUrl(form.get('instagram_url'));
  if ((!activeProductId || existingProductImageCount === 0) && selectedFiles.length > 0) holdUntilUploadComplete = true;
  const baseSlug = slugify(name) || `saree-${Date.now()}`;
  const slug = activeProductId && loadedProduct?.slug ? loadedProduct.slug : `${baseSlug}-${slugify(sku).toLowerCase()}`;

  const payload = {
    saree_name: name,
    sku,
    slug,
    category_id: categoryId,
    instagram_url: instagramUrl,
    vendor_id: activeProductId ? (loadedProduct?.vendor_id || null) : vendorId,
    description: String(form.get('description') || '').trim() || null,
    selling_price: sellingPrice,
    colour: String(form.get('colour') || '').trim() || null,
    blouse_included: form.get('blouse_included') === 'on',
    featured: form.get('featured') === 'on',
    bestseller: form.get('bestseller') === 'on',
    status: holdUntilUploadComplete ? 'inactive' : requestedStatus,
    updated_at: new Date().toISOString()
  };

  let result;
  const wasNew = !activeProductId;
  if (activeProductId) {
    result = await sb.from('products').update(payload).eq('id', activeProductId).select('id').single();
  } else {
    result = await sb.from('products').insert({
      ...payload,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      stock_quantity: 0
    }).select('id').single();
  }
  if (result.error) throw result.error;

  activeProductId = result.data.id;
  if (wasNew) productWasCreatedInThisSession = true;
  loadedProduct = { ...(loadedProduct || {}), ...payload, id: activeProductId };
  if (!NL.query.get('id')) {
    const editUrl = new URL(location.href);
    editUrl.searchParams.set('id', activeProductId);
    history.replaceState({ productId: activeProductId }, '', editUrl.href);
  }
  const skuField = NL.qs('[name="sku"]');
  if (skuField) skuField.value = sku;
  return { productId: activeProductId, sareeName: name, initialStock: productWasCreatedInThisSession && !formElement.dataset.initialStockDone ? stockQuantity : 0, purchasePrice, initialStockPaid, vendorId, purchaseAccount, isNew: productWasCreatedInThisSession };
}

async function initializeProductForm() {
  const form = NL.qs('#product-form');
  if (!form) return false;

  activeProductId = NL.query.get('id');
  try {
    await Promise.all([loadProductCategories(), loadProductVendors()]);
    bindInlineCreateForms();
    if (activeProductId) await loadEditProduct();
    if (activeProductId) await initializeAdditionalStockPanel();
  } catch (error) {
    console.error('Product editor initialization failed:', error);
    setEditorStatus(error.message || 'The editor could not load. Please refresh.', 'error');
    NL.toast(error.message || 'Unable to load the product editor.', 'error');
    const saveButton = NL.qs('[data-save-product]');
    if (saveButton) saveButton.disabled = true;
    return true;
  }

  const imageInput = NL.qs('[name="images"]');
  imageInput?.addEventListener('change', () => prepareProductImagePreviews(imageInput));

  const initialPaidInput = NL.qs('#initial-stock-paid');
  const initialQtyInput = NL.qs('#stock-quantity');
  const initialCostInput = NL.qs('#purchase-price');
  if (initialPaidInput) {
    const updateInitialPaid = () => {
      if (initialPaidInput.dataset.userEdited === 'true') return;
      const total = Number(initialQtyInput?.value || 0) * Number(initialCostInput?.value || 0);
      initialPaidInput.value = total > 0 ? total.toFixed(2) : '';
    };
    initialQtyInput?.addEventListener('input', updateInitialPaid);
    initialCostInput?.addEventListener('input', updateInitialPaid);
    initialPaidInput.addEventListener('input', () => { initialPaidInput.dataset.userEdited = 'true'; });
    updateInitialPaid();
  }

  ['purchase_price', 'selling_price'].forEach(name => {
    NL.qs(`[name="${name}"]`)?.addEventListener('input', updatePriceInsight);
  });
  updatePriceInsight();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = NL.qs('[data-save-product]');
    const originalText = submitButton?.textContent || 'Save product';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving…';
    }
    setEditorStatus('Saving product details…', '');

    let productSaved = false;
    try {
      const saved = await saveProduct(form);
      const productId = saved.productId;
      productSaved = true;
      setEditorStatus('Product details saved. Uploading photos…', '');
      await uploadProductImages(productId, imageInput);
      if (saved.initialStock > 0 && saved.isNew) {
        setEditorStatus('Recording the vendor purchase and stock…', '');
        const stockResult = await sb.rpc('admin_receive_stock', {
          p_product_id: productId,
          p_quantity: saved.initialStock,
          p_unit_cost: saved.purchasePrice,
          p_vendor_id: saved.vendorId,
          p_paid_amount: saved.initialStockPaid,
          p_payment_account: saved.purchaseAccount,
          p_notes: `Initial stock for ${saved.sareeName || 'new product'} (recorded while adding product).`,
          p_client_reference: productId,
          p_purchase_date: localDateString()
        });
        if (stockResult.error) throw new Error(`Product and photos are saved, but initial stock/purchase could not be recorded: ${stockResult.error.message}`);
        form.dataset.savedProduct = 'true';
        form.dataset.initialStockDone = 'true';
        const stockInput = NL.qs('#stock-quantity');
        if (stockInput) { stockInput.value = String(saved.initialStock); stockInput.readOnly = true; }
        const costInput = NL.qs('#purchase-price');
        if (costInput) costInput.readOnly = true;
        const vendorInput = NL.qs('#vendor');
        if (vendorInput) vendorInput.disabled = true;
      }

      const requestedStatus = form.querySelector('[name="active_toggle"]')?.checked ? 'active' : 'inactive';
      if (requestedStatus === 'active' && existingProductImageCount === 0) {
        throw new Error('The product has no saved photo yet. Upload at least one photo before publishing.');
      }
      const visibilityResult = await sb.from('products').update({
        status: requestedStatus,
        updated_at: new Date().toISOString()
      }).eq('id', productId);
      if (visibilityResult.error) throw new Error(`Photos are saved, but product visibility could not be updated: ${visibilityResult.error.message}`);
      holdUntilUploadComplete = false;

      NL.toast('Product saved successfully.', 'success');
      setEditorStatus('Saved successfully. Returning to your product list…', 'success');
      location.href = NL.path('admin/products.html');
    } catch (error) {
      console.error('Product save/upload failed:', error);
      const message = productSaved
        ? (error.message || 'Product details are saved, but photo upload is incomplete. Press Save again to retry the remaining photos.')
        : (error.message || 'Unable to save this product.');
      setEditorStatus(message, 'error');
      NL.toast(productSaved ? 'Product details are saved. Review the message and try saving again.' : message, 'error');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });

  window.addEventListener('beforeunload', clearPreviewUrls, { once: true });
  return true;
}

/* ---------------------------------------------------------
   Main
--------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const admin = await NL.requireRole('admin');
  if (!admin) return;

  const isProductForm = await initializeProductForm();
  if (isProductForm) return;

  if (NL.qs('#products-table')) await adminProductTable();
});
