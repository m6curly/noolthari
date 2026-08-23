document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     GLOBAL YEAR
  ======================================================== */

  NL.qsa('[data-year]').forEach(element => {
    element.textContent =
      new Date().getFullYear();
  });


  /* =======================================================
     CURRENT PROFILE
  ======================================================== */

  const profile =
    await NL.profile();


  /* =======================================================
     STOREFRONT NAVIGATION
  ======================================================== */

  const nav =
    NL.qs('[data-site-nav]');

  const menu =
    NL.qs('[data-menu-toggle]');


  if (menu && nav) {

    menu.onclick = () => {

      nav.classList.toggle('open');

    };

  }


  /* =======================================================
     ADMIN MOBILE NAVIGATION
  ======================================================== */

  const adminMenu =
    NL.qs('[data-admin-menu]');


  if (adminMenu) {

    adminMenu.onclick = () => {

      const adminNav =
        NL.qs('.admin-nav');


      if (!adminNav) {
        return;
      }


      adminNav.classList.toggle('open');


      adminMenu.setAttribute(
        'aria-expanded',
        String(
          adminNav.classList.contains('open')
        )
      );

    };

  }


  /* =======================================================
     STOREFRONT ACCOUNT CONTROLS
  ======================================================== */

  NL.qsa('[data-auth-slot]').forEach(slot => {

    /* -----------------------------------------------------
       Guest
    ------------------------------------------------------ */

    if (!profile) {

      slot.innerHTML = `
        <a
          class="header-auth-link"
          href="${NL.path(
            'login.html'
          )}"
        >
          Sign in
        </a>

        <a
          class="btn btn-gold header-signup"
          href="${NL.path(
            'login.html?mode=signup'
          )}"
        >
          Sign up
        </a>
      `;

      return;
    }


    /* -----------------------------------------------------
       Signed-in user
    ------------------------------------------------------ */

    slot.innerHTML = `
      <a
        class="icon-link"
        href="${NL.path(
          'account.html'
        )}"
        aria-label="My account"
        title="My account"
      >
        ◌
      </a>

      ${
        profile.role === 'admin'
          ? `
            <a
              class="header-admin-link"
              href="${NL.path(
                'admin/index.html'
              )}"
            >
              Admin
            </a>
          `
          : ''
      }

      <button
        class="header-logout"
        type="button"
        data-header-logout
      >
        Sign out
      </button>
    `;


    /* -----------------------------------------------------
       Header logout
    ------------------------------------------------------ */

    const logoutButton =
      slot.querySelector(
        '[data-header-logout]'
      );


    if (logoutButton) {

      logoutButton.addEventListener(
        'click',
        async () => {

          logoutButton.disabled =
            true;


          const result =
            await sb.auth.signOut();


          if (result.error) {

            console.error(
              'Header logout error:',
              result.error
            );


            NL.toast(
              result.error.message ||
              'Unable to sign out.',
              'error'
            );


            logoutButton.disabled =
              false;

            return;
          }


          location.href =
            NL.path(
              'index.html'
            );

        }
      );

    }

  });


  /* =======================================================
     ADMIN / LEGACY LOGOUT
  ======================================================== */

  NL.qsa(
    '[data-logout]'
  ).forEach(button => {

    button.onclick =
      async event => {

        event.preventDefault();


        button.disabled =
          true;


        const result =
          await sb.auth.signOut();


        if (result.error) {

          console.error(
            'Admin logout error:',
            result.error
          );


          NL.toast(
            result.error.message ||
            'Unable to sign out.',
            'error'
          );


          button.disabled =
            false;

          return;
        }


        location.href =
          NL.path(
            'index.html'
          );

      };

  });


  /* =======================================================
     USER NAME
  ======================================================== */

  NL.qsa(
    '[data-user-name]'
  ).forEach(element => {

    element.textContent =
      profile?.name ||
      profile?.email?.split('@')[0] ||
      'Account';

  });


  /* =======================================================
     ADMIN LINK
  ======================================================== */

  NL.qsa(
    '[data-admin-link]'
  ).forEach(link => {

    const isAdmin =
      profile?.role === 'admin';


    link.hidden =
      !isAdmin;


    if (isAdmin) {

      link.href =
        NL.path(
          'admin/index.html'
        );

    }

  });


  /* =======================================================
     CONTACT FORM
     Saves customer enquiries to Supabase
  ======================================================== */

  const contactForm =
    NL.qs('#contact-form');


  if (
    contactForm &&
    typeof sb !== 'undefined'
  ) {

    contactForm.addEventListener(
      'submit',
      async event => {

        event.preventDefault();


        const button =
          contactForm.querySelector(
            'button[type="submit"]'
          );


        const formData =
          new FormData(
            contactForm
          );


        const name =
          String(
            formData.get('name') ||
            ''
          ).trim();


        const email =
          String(
            formData.get('email') ||
            ''
          ).trim();


        const subject =
          String(
            formData.get('subject') ||
            ''
          ).trim();


        const message =
          String(
            formData.get('message') ||
            ''
          ).trim();


        /* -------------------------------------------------
           Validation
        -------------------------------------------------- */

        if (
          !name ||
          !email ||
          !subject ||
          !message
        ) {

          NL.toast(
            'Please fill in all fields.',
            'error'
          );

          return;
        }


        /* -------------------------------------------------
           Sending state
        -------------------------------------------------- */

        const originalText =
          button?.textContent ||
          'Send message';


        if (button) {

          button.disabled =
            true;

          button.textContent =
            'Sending...';

        }


        try {

          /* -----------------------------------------------
             Save customer message
          ------------------------------------------------ */

          const result =
            await sb
              .from(
                'contact_messages'
              )
              .insert({
                name,
                email,
                subject,
                message
              });


          if (result.error) {
            throw result.error;
          }


          /* -----------------------------------------------
             Success
          ------------------------------------------------ */

          contactForm.reset();


          NL.toast(
            'Message sent successfully.',
            'success'
          );


        } catch (error) {

          console.error(
            'Contact form error:',
            error
          );


          NL.toast(
            error.message ||
            'Unable to send message. Please try again.',
            'error'
          );


        } finally {

          /* ---------------------------------------------
             Restore button
          ---------------------------------------------- */

          if (button) {

            button.disabled =
              false;

            button.textContent =
              originalText;

          }

        }

      }
    );

  }

});