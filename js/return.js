/* =========================================================
   NOOLTHARI™ CUSTOMER RETURNS
   Damage / defect return request
========================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  /* =======================================================
     CUSTOMER AUTH
  ======================================================== */

  const profile =
    await NL.requireRole('customer');

  if (!profile) {
    return;
  }


  /* =======================================================
     ELEMENTS
  ======================================================== */

  const orderItemSelect =
    NL.qs('#order-item');

  const returnForm =
    NL.qs('#return-form');


  if (!orderItemSelect || !returnForm) {
    return;
  }


  /* =======================================================
     LOAD DELIVERED ORDERS
  ======================================================== */

  const ordersResult =
    await sb
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        order_items(
          id,
          product_id,
          product_name
        )
      `)
      .eq(
        'customer_id',
        profile.id
      )
      .eq(
        'status',
        'delivered'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );


  if (ordersResult.error) {

    console.error(
      'Return orders loading error:',
      ordersResult.error
    );


    NL.toast(
      ordersResult.error.message,
      'error'
    );

    return;
  }


  const orders =
    ordersResult.data || [];


  /* =======================================================
     POPULATE ORDER ITEMS
  ======================================================== */

  orderItemSelect.innerHTML = `
    <option value="">
      Select order item
    </option>
  `;


  orders.forEach(order => {

    (order.order_items || [])
      .forEach(item => {

        const option =
          document.createElement(
            'option'
          );


        option.value =
          item.id;


        option.textContent =
          `${order.order_number || ''} — ${
            item.product_name || 'Saree'
          }`;


        orderItemSelect.appendChild(
          option
        );

      });

  });


  /* =======================================================
     NO DELIVERED ITEMS
  ======================================================== */

  if (
    !orderItemSelect.options.length ||
    orderItemSelect.options.length === 1
  ) {

    orderItemSelect.innerHTML = `
      <option value="">
        No delivered order items available
      </option>
    `;

  }


  /* =======================================================
     SUBMIT RETURN
  ======================================================== */

  returnForm.onsubmit =
    async event => {

      event.preventDefault();


      const form =
        new FormData(
          returnForm
        );


      const itemId =
        form.get(
          'order_item'
        );


      /* ---------------------------------------------------
         Validate selected item
      ---------------------------------------------------- */

      if (!itemId) {

        NL.toast(
          'Select an order item.',
          'error'
        );

        return;
      }


      /* ---------------------------------------------------
         Find selected order + item
      ---------------------------------------------------- */

      const selectedOrder =
        orders.find(
          order =>
            (order.order_items || [])
              .some(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    itemId
                  )
              )
        );


      const selectedItem =
        selectedOrder?.order_items?.find(
          item =>
            String(
              item.id
            ) ===
            String(
              itemId
            )
        );


      if (
        !selectedOrder ||
        !selectedItem
      ) {

        NL.toast(
          'The selected order item could not be found.',
          'error'
        );

        return;
      }


      /* ---------------------------------------------------
         Return request data
      ---------------------------------------------------- */

      const returnData = {

        order_id:
          selectedOrder.id,

        customer_id:
          profile.id,

        product_id:
          selectedItem.product_id,

        order_item_id:
          selectedItem.id,

        reason:
          form.get(
            'reason'
          ),

        description:
          form.get(
            'description'
          )

      };


      /* ---------------------------------------------------
         Create return request
      ---------------------------------------------------- */

      const returnResult =
        await sb
          .from('return_requests')
          .insert(
            returnData
          )
          .select('id')
          .single();


      if (returnResult.error) {

        console.error(
          'Return request error:',
          returnResult.error
        );


        NL.toast(
          returnResult.error.message,
          'error'
        );

        return;
      }


      const returnId =
        returnResult.data.id;


      /* ===================================================
         EVIDENCE IMAGE
      ================================================== */

      const evidence =
        form.get(
          'evidence'
        );


      if (
        evidence &&
        typeof evidence === 'object' &&
        evidence.size > 0
      ) {

        try {

          const safeFileName =
            evidence.name
              .replace(
                /[^a-zA-Z0-9._-]/g,
                '_'
              );


          const path =
            `${profile.id}/${returnId}/${safeFileName}`;


          const uploadResult =
            await sb
              .storage
              .from(
                'return-evidence'
              )
              .upload(
                path,
                evidence,
                {
                  upsert:false
                }
              );


          if (uploadResult.error) {
            throw uploadResult.error;
          }


          const imageResult =
            await sb
              .from('return_images')
              .insert({
                return_id:
                  returnId,

                path
              });


          if (imageResult.error) {
            throw imageResult.error;
          }


        } catch (error) {

          console.error(
            'Return evidence upload error:',
            error
          );


          /*
             The return request itself already exists.
             Tell the customer that the request was created,
             but the evidence upload needs attention.
          */

          NL.toast(
            'Return request submitted, but the evidence image could not be uploaded.',
            'error'
          );


          return;

        }

      }


      /* ===================================================
         SUCCESS
      ================================================== */

      NL.toast(
        'Return request submitted.',
        'success'
      );


      returnForm.reset();


      /*
         Restore the placeholder after reset.
      */

      if (
        orderItemSelect.options.length
      ) {

        orderItemSelect.selectedIndex =
          0;

      }

    };

});