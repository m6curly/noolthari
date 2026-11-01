import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const jsonHeaders = { 'Content-Type': 'application/json' };

function corsHeaders(req: Request): HeadersInit | null {
  const origin = req.headers.get('origin');
  if (!origin) return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  // Fail closed: configure exact storefront HTTPS origins in Edge secrets.
  if (!allowed.length || !allowed.includes(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function response(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...cors },
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (!cors) return response({ message: 'Origin not allowed.' }, 403, {});
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return response({ message: 'Method not allowed.' }, 405, cors);

  let userClient: ReturnType<typeof createClient> | null = null;
  let pendingOrderId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpaySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !razorpayKeyId || !razorpaySecret || !serviceKey) {
      throw new Error('PAYMENT_SERVICE_NOT_CONFIGURED');
    }

    const authorization = req.headers.get('Authorization') || '';
    userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return response({ message: 'Please sign in again.' }, 401, cors);

    let body: { address_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return response({ message: 'Invalid payment request.' }, 400, cors);
    }
    if (typeof body.address_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.address_id)) {
      return response({ message: 'Choose a valid delivery address.' }, 400, cors);
    }

    const orderResult = await userClient.rpc('create_payment_order', {
      p_address_id: body.address_id,
    });
    if (orderResult.error) throw new Error(orderResult.error.message);

    const order = orderResult.data as { order_id?: string; order_number?: string; amount?: number } | null;
    if (!order?.order_id || !Number.isSafeInteger(Number(order.amount)) || Number(order.amount) <= 0) {
      throw new Error('INVALID_ORDER_AMOUNT');
    }
    pendingOrderId = order.order_id;

    const gatewayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}`,
      },
      body: JSON.stringify({
        amount: Number(order.amount),
        currency: 'INR',
        receipt: order.order_number,
        notes: { order_id: order.order_id },
      }),
    });

    const gatewayOrder = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok || typeof gatewayOrder.id !== 'string') {
      throw new Error('RAZORPAY_ORDER_CREATION_FAILED');
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const paymentUpdate = await serviceClient
      .from('payments')
      .update({ razorpay_order_id: gatewayOrder.id })
      .eq('order_id', order.order_id)
      .eq('gateway', 'razorpay')
      .select('id')
      .maybeSingle();

    if (paymentUpdate.error || !paymentUpdate.data) {
      throw new Error('PAYMENT_RECORD_UPDATE_FAILED');
    }

    pendingOrderId = null;
    return response({
      order_id: order.order_id,
      razorpay_order_id: gatewayOrder.id,
      amount: Number(order.amount),
      currency: 'INR',
    }, 200, cors);
  } catch (error) {
    // The cart is intentionally still populated. Release only this user's
    // reservation when Razorpay order creation or DB linking fails.
    if (pendingOrderId && userClient) {
      const cleanup = await userClient.rpc('cancel_own_pending_order', {
        p_order_id: pendingOrderId,
      });
      if (cleanup.error) console.error('Pending order cleanup failed:', cleanup.error.message);
    }

    console.error('Create Razorpay order failed:', error);
    const userMessages: Record<string, string> = {
      AUTH_REQUIRED: 'Please sign in again before paying.',
      CART_EMPTY: 'Your bag is empty.',
      CART_EMPTY_OR_INVALID: 'Your bag has no valid items. Refresh it and try again.',
      ADDRESS_NOT_FOUND: 'Choose one of your saved delivery addresses.',
      PENDING_PAYMENT_EXISTS: 'A payment is already pending for this bag. Reload checkout to continue the same secure payment.',
      CAPTURED_PAYMENT_REQUIRES_REVIEW: 'A previous payment was captured but its order needs review. Do not pay again; contact support with the previous order number.',
      PRODUCT_UNAVAILABLE: 'One of the items in your bag is no longer available.',
      OUT_OF_STOCK: 'An item in your bag no longer has enough stock. Refresh your bag.',
      INVALID_PRODUCT_PRICE: 'An item has an invalid price and cannot be checked out. Contact support.',
      INVALID_ORDER_AMOUNT: 'The order total could not be verified. Refresh your bag and try again.',
      RAZORPAY_ORDER_CREATION_FAILED: 'The payment provider could not prepare checkout. Your bag has been kept safe; try again.',
      PAYMENT_RECORD_UPDATE_FAILED: 'The payment could not be linked safely. Your bag has been kept and support may need to review the attempt.',
    };
    const rawMessage = error instanceof Error ? error.message : '';
    const match = Object.entries(userMessages).find(([code]) => rawMessage.includes(code));
    const message = match?.[1] ||
      'Could not prepare the payment. Your bag has been kept safe; please try again.';
    return response({ message }, 400, cors);
  }
});
