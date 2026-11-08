/* Extracted from index.html to support a stricter Content Security Policy. */

document.addEventListener(
      'DOMContentLoaded',
      async () => {

        const hero = NL.qs('.hero-image');
        if (hero && typeof sb !== 'undefined') {
          const settings = await sb.from('store_settings').select('hero_image_url,hero_image_position').eq('id', true).maybeSingle();
          if (!settings.error && settings.data?.hero_image_url) {
            hero.src = settings.data.hero_image_url;
            hero.style.objectPosition = settings.data.hero_image_position || 'center';
          }
        }

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
          { sort: 'newest' }
        );

      }
    );
