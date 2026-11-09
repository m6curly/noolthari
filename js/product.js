/* =========================================================
   NOOLTHARI™ PRODUCT DETAILS
========================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ELEMENTS
  ======================================================== */

  const productView =
    NL.qs('#product-view');

  if (!productView) {
    return;
  }


  /* =======================================================
     PRODUCT ID
  ======================================================== */

  const productId =
    NL.query.get('id');


  if (!productId) {

    productView.innerHTML = `
      <p class="empty">
        Product not found.
      </p>
    `;

    return;
  }


  /* =======================================================
     LOAD PRODUCT
  ======================================================== */

  const result =
    await sb
      .from('products')
      // Never request purchase_price or reserved_quantity in the customer app.
      .select(`
        id,sku,saree_name,slug,category_id,description,colour,
        blouse_included,selling_price,
        stock_quantity,status,featured,bestseller,instagram_url,created_at,updated_at,
        categories(name),
        product_images(id,path,sort_order,public_url)
      `)
      .eq(
        'id',
        productId
      )
      .single();


  if (result.error) {

    console.error(
      'Product loading error:',
      result.error
    );


    productView.innerHTML = `
      <p class="empty">
        Product not found.
      </p>
    `;

    return;
  }


  const product =
    result.data;

  /* =======================================================
     PRODUCT SEO — metadata is derived from the live product.
     Purchase cost and internal inventory fields are never exposed.
  ======================================================== */
  const seoDescription = String(product.description || `Explore ${product.saree_name || 'this saree'} at NOOLTHARI™.`)
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  document.title = `${product.saree_name || 'Saree'} | NOOLTHARI™`;
  const setMeta = (selector, attribute, value, createTag, attrs) => {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement(createTag);
      Object.entries(attrs).forEach(([key, val]) => node.setAttribute(key, val));
      document.head.appendChild(node);
    }
    node.setAttribute(attribute, value);
  };
  setMeta('meta[name="description"]', 'content', seoDescription, 'meta', { name: 'description' });
  setMeta('meta[property="og:title"]', 'content', document.title, 'meta', { property: 'og:title' });
  setMeta('meta[property="og:description"]', 'content', seoDescription, 'meta', { property: 'og:description' });
  setMeta('meta[property="og:type"]', 'content', 'product', 'meta', { property: 'og:type' });
  const canonicalUrl = new URL('product.html', 'https://www.noolthari.com/');
  canonicalUrl.searchParams.set('id', String(product.id));
  setMeta('link[rel="canonical"]', 'href', canonicalUrl.href, 'link', { rel: 'canonical' });
  setMeta('meta[property="og:url"]', 'content', canonicalUrl.href, 'meta', { property: 'og:url' });


  /* =======================================================
     IMAGE LIST
  ======================================================== */

  const images =
    (product.product_images || [])
      .slice()
      .sort(
        (a, b) =>
          Number(
            a?.sort_order || 0
          ) -
          Number(
            b?.sort_order || 0
          )
      );


  const mainImage =
    images[0]?.public_url ||
    NL.path(
      'assets/logo/noolthari-logo.webp'
    );

  // Only show external links that resolve to Instagram over HTTPS.
  let instagramUrl = null;
  try {
    const candidate = new URL(String(product.instagram_url || ''));
    if (candidate.protocol === 'https:' && ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(candidate.hostname.toLowerCase()) && candidate.pathname.length > 1) {
      instagramUrl = candidate.href;
    }
  } catch {
    instagramUrl = null;
  }

  const absoluteProductImage = new URL(mainImage, location.href).href;
  setMeta('meta[property="og:image"]', 'content', absoluteProductImage, 'meta', { property: 'og:image' });
  setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image', 'meta', { name: 'twitter:card' });
  setMeta('meta[name="twitter:title"]', 'content', document.title, 'meta', { name: 'twitter:title' });
  setMeta('meta[name="twitter:description"]', 'content', seoDescription, 'meta', { name: 'twitter:description' });
  setMeta('meta[name="twitter:image"]', 'content', absoluteProductImage, 'meta', { name: 'twitter:image' });


  /* =======================================================
     PRICE
  ======================================================== */

  const sellingPrice =
    Math.max(
      0,
      Number(
        product.selling_price || 0
      )
    );


  const salePrice =
    Math.max(
      0,
      Number(
        0
      )
    );


  const hasSale =
    salePrice > 0 &&
    salePrice < sellingPrice;


  const finalPrice =
    hasSale
      ? salePrice
      : sellingPrice;


  /* =======================================================
     STOCK
  ======================================================== */

  const stock =
    Math.max(
      0,
      Number(
        product.stock_quantity || 0
      )
    );


  const outOfStock =
    stock <= 0;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: String(product.saree_name || 'NOOLTHARI Saree'),
    description: seoDescription,
    image: images.length
      ? images.map(item => new URL(item.public_url, location.href).href)
      : [absoluteProductImage],
    sku: product.sku || undefined,
    color: product.colour || undefined,
    brand: { '@type': 'Brand', name: 'NOOLTHARI', url: 'https://www.noolthari.com/' },
    offers: {
      '@type': 'Offer',
      url: canonicalUrl.href,
      priceCurrency: 'INR',
      price: finalPrice.toFixed(2),
      availability: outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };
  let productJsonLd = document.getElementById('product-jsonld');
  if (!productJsonLd) {
    productJsonLd = document.createElement('script');
    productJsonLd.id = 'product-jsonld';
    productJsonLd.type = 'application/ld+json';
    document.head.appendChild(productJsonLd);
  }
  productJsonLd.textContent = JSON.stringify(productSchema);


  /* =======================================================
     RENDER PRODUCT
  ======================================================== */

  productView.innerHTML = `

    <div class="product-detail">


      <!-- ===============================================
           GALLERY
      ================================================ -->

      <div>


        <div class="gallery-main">

          <img
            id="main-img"
            src="${NL.esc(
              mainImage
            )}"
            alt="${NL.esc(
              product.saree_name || ''
            )}"
          >

        </div>


        ${
          images.length > 1
            ? `
              <div class="thumbs">
                ${images
                  .map(
                    (image, index) => `
                      <button
                        class="thumb"
                        type="button"
                        data-src="${NL.esc(image.public_url)}"
                        aria-label="View image ${index + 1}"
                      >
                        <img src="${NL.esc(image.public_url)}" alt="" loading="lazy">
                      </button>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        ${instagramUrl ? `
          <a class="product-instagram-link" href="${NL.esc(instagramUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${NL.esc(product.saree_name || 'this saree')} on Instagram">
            <span class="instagram-link-mark" aria-hidden="true">◎</span>
            <span><strong>Watch on Instagram</strong><small>See this saree in motion</small></span>
            <span class="instagram-link-arrow" aria-hidden="true">↗</span>
          </a>
        ` : ''}

      </div>


      <!-- ===============================================
           PRODUCT INFORMATION
      ================================================ -->

      <div class="product-copy">


        <div class="eyebrow">
          ${NL.esc(
            product.categories?.name ||
            'Collection'
          )}
        </div>


        <h1>
          ${NL.esc(
            product.saree_name || ''
          )}
        </h1>


        <!-- PRICE -->

        <div class="price-xl">

          ${NL.money(
            finalPrice
          )}

          ${
            hasSale
              ? `
                <del
                  style="
                    margin-left:10px;
                    color:#aaa;
                    font-size:16px;
                    font-weight:400;
                  "
                >
                  ${NL.money(
                    sellingPrice
                  )}
                </del>
              `
              : ''
          }

        </div>


        <!-- DESCRIPTION -->

        <p>
          ${NL.esc(
            product.description ||
            'A timeless NOOLTHARI selection.'
          )}
        </p>


        <!-- PRODUCT SPECS -->

        <dl class="specs">


          <dt>
            Colour
          </dt>

          <dd>
            ${NL.esc(
              product.colour ||
              '—'
            )}
          </dd>
<dt>
            Blouse
          </dt>

          <dd>
            ${
              product.blouse_included
                ? 'Included'
                : 'Not included'
            }
          </dd>


        </dl>
<!-- STOCK -->

        <div class="product-stock-status ${outOfStock ? 'is-out-of-stock' : 'is-in-stock'}" role="status">
          <span class="product-stock-dot" aria-hidden="true"></span>
          <span>${outOfStock ? 'Currently unavailable' : `${stock} available`}</span>
        </div>


        <!-- BUY NOW -->

        <button
          class="wishlist-product-button"
          id="product-wishlist"
          type="button"
          aria-pressed="false"
        >♡ Save to wishlist</button>

        <button
          class="btn btn-gold"
          id="buy-now"
          type="button"
          ${
            outOfStock
              ? 'disabled'
              : ''
          }
        >
          ${
            outOfStock
              ? 'Currently unavailable'
              : 'Buy now'
          }
        </button>


      </div>

    </div>

  `;


  /* =======================================================
     THUMBNAILS
  ======================================================== */

  const mainImageElement =
    NL.qs('#main-img');


  NL.qsa(
    '.thumb',
    productView
  ).forEach(button => {

    button.onclick =
      () => {

        const source =
          button.dataset.src;


        if (
          mainImageElement &&
          source
        ) {

          mainImageElement.src =
            source;

        }

      };

  });


  /* =======================================================
     PRODUCT WISHLIST
  ======================================================== */
  const wishlistButton = NL.qs('#product-wishlist');
  if (wishlistButton) {
    const userResult = await sb.auth.getUser();
    const user = userResult.data?.user;
    if (user) {
      const saved = await sb.from('wishlist_items').select('product_id').eq('customer_id', user.id).eq('product_id', productId).maybeSingle();
      if (saved.data) {
        wishlistButton.setAttribute('aria-pressed', 'true');
        wishlistButton.textContent = '♥ Saved to wishlist';
      }
    }
    wishlistButton.onclick = async () => {
      const authResult = await sb.auth.getUser();
      const currentUser = authResult.data?.user;
      if (!currentUser) {
        NL.toast('Sign in to save sarees to your wishlist.', 'info');
        location.href = NL.path('login.html?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      const isSaved = wishlistButton.getAttribute('aria-pressed') === 'true';
      wishlistButton.disabled = true;
      try {
        const response = isSaved
          ? await sb.from('wishlist_items').delete().eq('customer_id', currentUser.id).eq('product_id', productId)
          : await sb.from('wishlist_items').insert({ customer_id: currentUser.id, product_id: productId });
        if (response.error) throw response.error;
        wishlistButton.setAttribute('aria-pressed', String(!isSaved));
        wishlistButton.textContent = isSaved ? '♡ Save to wishlist' : '♥ Saved to wishlist';
        NL.toast(isSaved ? 'Removed from your wishlist.' : 'Saved to your wishlist.', 'success');
      } catch (error) {
        console.error('Product wishlist update failed:', error);
        NL.toast('Your wishlist could not be updated. Please try again.', 'error');
      } finally {
        wishlistButton.disabled = false;
      }
    };
  }

  /* =======================================================
     RELATED PRODUCTS
  ======================================================== */
  const relatedGrid = NL.qs('#related-products');
  if (relatedGrid) {
    await renderProducts(relatedGrid, { category: product.category_id || '', excludeId: product.id, sort: 'newest' });
  }

  /* =======================================================
     BUY NOW
     Uses catalog.js shopBuyNow()
  ======================================================== */

  const buyNowButton =
    NL.qs('#buy-now');


  if (buyNowButton) {

    buyNowButton.onclick =
      async () => {

        if (
          typeof shopBuyNow !==
          'function'
        ) {

          NL.toast(
            'Unable to start checkout.',
            'error'
          );

          return;
        }


        await shopBuyNow(
          productId,
          buyNowButton
        );

      };

  }

});