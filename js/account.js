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