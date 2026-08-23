window.NL = {

  /* =======================================================
     DOM HELPERS
  ======================================================== */

  qs: (
    selector,
    root = document
  ) => {

    return root.querySelector(
      selector
    );

  },


  qsa: (
    selector,
    root = document
  ) => {

    return Array.from(
      root.querySelectorAll(
        selector
      )
    );

  },


  /* =======================================================
     HTML ESCAPE
  ======================================================== */

  esc: value => {

    return String(
      value ?? ''
    ).replace(
      /[&<>'"]/g,
      character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[character])
    );

  },


  /* =======================================================
     CURRENCY
  ======================================================== */

  money: value => {

    const amount =
      Number(
        value || 0
      );


    return new Intl.NumberFormat(
      'en-IN',
      {
        style:
          'currency',

        currency:
          'INR',

        maximumFractionDigits:
          0
      }
    ).format(
      Number.isFinite(amount)
        ? amount
        : 0
    );

  },


  /* =======================================================
     TOAST
  ======================================================== */

  toast: (
    message,
    type = 'info'
  ) => {

    const element =
      document.createElement(
        'div'
      );


    const safeType =
      [
        'info',
        'success',
        'error',
        'warning'
      ].includes(type)
        ? type
        : 'info';


    element.className =
      `toast toast-${safeType}`;


    element.textContent =
      String(
        message ?? ''
      );


    document.body.appendChild(
      element
    );


    window.setTimeout(
      () => {

        element.remove();

      },
      4500
    );

  },


  /* =======================================================
     CURRENT QUERY STRING
  ======================================================== */

  query:
    new URLSearchParams(
      window.location.search
    ),


  /* =======================================================
     CURRENT ROOT
  ======================================================== */

  root:
    document.body?.dataset?.root ||
    './',


  /* =======================================================
     BUILD SITE PATH
     
     Examples:
       NL.path('index.html')
       NL.path('cart.html')
       NL.path('product.html?id=123')
       NL.path('admin/index.html')
  ======================================================== */

  path: relativePath => {

    const value =
      String(
        relativePath ?? ''
      );


    const base =
      document.body?.dataset?.root ||
      './';


    /*
       Keep query string intact.
    */

    const questionIndex =
      value.indexOf('?');


    const hashIndex =
      value.indexOf('#');


    let splitIndex =
      -1;


    if (
      questionIndex !== -1 &&
      hashIndex !== -1
    ) {

      splitIndex =
        Math.min(
          questionIndex,
          hashIndex
        );

    } else if (
      questionIndex !== -1
    ) {

      splitIndex =
        questionIndex;

    } else if (
      hashIndex !== -1
    ) {

      splitIndex =
        hashIndex;

    }


    if (
      splitIndex === -1
    ) {

      return (
        base +
        value
      );

    }


    const pathPart =
      value.slice(
        0,
        splitIndex
      );


    const suffix =
      value.slice(
        splitIndex
      );


    return (
      base +
      pathPart +
      suffix
    );

  },


  /* =======================================================
     CURRENT SESSION
  ======================================================== */

  async session() {

    try {

      const result =
        await sb.auth.getSession();


      if (result.error) {

        console.error(
          'Supabase session error:',
          result.error
        );

        return null;
      }


      return (
        result.data?.session ||
        null
      );

    } catch (error) {

      console.error(
        'Session error:',
        error
      );

      return null;
    }

  },


  /* =======================================================
     CURRENT PROFILE
  ======================================================== */

  async profile() {

    try {

      const session =
        await NL.session();


      if (!session) {
        return null;
      }


      const result =
        await sb
          .from('profiles')
          .select('*')
          .eq(
            'id',
            session.user.id
          )
          .maybeSingle();


      if (result.error) {

        console.error(
          'Profile loading error:',
          result.error
        );

        return null;
      }


      return (
        result.data ||
        null
      );

    } catch (error) {

      console.error(
        'Profile error:',
        error
      );

      return null;
    }

  },


  /* =======================================================
     REQUIRE AUTHENTICATION
  ======================================================== */

  async requireAuth() {

    const profile =
      await NL.profile();


    if (!profile) {

      const returnPath =
        window.location.pathname +
        window.location.search;


      location.href =
        NL.path(
          'login.html?next=' +
          encodeURIComponent(
            returnPath
          )
        );


      return null;
    }


    return profile;

  },


  /* =======================================================
     REQUIRE SPECIFIC ROLE
  ======================================================== */

  async requireRole(role) {

    const profile =
      await NL.requireAuth();


    if (!profile) {
      return null;
    }


    if (
      profile.role !== role
    ) {

      /*
         Customer attempting admin:
         → admin/index.html

         Admin attempting customer:
         → index.html
      */

      const destination =
        role === 'admin'
          ? 'index.html'
          : 'admin/index.html';


      location.href =
        NL.path(
          destination
        );


      return null;
    }


    return profile;

  }

};