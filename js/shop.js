/* =========================================================
   NOOLTHARI™ SHOP
   Category filter + search + sorting
========================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     PRODUCT GRID
  ======================================================== */

  const productGrid =
    NL.qs('#product-grid');

  if (!productGrid) {
    return;
  }


  /* =======================================================
     FILTER ELEMENTS
  ======================================================== */

  const filtersForm =
    NL.qs('#filters');

  const categorySelect =
    NL.qs('#category');

  const searchInput =
    NL.qs('#search');

  const sortSelect =
    NL.qs('#sort');


  /* =======================================================
     LOAD ACTIVE CATEGORIES
  ======================================================== */

  if (categorySelect) {

    const result =
      await sb
        .from('categories')
        .select(
          'id,name'
        )
        .eq(
          'active',
          true
        )
        .order(
          'name'
        );


    if (result.error) {

      console.error(
        'Shop category loading error:',
        result.error
      );


      NL.toast(
        result.error.message,
        'error'
      );

    } else {

      const categories =
        result.data || [];


      categories.forEach(category => {

        const option =
          document.createElement(
            'option'
          );


        option.value =
          category.id;


        option.textContent =
          category.name || '';


        categorySelect.appendChild(
          option
        );

      });

    }

  }


  /* =======================================================
     RENDER SHOP
  ======================================================== */

  const renderShop =
    async () => {

      await renderProducts(
        productGrid,
        {
          category:
            categorySelect?.value ||
            '',

          search:
            searchInput?.value
              .trim() ||
            '',

          sort:
            sortSelect?.value ||
            'newest'
        }
      );

    };


  /* =======================================================
     FILTER FORM
  ======================================================== */

  if (filtersForm) {

    filtersForm.onsubmit =
      async event => {

        event.preventDefault();

        await renderShop();

      };

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await renderShop();

});