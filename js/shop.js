/* =========================================================
   NOOLTHARI™ SHOP
   Category filter + search + automatic sorting
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
     PREVENT FORM SUBMIT
     Apply button has been removed.
     Pressing Enter should not reload the page.
  ======================================================== */

  if (filtersForm) {

    filtersForm.addEventListener(
      'submit',
      event => {

        event.preventDefault();

      }
    );

  }


  /* =======================================================
     CATEGORY
     Automatically filter when category changes.
  ======================================================== */

  if (categorySelect) {

    categorySelect.addEventListener(
      'change',
      async () => {

        await renderShop();

      }
    );

  }


  /* =======================================================
     SORT
     Automatically sort when selection changes.
  ======================================================== */

  if (sortSelect) {

    sortSelect.addEventListener(
      'change',
      async () => {

        await renderShop();

      }
    );

  }


  /* =======================================================
     SEARCH
     Automatically search while typing.
     
     300ms debounce prevents a Supabase request
     for every single keystroke.
  ======================================================== */

  let searchTimer = null;


  if (searchInput) {

    searchInput.addEventListener(
      'input',
      () => {

        clearTimeout(
          searchTimer
        );


        searchTimer =
          setTimeout(
            async () => {

              await renderShop();

            },
            300
          );

      }
    );

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await renderShop();

});