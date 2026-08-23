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
      .select(`
        *,
        categories(name),
        product_images(
          id,
          path,
          sort_order,
          public_url
        )
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
      'assets/logo/noolthari-logo.png'
    );


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
        product.sale_price || 0
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
                        data-src="${NL.esc(
                          image.public_url
                        )}"
                        aria-label="View image ${
                          index + 1
                        }"
                      >

                        <img
                          src="${NL.esc(
                            image.public_url
                          )}"
                          alt=""
                          loading="lazy"
                        >

                      </button>
                    `
                  )
                  .join('')}

              </div>
            `
            : ''
        }

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
            Fabric
          </dt>

          <dd>
            ${NL.esc(
              product.fabric ||
              '—'
            )}
          </dd>


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
            Pattern
          </dt>

          <dd>
            ${NL.esc(
              product.pattern ||
              '—'
            )}
          </dd>


          <dt>
            Occasion
          </dt>

          <dd>
            ${NL.esc(
              product.occasion ||
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

        <p class="stock">

          ${
            outOfStock
              ? 'Out of stock'
              : `${stock} available`
          }

        </p>


        <!-- BUY NOW -->

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
              ? 'Out of stock'
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