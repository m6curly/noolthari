/* Extracted from login.html to support a stricter Content Security Policy. */

document.addEventListener(
      'DOMContentLoaded',
      () => {

        const tabs =
          NL.qsa(
            '.auth-tab'
          );

        const panels = {
          signin:
            NL.qs('#auth-signin'),

          signup:
            NL.qs('#auth-signup')
        };


        const showMode =
          mode => {

            const validMode =
              mode === 'signup'
                ? 'signup'
                : 'signin';


            tabs.forEach(tab => {

              const active =
                tab.dataset.mode ===
                validMode;


              tab.classList.toggle(
                'active',
                active
              );


              tab.setAttribute(
                'aria-selected',
                String(active)
              );

            });


            Object.entries(
              panels
            ).forEach(
              ([name, panel]) => {

                if (!panel) {
                  return;
                }


                panel.hidden =
                  name !==
                  validMode;

              }
            );

          };


        tabs.forEach(tab => {

          tab.addEventListener(
            'click',
            () => {

              showMode(
                tab.dataset.mode
              );

            }
          );

        });


        const mode =
          new URLSearchParams(
            window.location.search
          ).get(
            'mode'
          );


        showMode(
          mode === 'signup'
            ? 'signup'
            : 'signin'
        );

      }
    );
