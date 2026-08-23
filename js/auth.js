document.addEventListener('DOMContentLoaded', () => {

  /* =======================================================
     SIGN IN
  ======================================================== */

  const loginForm =
    NL.qs('#login-form');


  if (loginForm) {

    loginForm.onsubmit =
      async event => {

        event.preventDefault();


        const button =
          loginForm.querySelector(
            'button[type="submit"]'
          );


        const email =
          NL.qs('#signin-email')
            ?.value
            .trim() || '';


        const password =
          NL.qs('#signin-password')
            ?.value || '';


        if (button) {

          button.disabled =
            true;

          button.textContent =
            'Signing in…';

        }


        const result =
          await sb.auth.signInWithPassword({
            email,
            password
          });


        if (result.error) {

          NL.toast(
            result.error.message,
            'error'
          );


          if (button) {

            button.disabled =
              false;

            button.textContent =
              'Sign in';

          }


          return;
        }


        /* -------------------------------------------------
           Determine destination
        -------------------------------------------------- */

        const profile =
          await NL.profile();


        const next =
          NL.query.get('next');


        location.href =
          next
            ? next
            : (
                profile?.role === 'admin'
                  ? NL.path(
                      'admin/index.html'
                    )
                  : NL.path(
                      'index.html'
                    )
              );

      };

  }


  /* =======================================================
     REGISTER
  ======================================================== */

  const registerForm =
    NL.qs('#register-form');


  if (registerForm) {

    registerForm.onsubmit =
      async event => {

        event.preventDefault();


        const button =
          registerForm.querySelector(
            'button[type="submit"]'
          );


        const name =
          NL.qs('#signup-name')
            ?.value
            .trim() || '';


        const phone =
          NL.qs('#signup-phone')
            ?.value
            .trim() || '';


        const email =
          NL.qs('#signup-email')
            ?.value
            .trim() || '';


        const password =
          NL.qs('#signup-password')
            ?.value || '';


        if (button) {

          button.disabled =
            true;

          button.textContent =
            'Creating account…';

        }


        const result =
          await sb.auth.signUp({

            email,

            password,

            options: {
              data: {
                name,
                phone
              }
            }

          });


        if (result.error) {

          NL.toast(
            result.error.message,
            'error'
          );


          if (button) {

            button.disabled =
              false;

            button.textContent =
              'Create account';

          }


          return;
        }


        /* -------------------------------------------------
           Session already available
        -------------------------------------------------- */

        if (result.data?.session) {

          location.href =
            NL.path(
              'index.html'
            );

          return;
        }


        /* -------------------------------------------------
           Email confirmation required
        -------------------------------------------------- */

        NL.toast(
          'Account created. Check your email if confirmation is enabled.',
          'success'
        );


        if (button) {

          button.disabled =
            false;

          button.textContent =
            'Create account';

        }


        document
          .querySelector(
            '[data-mode="signin"]'
          )
          ?.click();

      };

  }


  /* =======================================================
     FORGOT PASSWORD
  ======================================================== */

  const forgotForm =
    NL.qs('#forgot-form');


  if (forgotForm) {

    forgotForm.onsubmit =
      async event => {

        event.preventDefault();


        const email =
          NL.qs('#email')
            ?.value
            .trim() || '';


        const redirectUrl =
          new URL(
            NL.path(
              'reset-password.html'
            ),
            location.href
          ).href;


        const result =
          await sb.auth.resetPasswordForEmail(
            email,
            {
              redirectTo:
                redirectUrl
            }
          );


        if (result.error) {

          NL.toast(
            result.error.message,
            'error'
          );

          return;
        }


        NL.toast(
          'Reset email sent if the account exists.',
          'success'
        );

      };

  }


  /* =======================================================
     RESET PASSWORD
  ======================================================== */

  const resetForm =
    NL.qs('#reset-form');


  if (resetForm) {

    resetForm.onsubmit =
      async event => {

        event.preventDefault();


        const password =
          NL.qs('#password')
            ?.value || '';


        const result =
          await sb.auth.updateUser({
            password
          });


        if (result.error) {

          NL.toast(
            result.error.message,
            'error'
          );

          return;
        }


        NL.toast(
          'Password updated.',
          'success'
        );


        setTimeout(
          () => {

            location.href =
              NL.path(
                'login.html'
              );

          },
          1000
        );

      };

  }

});