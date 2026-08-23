document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ADMIN AUTH
  ======================================================== */

  const profile =
    await NL.requireRole('admin');

  if (!profile) {
    return;
  }


  /* =======================================================
     ELEMENTS
  ======================================================== */

  const box =
    NL.qs('#categories-table');

  const form =
    NL.qs('#cat-form');

  const nameInput =
    NL.qs('#cat-name');

  const slugInput =
    NL.qs('#cat-slug');


  if (!box) {
    return;
  }


  /* =======================================================
     LOAD CATEGORIES
  ======================================================== */

  async function load() {

    const result =
      await sb
        .from('categories')
        .select('*')
        .order('name');


    if (result.error) {

      console.error(
        'Categories load error:',
        result.error
      );

      NL.toast(
        result.error.message,
        'error'
      );

      return;
    }


    const categories =
      result.data || [];


    if (!categories.length) {

      box.innerHTML = `
        <tr>
          <td colspan="3">
            No categories found.
          </td>
        </tr>
      `;

      return;
    }


    box.innerHTML =
      categories
        .map(category => `
          <tr>

            <td>
              ${NL.esc(
                category.name || ''
              )}
            </td>

            <td>
              ${
                category.active
                  ? 'Active'
                  : 'Inactive'
              }
            </td>

            <td>

              <button
                class="btn btn-outline"
                type="button"
                data-category-id="${NL.esc(
                  category.id
                )}"
                data-category-active="${
                  category.active
                }"
              >
                Toggle
              </button>

            </td>

          </tr>
        `)
        .join('');


    /* =====================================================
       CATEGORY TOGGLE
    ====================================================== */

    NL.qsa(
      'button[data-category-id]',
      box
    ).forEach(button => {

      button.onclick =
        async () => {

          const id =
            button.dataset.categoryId;

          const currentActive =
            button.dataset.categoryActive === 'true';


          button.disabled = true;


          const result =
            await sb
              .from('categories')
              .update({
                active:
                  !currentActive
              })
              .eq(
                'id',
                id
              );


          if (result.error) {

            console.error(
              'Category update error:',
              result.error
            );

            NL.toast(
              result.error.message,
              'error'
            );

            button.disabled = false;

            return;
          }


          await load();

        };

    });

  }


  /* =======================================================
     INITIAL LOAD
  ======================================================== */

  await load();


  /* =======================================================
     ADD CATEGORY
  ======================================================== */

  if (!form) {
    return;
  }


  form.onsubmit =
    async event => {

      event.preventDefault();


      const name =
        nameInput?.value
          .trim() || '';


      const slug =
        slugInput?.value
          .trim() ||
        name
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            '-'
          )
          .replace(
            /^-+|-+$/g,
            '');


      if (!name) {

        NL.toast(
          'Category name is required.',
          'error'
        );

        return;
      }


      const result =
        await sb
          .from('categories')
          .insert({
            name,
            slug
          });


      if (result.error) {

        console.error(
          'Category insert error:',
          result.error
        );

        NL.toast(
          result.error.message,
          'error'
        );

        return;
      }


      NL.toast(
        'Category added.',
        'success'
      );


      form.reset();


      await load();

    };

});