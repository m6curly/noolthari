document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     ELEMENTS
  ======================================================== */

  const list =
    document.querySelector('#message-list');

  const count =
    document.querySelector('#message-count');


  if (!list) {
    return;
  }


  /* =======================================================
     ADMIN AUTHENTICATION
  ======================================================== */

  try {

    const profile =
      await NL.requireRole('admin');


    if (!profile) {
      return;
    }


    /* =====================================================
       LOAD MESSAGES
    ====================================================== */

    await loadMessages();


  } catch (error) {

    console.error(
      'Messages page error:',
      error
    );

    renderError();

  }


  /* =======================================================
     LOAD MESSAGES
  ======================================================== */

  async function loadMessages() {

    const result =
      await sb
        .from('contact_messages')
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (result.error) {

      console.error(
        'Messages loading error:',
        result.error
      );

      throw result.error;
    }


    const messages =
      result.data || [];


    if (count) {
      count.textContent =
        String(messages.length);
    }


    /* -----------------------------------------------------
       Empty state
    ----------------------------------------------------- */

    if (!messages.length) {

      list.innerHTML = `
        <div class="message-empty">

          <div class="eyebrow">
            Inbox
          </div>

          <h2>
            No messages yet.
          </h2>

          <p>
            Customer enquiries will appear here automatically.
          </p>

        </div>
      `;

      return;
    }


    /* -----------------------------------------------------
       Render messages
    ----------------------------------------------------- */

    list.innerHTML =
      messages
        .map(
          message =>
            renderMessage(message)
        )
        .join('');


    bindActions();

  }


  /* =======================================================
     RENDER MESSAGE
  ======================================================== */

  function renderMessage(message) {

    const status =
      message.status || 'new';


    return `
      <article
        class="message-item ${
          status === 'new'
            ? 'is-new'
            : ''
        }"
      >

        <div class="message-top">

          <div>

            <div class="eyebrow">
              ${escapeHTML(
                status.toUpperCase()
              )}
            </div>


            <h2 class="message-title">

              ${escapeHTML(
                message.subject ||
                'No subject'
              )}

            </h2>


            <div class="message-meta">

              ${escapeHTML(
                message.name || ''
              )}

              ·

              <a
                class="message-email"
                href="mailto:${escapeAttribute(
                  message.email || ''
                )}"
              >
                ${escapeHTML(
                  message.email || ''
                )}
              </a>

              ·

              ${formatDate(
                message.created_at
              )}

            </div>

          </div>

        </div>


        <div class="message-body">

          ${escapeHTML(
            message.message || ''
          )}

        </div>


        <div class="message-actions">

          <select data-status>

            <option
              value="new"
              ${
                status === 'new'
                  ? 'selected'
                  : ''
              }
            >
              New
            </option>


            <option
              value="read"
              ${
                status === 'read'
                  ? 'selected'
                  : ''
              }
            >
              Read
            </option>


            <option
              value="replied"
              ${
                status === 'replied'
                  ? 'selected'
                  : ''
              }
            >
              Replied
            </option>


            <option
              value="closed"
              ${
                status === 'closed'
                  ? 'selected'
                  : ''
              }
            >
              Closed
            </option>

          </select>


          <button
            class="btn btn-gold"
            type="button"
            data-save
            data-id="${escapeAttribute(
              message.id
            )}"
          >
            Save
          </button>

        </div>


        <div style="margin-top:14px">

          <textarea
            class="message-note"
            data-note
            placeholder="Private admin note..."
          >${escapeHTML(
            message.admin_note || ''
          )}</textarea>

        </div>

      </article>
    `;
  }


  /* =======================================================
     MESSAGE ACTIONS
  ======================================================== */

  function bindActions() {

    document
      .querySelectorAll(
        '[data-save]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => updateMessage(button)
        );

      });

  }


  /* =======================================================
     UPDATE MESSAGE
  ======================================================== */

  async function updateMessage(button) {

    const id =
      button.dataset.id;


    const card =
      button.closest(
        '.message-item'
      );


    if (!id || !card) {
      return;
    }


    const statusElement =
      card.querySelector(
        '[data-status]'
      );


    const noteElement =
      card.querySelector(
        '[data-note]'
      );


    if (!statusElement) {
      return;
    }


    const status =
      statusElement.value;


    const admin_note =
      noteElement?.value
        .trim() || null;


    const originalText =
      button.textContent;


    button.disabled =
      true;

    button.textContent =
      'Saving...';


    try {

      const updateData = {
        status,
        admin_note
      };


      /* ---------------------------------------------------
         Replied timestamp
      --------------------------------------------------- */

      updateData.replied_at =
        status === 'replied'
          ? new Date().toISOString()
          : null;


      const result =
        await sb
          .from('contact_messages')
          .update(
            updateData
          )
          .eq(
            'id',
            id
          );


      if (result.error) {
        throw result.error;
      }


      button.textContent =
        'Saved';


      NL.toast(
        'Message updated.',
        'success'
      );


      setTimeout(
        () => {

          button.disabled =
            false;

          button.textContent =
            originalText;

        },
        1200
      );


    } catch (error) {

      console.error(
        'Message update error:',
        error
      );


      button.disabled =
        false;

      button.textContent =
        originalText;


      NL.toast(
        error.message ||
        'Unable to update message.',
        'error'
      );

    }

  }


  /* =======================================================
     DATE FORMAT
  ======================================================== */

  function formatDate(value) {

    if (!value) {
      return '—';
    }


    const date =
      new Date(value);


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—';
    }


    return date.toLocaleString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    );

  }


  /* =======================================================
     HTML ESCAPING
  ======================================================== */

  function escapeHTML(value) {

    return String(
      value ?? ''
    )
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&#039;'
      );

  }


  /* =======================================================
     ATTRIBUTE ESCAPING
  ======================================================== */

  function escapeAttribute(value) {

    return escapeHTML(
      value
    );

  }


  /* =======================================================
     ERROR STATE
  ======================================================== */

  function renderError() {

    list.innerHTML = `
      <div class="message-empty">

        <div class="eyebrow">
          Error
        </div>

        <h2>
          Messages could not be loaded.
        </h2>

        <p>
          Please refresh the page and try again.
        </p>

      </div>
    `;

  }

});