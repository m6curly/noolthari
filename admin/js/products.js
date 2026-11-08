/* =========================================================
   NOOLTHARI™ ADMIN PRODUCTS
   Product editor, Instagram video link, responsive watermark
   and safe product listing/removal.
========================================================= */

const NOOLTHARI_WATERMARK = Object.freeze({
  text: 'NOOLTHARI™',
  maxImageEdge: 2400,
  opacity: 0.22,
  fontRatio: 0.028,
  quality: 0.92,
  maxFiles: 8,
  maxFileBytes: 15 * 1024 * 1024
});

let activeProductId = null;
let loadedProduct = null;
let existingProductImageCount = 0;
let holdUntilUploadComplete = false;
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
  const offerInput = NL.qs('[name="sale_price"]')?.value;
  const offer = offerInput === '' || offerInput == null ? null : Number(offerInput);
  const output = NL.qs('#price-insight');
  if (!output) return;

  if (!Number.isFinite(cost) || !Number.isFinite(regular) || cost < 0 || regular <= 0) {
    output.textContent = 'Enter your cost price and selling price to see the estimated margin.';
    output.classList.remove('is-positive', 'is-negative');
    return;
  }

  const actualSelling = offer != null && Number.isFinite(offer) && offer > 0 && offer < regular
    ? offer
    : regular;
  const margin = actualSelling - cost;
  const marginPercent = actualSelling > 0 ? (margin / actualSelling) * 100 : 0;
  const label = offer != null && offer > 0 && offer < regular ? 'Offer price' : 'Selling price';
  output.textContent = `${label}: ${formatRupees(actualSelling)}  ·  Estimated gross margin: ${formatRupees(margin)} (${marginPercent.toFixed(1)}%) per saree`;
  output.classList.toggle('is-positive', margin >= 0);
  output.classList.toggle('is-negative', margin < 0);
}

/* ---------------------------------------------------------
   Product listing
--------------------------------------------------------- */
async function adminProductTable() {
  const table = NL.qs('#products-table');
  if (!table) return;

  const result = await sb
    .from('products')
    .select(`
      id, saree_name, sku, selling_price, sale_price,
      stock_quantity, status, categories(name),
      product_images(public_url, sort_order)
    `)
    .order('created_at', { ascending: false });

  if (result.error) {
    console.error('Product table error:', result.error);
    NL.toast(result.error.message || 'Unable to load products.', 'error');
    table.innerHTML = '<tr><td colspan="6">Products could not be loaded. Please refresh.</td></tr>';
    return;
  }

  const products = result.data || [];
  if (!products.length) {
    table.innerHTML = '<tr><td colspan="6">No products yet. Add your first saree to start the catalogue.</td></tr>';
    return;
  }

  table.innerHTML = products.map(product => {
    const inactive = product.status === 'inactive';
    const image = (product.product_images || [])
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))[0]?.public_url;
    const actualPrice = Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.selling_price)
      ? Number(product.sale_price)
      : Number(product.selling_price || 0);

    return `
      <tr>
        <td>
          <div class="product-table-name">
            ${image ? `<img src="${NL.esc(image)}" alt="" loading="lazy">` : '<span class="product-table-placeholder" aria-hidden="true">N</span>'}
            <span><strong>${NL.esc(product.saree_name || 'Untitled product')}</strong><small>${NL.esc(product.categories?.name || 'Uncategorised')}</small></span>
          </div>
        </td>
        <td>${NL.esc(product.sku || '—')}</td>
        <td>${NL.money(actualPrice)}</td>
        <td>${Number(product.stock_quantity || 0)}</td>
        <td><span class="product-status ${inactive ? 'is-inactive' : 'is-active'}">${inactive ? 'Inactive' : 'Active'}</span></td>
        <td>
          <div class="product-row-actions">
            <a class="btn btn-outline" href="${NL.path(`admin/product-edit.html?id=${encodeURIComponent(product.id)}`)}">Edit</a>
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

function averageLuminance(ctx, width, height, centerX, centerY, sampleWidth, sampleHeight) {
  const x = Math.max(0, Math.min(width - 1, Math.round(centerX - sampleWidth / 2)));
  const y = Math.max(0, Math.min(height - 1, Math.round(centerY - sampleHeight / 2)));
  const w = Math.max(1, Math.min(sampleWidth, width - x));
  const h = Math.max(1, Math.min(sampleHeight, height - y));
  try {
    const pixels = ctx.getImageData(x, y, w, h).data;
    let total = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += (0.2126 * pixels[i]) + (0.7152 * pixels[i + 1]) + (0.0722 * pixels[i + 2]);
      count++;
    }
    return count ? total / count : 128;
  } catch {
    return 128;
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

    // One small, restrained brand mark. Colour automatically contrasts with
    // the underlying photo so it remains visible without hiding the saree.
    const minDimension = Math.min(width, height);
    const fontSize = Math.max(12, Math.min(38, Math.round(minDimension * NOOLTHARI_WATERMARK.fontRatio)));
    const text = NOOLTHARI_WATERMARK.text;
    context.save();
    context.font = `500 ${fontSize}px Georgia, 'Times New Roman', serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const markX = Math.round(width * 0.72);
    const markY = Math.round(height * 0.91);
    const textWidth = context.measureText(text).width;
    const luminance = averageLuminance(
      context, width, height, markX, markY,
      Math.max(fontSize * 5, textWidth * 0.8),
      Math.max(fontSize * 2, 20)
    );
    const useLightMark = luminance < 132;

    context.globalAlpha = NOOLTHARI_WATERMARK.opacity;
    context.fillStyle = useLightMark ? '#ffffff' : '#173f3d';
    context.shadowColor = useLightMark ? 'rgba(0,0,0,.52)' : 'rgba(255,255,255,.75)';
    context.shadowBlur = Math.max(1, fontSize * 0.08);
    context.translate(markX, markY);
    context.rotate(-4 * Math.PI / 180);
    context.fillText(text, 0, 0);
    context.restore();

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
async function loadProductCategories() {
  const select = NL.qs('#category');
  if (!select) return;

  const result = await sb.from('categories').select('id,name').order('name');
  if (result.error) throw result.error;

  const categories = result.data || [];
  select.innerHTML = '<option value="">Choose a category</option>' + categories.map(category => `
    <option value="${NL.esc(category.id)}">${NL.esc(category.name)}</option>
  `).join('');
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
  setField('fabric', product.fabric);
  setField('colour', product.colour);
  setField('pattern', product.pattern);
  setField('occasion', product.occasion);
  setField('saree_length', product.saree_length);
  setField('blouse_length', product.blouse_length);
  setField('care_instructions', product.care_instructions);
  setField('purchase_price', product.purchase_price);
  setField('selling_price', product.selling_price);
  setField('sale_price', product.sale_price);
  setField('stock_quantity', product.stock_quantity);
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

/* ---------------------------------------------------------
   Save product and initialize editor
--------------------------------------------------------- */
async function saveProduct(formElement) {
  const form = new FormData(formElement);
  const name = String(form.get('saree_name') || '').trim();
  const categoryId = String(form.get('category_id') || '').trim();
  const sku = String(form.get('sku') || '').trim().toUpperCase() || makeSku();
  const rawPurchasePrice = form.get('purchase_price');
  const rawSellingPrice = form.get('selling_price');
  const rawSalePrice = form.get('sale_price');
  const rawStockQuantity = form.get('stock_quantity');
  const purchasePrice = Number(rawPurchasePrice);
  const sellingPrice = Number(rawSellingPrice);
  const salePrice = rawSalePrice === '' || rawSalePrice == null ? null : Number(rawSalePrice);
  const stockQuantity = Number(rawStockQuantity);
  const imageInput = NL.qs('[name="images"]');
  const selectedFiles = Array.from(imageInput?.files || []);

  if (!name) throw new Error('Enter a product title.');
  if (!categoryId) throw new Error('Choose a product category.');
  if (rawPurchasePrice == null || String(rawPurchasePrice).trim() === '' || !Number.isFinite(purchasePrice) || purchasePrice < 0 || purchasePrice > 9999999999.99) {
    throw new Error('Enter the actual cost price you paid. It must be zero or more.');
  }
  if (rawSellingPrice == null || String(rawSellingPrice).trim() === '' || !Number.isFinite(sellingPrice) || sellingPrice <= 0 || sellingPrice > 9999999999.99) {
    throw new Error('Enter a regular selling price greater than zero.');
  }
  if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= sellingPrice || salePrice > 9999999999.99)) {
    throw new Error('Offer price must be greater than zero and lower than the regular price.');
  }
  if (rawStockQuantity == null || String(rawStockQuantity).trim() === '' || !Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 1000000) {
    throw new Error('Enter the available stock as a whole number (zero or more).');
  }
  if (selectedFiles.length + existingProductImageCount > NOOLTHARI_WATERMARK.maxFiles) {
    throw new Error(`A product can have up to ${NOOLTHARI_WATERMARK.maxFiles} photos in total.`);
  }
  if (!activeProductId && selectedFiles.length === 0) throw new Error('Please add at least one product photo before publishing.');
  const requestedStatus = form.get('active_toggle') === 'on' ? 'active' : 'inactive';
  if (requestedStatus === 'active' && existingProductImageCount + selectedFiles.length === 0) {
    throw new Error('Add at least one product photo before showing this saree in the store.');
  }

  const reservedQuantity = Number(loadedProduct?.reserved_quantity || 0);
  if (activeProductId && stockQuantity < reservedQuantity) {
    throw new Error(`There are ${reservedQuantity} units reserved in pending orders. Available stock cannot be set below ${reservedQuantity}.`);
  }

  const instagramUrl = normalizeInstagramUrl(form.get('instagram_url'));
  if ((!activeProductId || existingProductImageCount === 0) && selectedFiles.length > 0) holdUntilUploadComplete = true;
  const existingSlug = String(loadedProduct?.slug || '').trim();
  const baseSlug = slugify(name) || `saree-${Date.now()}`;
  const slug = activeProductId && existingSlug
    ? existingSlug
    : `${baseSlug}-${slugify(sku).toLowerCase()}`;

  const payload = {
    saree_name: name,
    sku,
    slug,
    category_id: categoryId,
    instagram_url: instagramUrl,
    description: String(form.get('description') || '').trim() || null,
    fabric: String(form.get('fabric') || '').trim() || null,
    colour: String(form.get('colour') || '').trim() || null,
    pattern: String(form.get('pattern') || '').trim() || null,
    occasion: String(form.get('occasion') || '').trim() || null,
    saree_length: String(form.get('saree_length') || '').trim() || null,
    blouse_length: String(form.get('blouse_length') || '').trim() || null,
    care_instructions: String(form.get('care_instructions') || '').trim() || null,
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    sale_price: salePrice,
    stock_quantity: stockQuantity,
    blouse_included: form.get('blouse_included') === 'on',
    featured: form.get('featured') === 'on',
    bestseller: form.get('bestseller') === 'on',
    status: holdUntilUploadComplete ? 'inactive' : requestedStatus,
    updated_at: new Date().toISOString()
  };

  let result;
  if (activeProductId) {
    result = await sb.from('products').update(payload).eq('id', activeProductId).select('id').single();
  } else {
    result = await sb.from('products').insert(payload).select('id').single();
  }
  if (result.error) throw result.error;

  activeProductId = result.data.id;
  loadedProduct = { ...(loadedProduct || {}), ...payload, id: activeProductId };
  if (!NL.query.get('id')) {
    const editUrl = new URL(location.href);
    editUrl.searchParams.set('id', activeProductId);
    history.replaceState({ productId: activeProductId }, '', editUrl.href);
  }
  const skuField = NL.qs('[name="sku"]');
  if (skuField) skuField.value = sku;
  return activeProductId;
}

async function initializeProductForm() {
  const form = NL.qs('#product-form');
  if (!form) return false;

  activeProductId = NL.query.get('id');
  try {
    await loadProductCategories();
    if (activeProductId) await loadEditProduct();
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

  ['purchase_price', 'selling_price', 'sale_price'].forEach(name => {
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
      const productId = await saveProduct(form);
      productSaved = true;
      setEditorStatus('Product details saved. Uploading photos…', '');
      await uploadProductImages(productId, imageInput);

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
