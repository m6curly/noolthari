/* =========================================================
   NOOLTHARI™ ADMIN PRODUCTS
   Product CRUD + watermark + safe product removal
========================================================= */


/* =========================================================
   REMOVE UNWANTED LENGTH FIELDS
   Keeps Add/Edit UI free from:
   - saree_length
   - blouse_length
========================================================= */

function removeLengthFieldsFromProductForm() {

  const selectors = [
    '[name="saree_length"]',
    '[name="blouse_length"]'
  ];

  selectors.forEach(selector => {

    const input =
      document.querySelector(selector);

    if (!input) {
      return;
    }

    const wrapper =
      input.closest('.field') ||
      input.closest('.form-group');

    if (wrapper) {
      wrapper.remove();
      return;
    }

    input.remove();

  });

}


/* =========================================================
   PRODUCT LIST
========================================================= */

async function adminProductTable() {

  const table =
    NL.qs('#products-table');

  if (!table) {
    return;
  }


  const result =
    await sb
      .from('products')
      .select(
        `
          id,
          saree_name,
          sku,
          selling_price,
          stock_quantity,
          status,
          categories(name)
        `
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (result.error) {

    console.error(
      'Product table error:',
      result.error
    );

    NL.toast(
      result.error.message,
      'error'
    );

    return;
  }


  const products =
    result.data || [];


  if (!products.length) {

    table.innerHTML = `
      <tr>
        <td colspan="6">
          No products yet.
        </td>
      </tr>
    `;

    return;
  }


  table.innerHTML =
    products
      .map(product => {

        const inactive =
          product.status === 'inactive';


        return `
          <tr>

            <td>
              ${NL.esc(
                product.saree_name || ''
              )}
            </td>

            <td>
              ${NL.esc(
                product.sku || ''
              )}
            </td>

            <td>
              ${NL.money(
                product.selling_price || 0
              )}
            </td>

            <td>
              ${Number(
                product.stock_quantity || 0
              )}
            </td>

            <td>
              ${NL.esc(
                product.status || ''
              )}
            </td>

            <td>

              <div
                style="
                  display:flex;
                  gap:8px;
                  align-items:center;
                  flex-wrap:wrap;
                "
              >

                <a
                  class="btn btn-outline"
                  href="${NL.path(
                    'admin/product-edit.html?id=' +
                    product.id
                  )}"
                >
                  Edit
                </a>


                <button
                  class="btn product-remove-btn"
                  type="button"
                  data-remove-product="${NL.esc(
                    product.id
                  )}"
                  data-product-name="${NL.esc(
                    product.saree_name || ''
                  )}"
                  ${inactive ? 'disabled' : ''}
                >

                  ${
                    inactive
                      ? 'Removed'
                      : 'Remove'
                  }

                </button>

              </div>

            </td>

          </tr>
        `;

      })
      .join('');


  bindProductRemoveButtons();

}


/* =========================================================
   PRODUCT REMOVE
   Safe removal = inactive
   Existing orders/history remain intact.
========================================================= */

function bindProductRemoveButtons() {

  NL.qsa(
    '[data-remove-product]'
  ).forEach(button => {

    button.onclick =
      async () => {

        const productId =
          button.dataset.removeProduct;

        const productName =
          button.dataset.productName ||
          'this product';


        if (!productId) {
          return;
        }


        const confirmed =
          window.confirm(
            `Remove "${productName}" from the store?\n\n` +
            `The product will become inactive and will no longer appear to customers. ` +
            `Existing orders and accounting history will be preserved.`
          );


        if (!confirmed) {
          return;
        }


        const originalText =
          button.textContent;


        button.disabled =
          true;

        button.textContent =
          'Removing...';


        try {

          const result =
            await sb
              .from('products')
              .update({
                status: 'inactive',
                updated_at:
                  new Date().toISOString()
              })
              .eq(
                'id',
                productId
              );


          if (result.error) {
            throw result.error;
          }


          NL.toast(
            'Product removed from the store.',
            'success'
          );


          await adminProductTable();


        } catch (error) {

          console.error(
            'Product removal error:',
            error
          );


          NL.toast(
            error.message ||
            'Unable to remove product.',
            'error'
          );


          button.disabled =
            false;

          button.textContent =
            originalText;

        }

      };

  });

}


/* =========================================================
   LOAD PRODUCT FOR EDIT
========================================================= */

async function loadEditProduct() {

  const id =
    NL.query.get('id');

  if (!id) {
    return;
  }


  const result =
    await sb
      .from('products')
      .select('*')
      .eq(
        'id',
        id
      )
      .single();


  if (result.error) {

    console.error(
      'Load product error:',
      result.error
    );

    NL.toast(
      result.error.message,
      'error'
    );

    return;
  }


  const product =
    result.data;


  const setField =
    (name, value) => {

      const element =
        document.querySelector(
          `[name="${name}"]`
        );

      if (element) {
        element.value =
          value ?? '';
      }

    };


  setField(
    'saree_name',
    product.saree_name
  );

  setField(
    'sku',
    product.sku
  );

  setField(
    'fabric',
    product.fabric
  );

  setField(
    'colour',
    product.colour
  );

  setField(
    'pattern',
    product.pattern
  );

  setField(
    'occasion',
    product.occasion
  );

  setField(
    'purchase_price',
    product.purchase_price
  );

  setField(
    'selling_price',
    product.selling_price
  );

  setField(
    'sale_price',
    product.sale_price ?? ''
  );

  setField(
    'stock_quantity',
    product.stock_quantity
  );

  setField(
    'description',
    product.description
  );


  const category =
    document.querySelector(
      '[name="category_id"]'
    );

  if (category) {
    category.value =
      product.category_id || '';
  }


  const blouseIncluded =
    document.querySelector(
      '[name="blouse_included"]'
    );

  if (blouseIncluded) {
    blouseIncluded.checked =
      !!product.blouse_included;
  }


  const featured =
    document.querySelector(
      '[name="featured"]'
    );

  if (featured) {
    featured.checked =
      !!product.featured;
  }


  const bestseller =
    document.querySelector(
      '[name="bestseller"]'
    );

  if (bestseller) {
    bestseller.checked =
      !!product.bestseller;
  }


  const activeToggle =
    document.querySelector(
      '[name="active_toggle"]'
    );

  if (activeToggle) {
    activeToggle.checked =
      product.status === 'active';
  }

}


/* =========================================================
   WATERMARK SETTINGS
========================================================= */

const NOOLTHARI_WATERMARK = {

  text: 'NOOLTHARI',

  color: '#787878',

  opacity: 0.42,

  fontSizeRatio: 0.052,

  fontWeight: 600,

  angle: -26,

  spacingXRatio: 0.38,

  spacingYRatio: 0.19,

  quality: 0.94

};


/* =========================================================
   LOAD IMAGE FROM FILE
========================================================= */

function loadImageFromFile(file) {

  return new Promise(
    (resolve, reject) => {

      const url =
        URL.createObjectURL(file);


      const image =
        new Image();


      image.onload = () => {

        URL.revokeObjectURL(url);

        resolve(image);

      };


      image.onerror = () => {

        URL.revokeObjectURL(url);

        reject(
          new Error(
            'Unable to read image.'
          )
        );

      };


      image.src =
        url;

    }
  );

}


/* =========================================================
   CREATE WATERMARKED IMAGE
   Repeated diagonal NOOLTHARI pattern
========================================================= */

async function createWatermarkedImage(file) {

  const image =
    await loadImageFromFile(file);


  const width =
    image.naturalWidth ||
    image.width;

  const height =
    image.naturalHeight ||
    image.height;


  if (
    !width ||
    !height
  ) {

    throw new Error(
      'Invalid image dimensions.'
    );

  }


  const canvas =
    document.createElement(
      'canvas'
    );


  canvas.width =
    width;

  canvas.height =
    height;


  const ctx =
    canvas.getContext(
      '2d',
      {
        alpha: false
      }
    );


  if (!ctx) {

    throw new Error(
      'Image processing is not supported by this browser.'
    );

  }


  /* -------------------------------------------------------
     Draw original photograph
  ------------------------------------------------------- */

  ctx.drawImage(
    image,
    0,
    0,
    width,
    height
  );


  /* -------------------------------------------------------
     Watermark dimensions
  ------------------------------------------------------- */

  const fontSize =
    Math.max(
      28,
      Math.round(
        Math.min(
          width,
          height
        ) *
        NOOLTHARI_WATERMARK.fontSizeRatio
      )
    );


  const diagonal =
    Math.sqrt(
      width * width +
      height * height
    );


  const spacingX =
    Math.max(
      170,
      Math.round(
        width *
        NOOLTHARI_WATERMARK.spacingXRatio
      )
    );


  const spacingY =
    Math.max(
      95,
      Math.round(
        height *
        NOOLTHARI_WATERMARK.spacingYRatio
      )
    );


  /* -------------------------------------------------------
     Draw repeated watermark
  ------------------------------------------------------- */

  ctx.save();


  ctx.globalAlpha =
    NOOLTHARI_WATERMARK.opacity;


  ctx.fillStyle =
    NOOLTHARI_WATERMARK.color;


  ctx.font =
    `${NOOLTHARI_WATERMARK.fontWeight} ${fontSize}px Poppins, Arial, sans-serif`;


  ctx.textAlign =
    'center';

  ctx.textBaseline =
    'middle';


  /*
     Light white shadow improves readability
     on darker saree areas.
  */

  ctx.shadowColor =
    'rgba(255,255,255,.38)';

  ctx.shadowBlur =
    3;


  ctx.translate(
    width / 2,
    height / 2
  );


  ctx.rotate(
    NOOLTHARI_WATERMARK.angle *
    Math.PI /
    180
  );


  for (
    let y = -diagonal;
    y <= diagonal;
    y += spacingY
  ) {

    const rowNumber =
      Math.round(
        y / spacingY
      );


    const rowOffset =
      (
        (
          rowNumber % 2
        ) *
        spacingX
      ) / 2;


    for (
      let x = -diagonal;
      x <= diagonal;
      x += spacingX
    ) {

      ctx.fillText(
        NOOLTHARI_WATERMARK.text,
        x + rowOffset,
        y
      );

    }

  }


  ctx.restore();


  /* -------------------------------------------------------
     Convert to JPEG
  ------------------------------------------------------- */

  const blob =
    await new Promise(
      (resolve, reject) => {

        canvas.toBlob(
          result => {

            if (!result) {

              reject(
                new Error(
                  'Unable to create watermarked image.'
                )
              );

              return;
            }


            resolve(result);

          },
          'image/jpeg',
          NOOLTHARI_WATERMARK.quality
        );

      }
    );


  const cleanName =
    file.name.replace(
      /\.(png|jpe?g|webp|gif)$/i,
      ''
    );


  return new File(
    [blob],
    `${cleanName}.jpg`,
    {
      type: 'image/jpeg',
      lastModified: Date.now()
    }
  );

}


/* =========================================================
   UPLOAD WATERMARKED PRODUCT IMAGE
========================================================= */

async function uploadWatermarkedProductImage(
  productId,
  file,
  sortOrder
) {

  if (
    !file ||
    !file.type.startsWith(
      'image/'
    )
  ) {
    return null;
  }


  /* Create permanent watermarked copy */

  const watermarkedFile =
    await createWatermarkedImage(
      file
    );


  /* Safe filename */

  const cleanName =
    watermarkedFile.name
      .replace(
        /\.[^/.]+$/,
        ''
      )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );


  const path =
    `${productId}/${crypto.randomUUID()}-${cleanName}.jpg`;


  /* Upload only watermarked image */

  const upload =
    await sb
      .storage
      .from('product-images')
      .upload(
        path,
        watermarkedFile,
        {
          cacheControl:
            '31536000',

          upsert:
            false,

          contentType:
            'image/jpeg'
        }
      );


  if (upload.error) {
    throw upload.error;
  }


  /* Public URL */

  const publicUrl =
    sb
      .storage
      .from('product-images')
      .getPublicUrl(
        path
      )
      .data
      .publicUrl;


  /* Save image reference */

  const imageRecord =
    await sb
      .from('product_images')
      .insert({
        product_id:
          productId,

        path:
          path,

        public_url:
          publicUrl,

        sort_order:
          sortOrder,

        is_primary:
          sortOrder === 0

      })
      .select('id')
      .single();


  if (imageRecord.error) {

    /* Remove Storage file if database insert fails */

    await sb
      .storage
      .from('product-images')
      .remove([
        path
      ]);


    throw imageRecord.error;

  }


  return {
    id:
      imageRecord.data.id,

    path,

    publicUrl
  };

}


/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct(formElement) {

  const form =
    new FormData(
      formElement
    );


  const id =
    NL.query.get('id');


  /*
     Intentionally excluded:
     - saree_length
     - blouse_length
  */

  const payload = {

    saree_name:
      form.get(
        'saree_name'
      ),

    sku:
      form.get(
        'sku'
      ),

    category_id:
      form.get(
        'category_id'
      ),

    description:
      form.get(
        'description'
      ),

    fabric:
      form.get(
        'fabric'
      ),

    colour:
      form.get(
        'colour'
      ),

    pattern:
      form.get(
        'pattern'
      ),

    occasion:
      form.get(
        'occasion'
      ),

    purchase_price:
      Number(
        form.get(
          'purchase_price'
        ) || 0
      ),

    selling_price:
      Number(
        form.get(
          'selling_price'
        ) || 0
      ),

    sale_price:
      form.get(
        'sale_price'
      )
        ? Number(
            form.get(
              'sale_price'
            )
          )
        : null,

    stock_quantity:
      Number(
        form.get(
          'stock_quantity'
        ) || 0
      ),

    blouse_included:
      form.get(
        'blouse_included'
      ) === 'on',

    featured:
      form.get(
        'featured'
      ) === 'on',

    bestseller:
      form.get(
        'bestseller'
      ) === 'on',

    status:
      id
        ? (
            form.get(
              'active_toggle'
            ) === 'on'
              ? 'active'
              : 'inactive'
          )
        : 'active',

    slug:
      (
        form.get(
          'saree_name'
        ) || ''
      )
        .toLowerCase()
        .trim()
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        )

  };


  /* =======================================================
     INSERT / UPDATE
  ======================================================== */

  let result;


  if (id) {

    result =
      await sb
        .from('products')
        .update(
          payload
        )
        .eq(
          'id',
          id
        )
        .select('id')
        .single();

  } else {

    result =
      await sb
        .from('products')
        .insert(
          payload
        )
        .select('id')
        .single();

  }


  if (result.error) {
    throw result.error;
  }


  return result.data.id;

}


/* =========================================================
   UPLOAD PRODUCT IMAGES
========================================================= */

async function uploadProductImages(
  productId,
  input
) {

  if (
    !input?.files?.length
  ) {
    return;
  }


  const files =
    Array.from(
      input.files
    );


  let sortOrder =
    0;


  for (
    const file of files
  ) {

    if (
      !file.type.startsWith(
        'image/'
      )
    ) {
      continue;
    }


    try {

      await uploadWatermarkedProductImage(
        productId,
        file,
        sortOrder
      );


      sortOrder++;

    } catch (error) {

      console.error(
        'Watermark upload error:',
        error
      );


      NL.toast(
        `Image "${file.name}" could not be uploaded.`,
        'error'
      );

    }

  }

}


/* =========================================================
   LOAD CATEGORIES
========================================================= */

async function loadProductCategories() {

  const result =
    await sb
      .from('categories')
      .select(
        'id,name'
      )
      .order(
        'name'
      );


  if (result.error) {
    throw result.error;
  }


  const categories =
    result.data || [];


  const select =
    NL.qs('#category');


  if (!select) {
    return;
  }


  select.innerHTML =
    categories
      .map(
        category => `
          <option
            value="${NL.esc(
              category.id
            )}"
          >
            ${NL.esc(
              category.name
            )}
          </option>
        `
      )
      .join('');

}


/* =========================================================
   INITIALIZE PRODUCT FORM
========================================================= */

async function initializeProductForm() {

  const form =
    NL.qs(
      '#product-form'
    );


  if (!form) {
    return false;
  }


  /* Remove unwanted length fields */

  removeLengthFieldsFromProductForm();


  /* Load categories */

  try {

    await loadProductCategories();

  } catch (error) {

    console.error(
      'Categories load error:',
      error
    );

    NL.toast(
      error.message,
      'error'
    );

    return true;
  }


  /* Edit mode */

  if (
    NL.query.get('id')
  ) {

    await loadEditProduct();

  }


  /* Save */

  form.onsubmit =
    async event => {

      event.preventDefault();


      const submitButton =
        form.querySelector(
          'button[type="submit"], .btn'
        );


      const originalText =
        submitButton?.textContent ||
        'Save product';


      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
          'Saving...';
      }


      try {

        const productId =
          await saveProduct(
            form
          );


        const imageInput =
          NL.qs(
            '[name="images"]'
          );


        await uploadProductImages(
          productId,
          imageInput
        );


        NL.toast(
          'Product saved successfully.',
          'success'
        );


        setTimeout(
          () => {

            location.href =
              NL.path(
                'admin/products.html'
              );

          },
          700
        );


      } catch (error) {

        console.error(
          'Product save error:',
          error
        );


        NL.toast(
          error.message ||
          'Unable to save product.',
          'error'
        );


        if (submitButton) {

          submitButton.disabled =
            false;

          submitButton.textContent =
            originalText;

        }

      }

    };


  return true;

}


/* =========================================================
   MAIN
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    const admin =
      await NL.requireRole(
        'admin'
      );


    if (!admin) {
      return;
    }


    const isForm =
      await initializeProductForm();


    if (isForm) {
      return;
    }


    if (
      NL.qs(
        '#products-table'
      )
    ) {

      await adminProductTable();

    }

  }
);