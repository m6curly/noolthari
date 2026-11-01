import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reply(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply('Method not allowed', 405);

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!webhookSecret || !razorpayKeyId || !razorpayKeySecret || !supabaseUrl || !serviceKey) {
      console.error('Webhook environment is incomplete.');
      return reply('Webhook is not configured', 500);
    }

    const rawBody = await req.text();
    const suppliedSignature = req.headers.get('x-razorpay-signature') || '';
    const expectedSignature = await hmacHex(webhookSecret, rawBody);
    if (!/^[a-f0-9]{64}$/i.test(suppliedSignature) ||
        !timingSafeEqual(expectedSignature.toLowerCase(), suppliedSignature.toLowerCase())) {
      return reply('Invalid signature', 401);
    }

    const body = JSON.parse(rawBody);
    const event = body.event as string;
    if (event !== 'payment.captured' && event !== 'payment.failed' && event !== 'order.paid') {
      return reply('Ignored', 200);
    }

    let gatewayPayment = body.payload?.payment?.entity || null;
    const orderId = gatewayPayment?.order_id || body.payload?.order?.entity?.id || null;
    if (!orderId || typeof orderId !== 'string') return reply('No matching order', 200);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const paymentResult = await admin
      .from('payments')
      .select('id, order_id, amount, status')
      .eq('razorpay_order_id', orderId)
      .eq('gateway', 'razorpay')
      .maybeSingle();
    if (paymentResult.error) throw paymentResult.error;
    if (!paymentResult.data) return reply('Unmatched gateway order', 200);

    if (event === 'payment.failed') {
      if (paymentResult.data.status !== 'captured') {
        const failed = await admin.from('payments').update({
          status: 'failed',
          razorpay_payment_id: gatewayPayment?.id || null,
          payment_method: gatewayPayment?.method || null,
          updated_at: new Date().toISOString(),
        }).eq('id', paymentResult.data.id).neq('status', 'captured');
        if (failed.error) throw failed.error;
      }
      // Do not release the reservation here: Razorpay can report a failed
      // attempt and then allow another attempt against the same order.
      return reply('ok', 200);
    }

    // order.paid may contain only the order entity. Look up the captured
    // payment rather than assuming a payment object is present in the event.
    if (!gatewayPayment && event === 'order.paid') {
      const basicAuth = `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`;
      const gatewayPaymentsResponse = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`,
        { headers: { Authorization: basicAuth } },
      );
      const gatewayPayments = await gatewayPaymentsResponse.json().catch(() => ({}));
      if (!gatewayPaymentsResponse.ok) throw new Error('Unable to read order payments from Razorpay');
      gatewayPayment = (gatewayPayments.items || []).find((item: Record<string, unknown>) => item.status === 'captured') || null;
    }

    if (!gatewayPayment || gatewayPayment.status !== 'captured') {
      return reply('No captured payment found', 200);
    }

    const expectedAmount = Math.round(Number(paymentResult.data.amount) * 100);
    if (
      gatewayPayment.order_id !== orderId ||
      Number(gatewayPayment.amount) !== expectedAmount ||
      gatewayPayment.currency !== 'INR' ||
      typeof gatewayPayment.id !== 'string'
    ) {
      console.error('Webhook payment/order/amount mismatch', { orderId });
      return reply('Payment details mismatch', 400);
    }

    const paymentMethod = typeof gatewayPayment.method === 'string' ? gatewayPayment.method : 'razorpay';
    const capturedUpdate = await admin
      .from('payments')
      .update({
        razorpay_payment_id: gatewayPayment.id,
        razorpay_signature: 'webhook_verified',
        payment_method: paymentMethod,
        status: 'captured',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentResult.data.id)
      .neq('status', 'captured')
      .select('id')
      .maybeSingle();
    if (capturedUpdate.error) throw capturedUpdate.error;

    const currentPayment = await admin
      .from('payments')
      .select('razorpay_payment_id, status')
      .eq('id', paymentResult.data.id)
      .single();
    if (currentPayment.error || currentPayment.data.razorpay_payment_id !== gatewayPayment.id || currentPayment.data.status !== 'captured') {
      return reply('Captured payment conflicts with the stored payment; manual review required', 409);
    }

    const finalized = await admin.rpc('finalize_paid_order', {
      p_order_id: paymentResult.data.order_id,
      p_razorpay_order_id: orderId,
      p_payment_id: gatewayPayment.id,
      p_signature: 'webhook_verified',
      p_payment_method: paymentMethod,
    });
    if (finalized.error) {
      // Ask Razorpay to retry transient failures. If the reservation expired,
      // the captured payment needs manual review/refund rather than stock debit.
      console.error('Webhook order finalization failed:', finalized.error.message);
      if (finalized.error.message.includes('ORDER_RESERVATION_EXPIRED') || finalized.error.message.includes('STOCK_RESERVATION_LOST')) {
        return reply('Captured payment requires manual order review', 200);
      }
      return reply('Order finalization failed', 500);
    }

    return reply('ok', 200);
  } catch (error) {
    console.error('Razorpay webhook processing error:', error);
    return reply('Webhook processing failed', 500);
  }
});
