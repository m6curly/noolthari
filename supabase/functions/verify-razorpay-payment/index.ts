import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function corsHeaders(req: Request): HeadersInit | null {
  const origin = req.headers.get('origin');
  if (!origin) return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim()).filter(Boolean);
  // Fail closed: browser requests are accepted only from configured exact origins.
  if (!allowed.length || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (!cors) return json({ message: 'Origin not allowed.' }, 403, {});
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, cors);

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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ message: 'Please sign in again.' }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (
      typeof razorpay_order_id !== 'string' ||
      typeof razorpay_payment_id !== 'string' ||
      typeof razorpay_signature !== 'string' ||
      !/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) ||
      !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) ||
      !/^[a-f0-9]{64}$/i.test(razorpay_signature)
    ) {
      return json({ message: 'Payment response is incomplete.' }, 400, cors);
    }

    const expected = await hmacHex(razorpaySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqual(expected.toLowerCase(), razorpay_signature.toLowerCase())) {
      return json({ message: 'Payment signature could not be verified.' }, 401, cors);
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const paymentResult = await serviceClient
      .from('payments')
      .select('order_id, amount, razorpay_order_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('gateway', 'razorpay')
      .maybeSingle();
    if (paymentResult.error || !paymentResult.data) throw new Error('PAYMENT_ORDER_NOT_FOUND');

    const paymentRecord = paymentResult.data;
    const ownerResult = await serviceClient
      .from('orders')
      .select('customer_id, status, reservation_expires_at')
      .eq('id', paymentRecord.order_id)
      .maybeSingle();
    if (ownerResult.error || !ownerResult.data) throw new Error('ORDER_NOT_FOUND');
    if (ownerResult.data.customer_id !== authData.user.id) {
      return json({ message: 'You are not allowed to verify this payment.' }, 403, cors);
    }

    const basicAuth = `Basic ${btoa(`${razorpayKeyId}:${razorpaySecret}`)}`;
    const paymentUrl = `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`;
    const gatewayResponse = await fetch(paymentUrl, {
      headers: { Authorization: basicAuth },
    });
    let gatewayPayment = await gatewayResponse.json().catch(() => ({}));
    if (!gatewayResponse.ok) throw new Error('RAZORPAY_PAYMENT_LOOKUP_FAILED');

    const expectedAmount = Math.round(Number(paymentRecord.amount) * 100);
    if (
      gatewayPayment.order_id !== razorpay_order_id ||
      Number(gatewayPayment.amount) !== expectedAmount ||
      gatewayPayment.currency !== 'INR'
    ) {
      throw new Error('PAYMENT_AMOUNT_OR_ORDER_MISMATCH');
    }

    // Capture authorized payments server-side before making an order paid.
    if (gatewayPayment.status === 'authorized') {
      const captureResponse = await fetch(`${paymentUrl}/capture`, {
        method: 'POST',
        headers: {
          Authorization: basicAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: expectedAmount, currency: 'INR' }),
      });
      gatewayPayment = await captureResponse.json().catch(() => ({}));
      if (!captureResponse.ok) throw new Error('RAZORPAY_CAPTURE_FAILED');
    }

    if (gatewayPayment.status !== 'captured') {
      throw new Error('PAYMENT_NOT_CAPTURED');
    }

    const paymentMethod = typeof gatewayPayment.method === 'string' ? gatewayPayment.method : 'razorpay';
    const capturedUpdate = await serviceClient
      .from('payments')
      .update({
        razorpay_payment_id,
        razorpay_signature,
        payment_method: paymentMethod,
        status: 'captured',
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('gateway', 'razorpay')
      .neq('status', 'captured')
      .select('id')
      .maybeSingle();
    if (capturedUpdate.error) throw new Error('PAYMENT_RECORD_UPDATE_FAILED');

    const currentPayment = await serviceClient
      .from('payments')
      .select('razorpay_payment_id, status')
      .eq('order_id', paymentRecord.order_id)
      .eq('gateway', 'razorpay')
      .maybeSingle();
    if (currentPayment.error || currentPayment.data?.razorpay_payment_id !== razorpay_payment_id || currentPayment.data?.status !== 'captured') {
      throw new Error('PAYMENT_ID_MISMATCH');
    }

    const finalized = await serviceClient.rpc('finalize_paid_order', {
      p_order_id: paymentRecord.order_id,
      p_razorpay_order_id: razorpay_order_id,
      p_payment_id: razorpay_payment_id,
      p_signature: razorpay_signature,
      p_payment_method: paymentMethod,
    });
    if (finalized.error) throw new Error(finalized.error.message);

    return json(finalized.data, 200, cors);
  } catch (error) {
    console.error('Verify Razorpay payment failed:', error);
    const rawMessage = error instanceof Error ? error.message : '';
    const known = [
      'PAYMENT_ORDER_NOT_FOUND', 'ORDER_NOT_FOUND', 'PAYMENT_AMOUNT_OR_ORDER_MISMATCH', 'PAYMENT_RECORD_UPDATE_FAILED', 'PAYMENT_ID_MISMATCH',
      'RAZORPAY_PAYMENT_LOOKUP_FAILED', 'RAZORPAY_CAPTURE_FAILED', 'PAYMENT_NOT_CAPTURED',
      'ORDER_RESERVATION_EXPIRED', 'STOCK_RESERVATION_LOST', 'ORDER_ALREADY_FINALIZED',
    ];
    const message = known.find((value) => rawMessage.includes(value)) ||
      'Payment is not confirmed yet. Please retry verification; do not pay again.';
    return json({ message }, 400, cors);
  }
});
