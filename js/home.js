/* Extracted from index.html to support a stricter Content Security Policy. */

document.addEventListener(
      'DOMContentLoaded',
      () => {

        const products =
          NL.qs('#home-products');


        if (!products) {
          return;
        }


        if (
          typeof renderProducts !==
          'function'
        ) {

          console.error(
            'renderProducts() is not available.'
          );

          return;
        }


        renderProducts(
          products,
          {
            sort: 'newest'
          }
        );

      }
    );
