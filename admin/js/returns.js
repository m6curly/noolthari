/* =========================================================
   NOOLTHARI™ ADMIN RETURNS
   Return request management + private evidence viewing
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    /* =====================================================
       ADMIN AUTH
    ====================================================== */

    const profile =
      await NL.requireRole(
        'admin'
      );


    if (!profile) {
      return;
    }


    /* =====================================================
       ELEMENTS
    ====================================================== */

    const table =
      NL.qs(
        '#returns-table'
      );


    if (!table) {
      return;
    }


    /* =====================================================
       RETURN STATUSES
    ====================================================== */

    const statuses = [
      'submitted',
      'approved',
      'rejected',
      'refund_processing',
      'refunded'
    ];


    /* =====================================================
       LOAD EVIDENCE FOR ONE RETURN
    ====================================================== */

    async function getReturnEvidence(
      returnId
    ) {

      if (!returnId) {
        return [];
      }


      const result =
        await sb
          .from(
            'return_images'
          )
          .select(
            'id,path'
          )
          .eq(
            'return_id',
            returnId
          );


      if (result.error) {

        console.error(
          'Return evidence loading error:',
          result.error
        );


        return [];

      }


      return (
        result.data ||
        []
      );

    }


    /* =====================================================
       CREATE SECURE EVIDENCE LINK
    ====================================================== */

    async function getEvidenceUrl(
      path
    ) {

      if (!path) {
        return null;
      }


      const result =
        await sb
          .storage
          .from(
            'return-evidence'
          )
          .createSignedUrl(
            path,
            60 * 60
          );


      if (result.error) {

        console.error(
          'Return evidence signed URL error:',
          result.error
        );


        return null;

      }


      return (
        result.data?.signedUrl ||
        null
      );

    }


    /* =====================================================
       FILE TYPE
    ====================================================== */

    function isImageFile(
      path
    ) {

      return /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i
        .test(
          String(
            path ||
            ''
          )
        );

    }


    /* =====================================================
       FILE NAME
    ====================================================== */

    function getFileName(
      path
    ) {

      const value =
        String(
          path ||
          ''
        );


      const parts =
        value.split(
          '/'
        );


      return (
        parts[
          parts.length - 1
        ] ||
        'Evidence'
      );

    }


    /* =====================================================
       EVIDENCE HTML
    ====================================================== */

    function evidenceHtml(
      evidenceList
    ) {

      if (
        !evidenceList?.length
      ) {

        return `
          <span class="return-evidence-empty">
            No evidence
          </span>
        `;

      }


      return `
        <div class="return-evidence">

          ${
            evidenceList
              .map(
                evidence => {

                  const fileName =
                    NL.esc(
                      getFileName(
                        evidence.path
                      )
                    );


                  const url =
                    evidence.url;


                  if (!url) {

                    return `
                      <span
                        class="return-evidence-empty"
                      >
                        Unable to open
                      </span>
                    `;

                  }


                  if (
                    evidence.isImage
                  ) {

                    return `
                      <a
                        href="${NL.esc(
                          url
                        )}"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="${fileName}"
                      >

                        <img
                          class="return-evidence-preview"
                          src="${NL.esc(
                            url
                          )}"
                          alt="Return evidence"
                          loading="lazy"
                        >

                      </a>
                    `;

                  }


                  return `
                    <a
                      href="${NL.esc(
                        url
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View evidence
                    </a>
                  `;

                }
              )
              .join('')

          }

        </div>
      `;

    }


    /* =====================================================
       LOAD RETURNS
    ====================================================== */

    async function load() {

      table.innerHTML = `
        <tr>
          <td colspan="6">
            Loading return requests...
          </td>
        </tr>
      `;


      const result =
        await sb
          .from(
            'return_requests'
          )
          .select(`
            id,
            created_at,
            reason,
            status,
            description,
            order_number:orders(order_number),
            profiles(name,email)
          `)
          .order(
            'created_at',
            {
              ascending:false
            }
          );


      if (result.error) {

        console.error(
          'Returns loading error:',
          result.error
        );


        table.innerHTML = `
          <tr>
            <td colspan="6">
              ${NL.esc(
                result.error.message
              )}
            </td>
          </tr>
        `;


        NL.toast(
          result.error.message,
          'error'
        );


        return;

      }


      const returns =
        result.data || [];


      /* ===================================================
         EMPTY STATE
      ================================================== */

      if (!returns.length) {

        table.innerHTML = `
          <tr>
            <td colspan="6">
              No return requests yet.
            </td>
          </tr>
        `;

        return;

      }


      /* ===================================================
         LOAD EVIDENCE
      ================================================== */

      const returnsWithEvidence =
        await Promise.all(
          returns.map(
            async returnRequest => {

              const evidenceRows =
                await getReturnEvidence(
                  returnRequest.id
                );


              const evidenceList =
                await Promise.all(
                  evidenceRows.map(
                    async evidence => {

                      const url =
                        await getEvidenceUrl(
                          evidence.path
                        );


                      return {
                        ...evidence,

                        url,

                        isImage:
                          isImageFile(
                            evidence.path
                          )
                      };

                    }
                  )
                );


              return {
                ...returnRequest,

                evidenceList
              };

            }
          )
        );


      /* ===================================================
         RENDER RETURNS
      ================================================== */

      table.innerHTML =
        returnsWithEvidence
          .map(
            returnRequest => {

              const orderNumber =
                returnRequest
                  .order_number
                  ?.order_number ||
                '';


              const customer =
                returnRequest
                  .profiles
                  ?.name ||
                returnRequest
                  .profiles
                  ?.email ||
                '';


              const currentStatus =
                returnRequest.status ||
                'submitted';


              const evidenceMarkup =
                evidenceHtml(
                  returnRequest.evidenceList
                );


              return `
                <tr>

                  <td>
                    ${NL.esc(
                      orderNumber
                    )}
                  </td>


                  <td>
                    ${NL.esc(
                      customer
                    )}
                  </td>


                  <td>
                    ${NL.esc(
                      returnRequest.reason ||
                      ''
                    )}
                  </td>


                  <td>

                    <select
                      class="return-status"
                      data-id="${NL.esc(
                        returnRequest.id
                      )}"
                      aria-label="Return status"
                    >

                      ${
                        statuses
                          .map(
                            status => `
                              <option
                                value="${status}"
                                ${
                                  status ===
                                  currentStatus
                                    ? 'selected'
                                    : ''
                                }
                              >
                                ${status.replaceAll(
                                  '_',
                                  ' '
                                )}
                              </option>
                            `
                          )
                          .join('')
                      }

                    </select>

                  </td>


                  <td class="return-description">
                    ${NL.esc(
                      returnRequest.description ||
                      ''
                    )}
                  </td>


                  <td class="return-evidence-cell">
                    ${evidenceMarkup}
                  </td>

                </tr>
              `;

            }
          )
          .join('');


      /* ===================================================
         STATUS UPDATE
      ================================================== */

      NL.qsa(
        '.return-status',
        table
      ).forEach(
        select => {

          select.onchange =
            async () => {

              const returnId =
                select.dataset.id;


              const status =
                select.value;


              if (!returnId) {
                return;
              }


              const previousStatus =
                select.dataset.previousStatus ||
                '';


              select.dataset.previousStatus =
                previousStatus ||
                status;


              select.disabled =
                true;


              const result =
                await sb
                  .from(
                    'return_requests'
                  )
                  .update({
                    status
                  })
                  .eq(
                    'id',
                    returnId
                  );


              if (result.error) {

                console.error(
                  'Return status update error:',
                  result.error
                );


                NL.toast(
                  result.error.message,
                  'error'
                );


                select.disabled =
                  false;


                return;

              }


              NL.toast(
                'Return status updated.',
                'success'
              );


              select.disabled =
                false;

            };

        }
      );

    }


    /* =====================================================
       INITIAL LOAD
    ====================================================== */

    await load();

  }
);