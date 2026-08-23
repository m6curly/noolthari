/* =========================================================
   NOOLTHARI™ SUPABASE CLIENT
========================================================= */

(function () {

  /* =======================================================
     CONFIG CHECK
  ======================================================== */

  const config =
    window.NOOLTHARI_CONFIG;


  if (!config) {

    console.error(
      'NOOLTHARI_CONFIG is not available.'
    );

    return;
  }


  /* =======================================================
     SUPABASE KEY
  ======================================================== */

  const publishableKey =
    config.SUPABASE_PUBLISHABLE_KEY ||
    config.SUPABASE_ANON_KEY;


  if (
    !config.SUPABASE_URL ||
    !publishableKey
  ) {

    console.error(
      'Supabase URL or publishable key is missing.'
    );

    return;
  }


  /* =======================================================
     CREATE CLIENT
  ======================================================== */

  if (
    typeof window.supabase ===
    'undefined' ||
    typeof window.supabase.createClient !==
    'function'
  ) {

    console.error(
      'Supabase JavaScript client is not loaded.'
    );

    return;
  }


  window.sb =
    window.supabase.createClient(
      config.SUPABASE_URL,
      publishableKey,
      {
        auth: {
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true
        }
      }
    );

})();