/* Extracted from index.html to support a stricter Content Security Policy. */

document.addEventListener(
      'DOMContentLoaded',
      async () => {

        const hero = NL.qs('.hero-image');
        const gallery = NL.qs('#home-gallery');
        if (hero && typeof sb !== 'undefined') {
          const settings = await sb.from('store_settings').select('hero_image_url,hero_image_position').eq('id', true).maybeSingle();
          if (!settings.error && settings.data?.hero_image_url) {
            hero.src = settings.data.hero_image_url;
            hero.style.objectPosition = settings.data.hero_image_position || 'center';
          }
        }


        if (gallery && typeof sb !== 'undefined') {
          try {
            const galleryResult = await sb.from('store_gallery').select('public_url,sort_order').eq('active',true).order('sort_order',{ascending:true});
            const galleryImages = (galleryResult.data || []).map(x => x.public_url).filter(Boolean);
            if (!galleryResult.error && galleryImages.length) {
              gallery.innerHTML = '';
              const groups = [];
              for (let i=0; i<galleryImages.length; i+=4) groups.push(galleryImages.slice(i,i+4));
              // Rotate through shuffled image groupings, wrapping endlessly.
              const slides = groups.map((group,idx) => {
                const slide=document.createElement('div'); slide.className='gallery-slide '+(group.length===1?'single':group.length===2?'two':group.length===3?'three':'');
                group.forEach((url,j)=>{const img=document.createElement('img');img.src=url;img.alt='NOOLTHARI model shoot';img.loading=idx===0?'eager':'lazy';img.onerror=()=>img.remove();slide.appendChild(img);});
                gallery.appendChild(slide); return slide;
              });
              if (slides.length) {
                let current=0; slides[0].classList.add('active');
                if (slides.length>1) window.setInterval(()=>{slides[current].classList.remove('active');current=(current+1)%slides.length;slides[current].classList.add('active');},5000);
              }
            }
          } catch (galleryError) { console.warn('Gallery slideshow unavailable; using fallback banner.',galleryError); }
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
