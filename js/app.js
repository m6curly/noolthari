document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     GLOBAL YEAR
  ======================================================== */

  NL.qsa('[data-year]').forEach(element => {
    element.textContent = new Date().getFullYear();
  });


  /* =======================================================
     CURRENT PROFILE
  ======================================================== */

  const profile = await NL.profile();


  /* =======================================================
     ADMIN TABLE EXPORT
  ======================================================== */

  if (profile?.role === 'admin' && document.querySelector('.admin-main')) {
    const table = document.querySelector('.admin-main table');
    const wrap = table?.closest('.table-wrap');

    if (table && wrap && !document.querySelector('[data-admin-export]')) {
      const exportRow = document.createElement('div');
      exportRow.className = 'export-row';

      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'btn btn-outline';
      exportButton.dataset.adminExport = 'true';
      exportButton.textContent = 'Export CSV';

      exportButton.addEventListener('click', () => {
        const quote = value => {
          let text = String(value ?? '').replace(/\s+/g, ' ').trim();

          if (/^[=+\-@\t\r]/.test(text)) {
            text = `'${text}`;
          }

          return `"${text.replaceAll('"', '""')}"`;
        };

        const headers = Array.from(table.querySelectorAll('thead th'))
          .filter(th => (th.innerText || th.textContent || '').trim())
          .map(th => quote(th.innerText || th.textContent));

        const headerCells = Array.from(table.querySelectorAll('thead th'))
          .filter(th => (th.innerText || th.textContent || '').trim());

        const lines = [headers.join(',')];

        table.querySelectorAll('tbody tr').forEach(row => {
          const cells = Array.from(row.children);

          const values = headerCells.map(th => {
            const index = Array.from(th.parentElement.children).indexOf(th);
            const cell = cells[index];

            if (!cell) return '';

            const select = cell.querySelector('select');

            if (select) {
              return quote(select.selectedOptions[0]?.textContent || '');
            }

            const clone = cell.cloneNode(true);

            clone.querySelectorAll('button,svg,[aria-hidden="true"]')
              .forEach(node => node.remove());

            return quote(clone.innerText || clone.textContent || '');
          });

          if (values.some(value => value !== '""')) {
            lines.push(values.join(','));
          }
        });

        const blob = new Blob(
          ['\ufeff' + lines.join('\r\n')],
          { type: 'text/csv;charset=utf-8' }
        );

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        const page = (location.pathname.split('/').pop() || 'admin')
          .replace(/\.html$/i, '')
          .replace(/[^a-z0-9_-]/gi, '-');

        anchor.href = url;
        anchor.download = `noolthari-${page}-${new Date().toISOString().slice(0, 10)}.csv`;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        URL.revokeObjectURL(url);
      });

      exportRow.appendChild(exportButton);
      wrap.parentElement.insertBefore(exportRow, wrap);
    }
  }


  /* =======================================================
     STOREFRONT NAVIGATION
  ======================================================== */

  const nav = NL.qs('[data-site-nav]');
  const menu = NL.qs('[data-menu-toggle]');


  /* =======================================================
     ADMIN LINK INSIDE MOBILE HAMBURGER MENU
  ======================================================== */

  if (nav && profile?.role === 'admin') {

    let mobileAdminLink = nav.querySelector('[data-mobile-admin-link]');

    if (!mobileAdminLink) {

      mobileAdminLink = document.createElement('a');

      mobileAdminLink.href = NL.path('admin/index.html');
      mobileAdminLink.textContent = 'Admin Dashboard';
      mobileAdminLink.className = 'mobile-admin-nav-link';
      mobileAdminLink.dataset.mobileAdminLink = 'true';

      mobileAdminLink.setAttribute(
        'aria-label',
        'Open NOOLTHARI Admin Dashboard'
      );

      nav.appendChild(mobileAdminLink);
    }

    const mobileNavQuery = window.matchMedia('(max-width: 1000px)');

    const syncMobileAdminLink = () => {
      mobileAdminLink.style.display =
        mobileNavQuery.matches ? '' : 'none';
    };

    syncMobileAdminLink();

    if (typeof mobileNavQuery.addEventListener === 'function') {
      mobileNavQuery.addEventListener('change', syncMobileAdminLink);
    } else if (typeof mobileNavQuery.addListener === 'function') {
      mobileNavQuery.addListener(syncMobileAdminLink);
    }
  }


  /* =======================================================
     STOREFRONT MENU BUTTON
  ======================================================== */

  if (menu && nav) {

    menu.onclick = () => {

      const isOpen = nav.classList.toggle('open');

      menu.setAttribute('aria-expanded', String(isOpen));

      menu.setAttribute(
        'aria-label',
        isOpen ? 'Close navigation menu' : 'Open navigation menu'
      );
    };
  }


  /* =======================================================
     ADMIN MOBILE NAVIGATION
  ======================================================== */

  const adminMenu = NL.qs('[data-admin-menu]');

  if (adminMenu) {

    adminMenu.onclick = () => {

      const adminNav = NL.qs('.admin-nav');

      if (!adminNav) return;

      adminNav.classList.toggle('open');

      adminMenu.setAttribute(
        'aria-expanded',
        String(adminNav.classList.contains('open'))
      );
    };
  }


  /* =======================================================
     STOREFRONT ACCOUNT CONTROLS
  ======================================================== */

  NL.qsa('[data-auth-slot]').forEach(slot => {

    if (!profile) {

      slot.innerHTML = `
        <a class="header-auth-link"
           href="${NL.path('login.html')}">
          Sign in
        </a>

        <a class="btn btn-gold header-signup"
           href="${NL.path('login.html?mode=signup')}">
          Sign up
        </a>
      `;

      return;
    }


    slot.innerHTML = `
      ${
        profile.role === 'admin'
          ? `
            <a class="header-admin-link"
               href="${NL.path('admin/index.html')}">
              Admin
            </a>
          `
          : ''
      }

      <button
        class="header-logout"
        type="button"
        data-header-logout>
        Sign out
      </button>
    `;


    const logoutButton = slot.querySelector('[data-header-logout]');

    if (logoutButton) {

      logoutButton.addEventListener('click', async () => {

        logoutButton.disabled = true;

        const result = await sb.auth.signOut();

        if (result.error) {

          console.error('Header logout error:', result.error);

          NL.toast(
            result.error.message || 'Unable to sign out.',
            'error'
          );

          logoutButton.disabled = false;
          return;
        }

        location.href = NL.path('index.html');
      });
    }
  });


  /* =======================================================
     ADMIN / LEGACY LOGOUT
  ======================================================== */

  NL.qsa('[data-logout]').forEach(button => {

    button.onclick = async event => {

      event.preventDefault();

      button.disabled = true;

      const result = await sb.auth.signOut();

      if (result.error) {

        console.error('Admin logout error:', result.error);

        NL.toast(
          result.error.message || 'Unable to sign out.',
          'error'
        );

        button.disabled = false;
        return;
      }

      location.href = NL.path('index.html');
    };
  });


  /* =======================================================
     USER NAME
  ======================================================== */

  NL.qsa('[data-user-name]').forEach(element => {

    element.textContent =
      profile?.name ||
      profile?.email?.split('@')[0] ||
      'Account';
  });


  /* =======================================================
     ADMIN LINK
  ======================================================== */

  NL.qsa('[data-admin-link]').forEach(link => {

    const isAdmin = profile?.role === 'admin';

    link.hidden = !isAdmin;

    if (isAdmin) {
      link.href = NL.path('admin/index.html');
    }
  });


  /* =======================================================
     CONTACT FORM
  ======================================================== */

  const contactForm = NL.qs('#contact-form');

  if (contactForm && typeof sb !== 'undefined') {

    contactForm.addEventListener('submit', async event => {

      event.preventDefault();

      const button = contactForm.querySelector('button[type="submit"]');
      const formData = new FormData(contactForm);

      if (String(formData.get('website') || '').trim()) {
        contactForm.reset();
        return;
      }

      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const subject = String(formData.get('subject') || '').trim();
      const message = String(formData.get('message') || '').trim();


      if (
        name.length < 2 || name.length > 100 ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        subject.length < 3 || subject.length > 160 ||
        message.length < 5 || message.length > 5000
      ) {

        NL.toast(
          'Check the name, email, subject and message lengths, then try again.',
          'error'
        );

        return;
      }

      const originalText = button?.textContent || 'Send message';

      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }

      try {

        const result = await sb
          .from('contact_messages')
          .insert({
            name,
            email,
            subject,
            message
          });

        if (result.error) {
          throw result.error;
        }

        contactForm.reset();

        NL.toast(
          'Message sent successfully.',
          'success'
        );

      } catch (error) {

        console.error('Contact form error:', error);

        NL.toast(
          String(error.message || '').includes('CONTACT_RATE_LIMITED')
            ? 'Please wait a little before sending another enquiry.'
            : 'Unable to send your message. Please try again later.',
          'error'
        );

      } finally {

        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  }

});