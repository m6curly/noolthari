document.addEventListener('DOMContentLoaded', () => {

  /* =======================================================
     FORGOT PASSWORD
  ======================================================== */

  const forgotForm =
    NL.qs('#forgot-form');


  if (forgotForm) {

    forgotForm.onsubmit =
      async event => {

        event.preventDefault();


        const emailInput =
          NL.qs('#email');


        const email =
          emailInput?.value
            .trim() || '';


        if (!email) {

          NL.toast(
            'Please enter your email address.',
            'error'
          );

          return;
        }


        const result =
          await sb.auth.resetPasswordForEmail(
            email,
            {
              redirectTo:
                new URL(
                  NL.path(
                    'reset-password.html'
                  ),
                  location.href
                ).href
            }
          );


        if (result.error) {

          console.error(
            'Password reset request error:',
            result.error
          );


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


        const passwordInput =
          NL.qs('#password');


        const password =
          passwordInput?.value || '';


        if (!password) {

          NL.toast(
            'Please enter your new password.',
            'error'
          );

          return;
        }


        const result =
          await sb.auth.updateUser({
            password
          });


        if (result.error) {

          console.error(
            'Password update error:',
            result.error
          );


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