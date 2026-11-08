document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     LOGOUT
  ======================================================== */

  const logoutButton =
    NL.qs('[data-account-logout]');


  if (logoutButton) {

    logoutButton.onclick =
      async () => {

        await sb.auth.signOut();

        location.href =
          NL.path('index.html');

      };

  }


  /* =======================================================
     AUTHENTICATED USER
  ======================================================== */

  const profile =
    await NL.requireAuth();


  if (!profile) {
    return;
  }

  /* =======================================================
     ACCOUNT WISHLIST
  ======================================================== */
  const wishlistGrid = NL.qs('#wishlist-grid');
  if (wishlistGrid) {
    try {
      const result = await sb.from('wishlist_items')
        .select(`product_id,products(id,saree_name,sku,selling_price,stock_quantity,status,categories(name),product_images(id,path,sort_order,public_url))`)
        .eq('customer_id', profile.id)
        .order('created_at', { ascending: false });
      if (result.error) throw result.error;
      const savedProducts = (result.data || []).map(item => item.products).filter(product => product && product.status === 'active');
      if (!savedProducts.length) {
        wishlistGrid.innerHTML = '<p class="empty">You have not saved any sarees yet. Explore the collection and tap the heart to save a favourite.</p>';
      } else {
        const ids = new Set(savedProducts.map(product => String(product.id)));
        const quantities = await getShopCartQuantities(profile.id);
        wishlistGrid.innerHTML = savedProducts.map(product => card(product, quantities, ids)).join('');
        NL.qsa('.product-card', wishlistGrid).forEach(bindShopCardButtons);
      }
    } catch (error) {
      console.error('Wishlist load failed:', error);
      wishlistGrid.innerHTML = '<p class="empty">Your wishlist could not be loaded. Please refresh the page.</p>';
    }
  }

  /* =======================================================
     PROFILE ELEMENTS
  ======================================================== */

  const nameInput =
    NL.qs('#profile-name');

  const phoneInput =
    NL.qs('#profile-phone');

  const emailInput =
    NL.qs('#profile-email');

  const profileForm =
    NL.qs('#profile-form');


  /* =======================================================
     LOAD PROFILE DATA
  ======================================================== */

  if (nameInput) {
    nameInput.value =
      profile.name || '';
  }


  if (phoneInput) {
    phoneInput.value =
      profile.phone || '';
  }


  if (emailInput) {
    emailInput.value =
      profile.email || '';
  }


  if (!profileForm) {
    return;
  }


  /* =======================================================
     SAVE PROFILE
  ======================================================== */

  profileForm.onsubmit =
    async event => {

      event.preventDefault();


      const name =
        nameInput?.value
          .trim() || '';


      const phone =
        phoneInput?.value
          .trim() || '';


      const result =
        await sb
          .from('profiles')
          .update({
            name,
            phone
          })
          .eq(
            'id',
            profile.id
          );


      if (result.error) {

        console.error(
          'Profile update error:',
          result.error
        );


        NL.toast(
          result.error.message,
          'error'
        );

        return;
      }


      NL.toast(
        'Profile saved.',
        'success'
      );

    };

});