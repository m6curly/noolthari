import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const jsonHeaders = { 'Content-Type': 'application/json' };
const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
const statusLabel = (value: unknown) => String(value ?? 'updated').replaceAll('_', ' ');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ message: 'Method not allowed.' }), { status: 405, headers: jsonHeaders });
  const suppliedSecret = req.headers.get('x-cron-secret') || req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  const expectedSecret = Deno.env.get('NOTIFICATION_CRON_SECRET') || '';
  if (!expectedSecret || suppliedSecret !== expectedSecret) return new Response(JSON.stringify({ message: 'Forbidden.' }), { status: 403, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL');
  if (!supabaseUrl || !serviceKey || !resendKey || !fromEmail) return new Response(JSON.stringify({ message: 'Notification service is not configured.' }), { status: 503, headers: jsonHeaders });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let limit = 20;
  const body = await req.json().catch(() => ({}));
  if (Number.isInteger(body?.limit)) limit = Math.min(50, Math.max(1, body.limit));
  const claimed = await admin.rpc('claim_notification_batch', { p_limit: limit });
  if (claimed.error) {
    console.error('Notification queue claim failed:', claimed.error.message);
    return new Response(JSON.stringify({ message: 'Could not claim notification queue.' }), { status: 500, headers: jsonHeaders });
  }

  let sent = 0;
  let failed = 0;
  for (const item of claimed.data || []) {
    try {
      const orderResult = await admin.from('orders').select(`
        id,order_number,total,customer_id,
        profiles(name,email),
        order_items(product_name,quantity,line_total),
        shipments(carrier,tracking_number,tracking_url,status)
      `).eq('id', item.order_id).maybeSingle();
      if (orderResult.error || !orderResult.data) throw new Error('ORDER_NOT_FOUND');
      const order = orderResult.data as any;
      const recipient = order.profiles?.email;
      if (!recipient) throw new Error('CUSTOMER_EMAIL_MISSING');

      const type = String(item.event_type || 'order_status');
      const value = String(item.event_value || 'updated');
      const orderNo = String(order.order_number || item.order_id);
      const customerName = String(order.profiles?.name || 'there');
      let subject = `NOOLTHARI™ order ${orderNo} update`;
      let message = `Your order status is now ${statusLabel(value)}.`;
      if (type === 'shipment_status') message = `Your shipment status is now ${statusLabel(value)}.`;
      if (type === 'return_status') message = `Your return request status is now ${statusLabel(value)}.`;
      if (type === 'refund_status') message = `Your refund status is now ${statusLabel(value)}.`;
      if (value === 'paid') { subject = `Order ${orderNo} confirmed | NOOLTHARI™`; message = 'We have verified your payment and confirmed your order.'; }
      const lines = (order.order_items || []).map((line: any) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${htmlEscape(line.product_name)} × ${Number(line.quantity || 0)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">₹${Number(line.line_total || 0).toFixed(2)}</td></tr>`).join('');
      const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments;
      const rawTracking = shipment?.tracking_url || '';
      const safeTracking = /^https:\/\//i.test(rawTracking) ? rawTracking : '';
      const tracking = type === 'shipment_status' && safeTracking ? `<p><a href="${htmlEscape(safeTracking)}" style="color:#164e52">View shipment tracking</a></p>` : '';
      const html = `<!doctype html><html><body style="margin:0;background:#fbf8f2;font-family:Arial,sans-serif;color:#384846"><div style="max-width:620px;margin:30px auto;padding:30px;background:#fffefa;border:1px solid #e7ddce"><p style="letter-spacing:3px;color:#a77c35;font-size:11px">NOOLTHARI™</p><h1 style="font-family:Georgia,serif;color:#10383c;font-weight:normal">A note about your order</h1><p>Dear ${htmlEscape(customerName)},</p><p>${htmlEscape(message)}</p><p><strong>Order:</strong> ${htmlEscape(orderNo)}</p><table style="width:100%;border-collapse:collapse">${lines}</table><p><strong>Order total:</strong> ₹${Number(order.total || 0).toFixed(2)}</p>${tracking}<p style="font-size:12px;color:#817c72">For assistance, please use the support details on our website.</p></div></body></html>`;
      const text = `Dear ${customerName},\n\n${message}\nOrder: ${orderNo}\nOrder total: INR ${Number(order.total || 0).toFixed(2)}\n\nNOOLTHARI™`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `noolthari-${item.id}` },
        body: JSON.stringify({ from: fromEmail, to: [recipient], subject, html, text }),
      });
      const providerResult = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`RESEND_${response.status}: ${String(providerResult?.message || 'delivery failed')}`);
      const updated = await admin.from('notification_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', item.id);
      if (updated.error) throw new Error(`QUEUE_UPDATE_FAILED: ${updated.error.message}`);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_NOTIFICATION_ERROR';
      const retryAt = new Date(Date.now() + Math.min(60, Math.max(5, Number(item.attempts || 1) * 5)) * 60_000).toISOString();
      await admin.from('notification_queue').update({ status: 'failed', last_error: message.slice(0, 500), available_at: retryAt, updated_at: new Date().toISOString() }).eq('id', item.id);
      console.error('Notification delivery failed:', item.id, message);
      failed += 1;
    }
  }
  return new Response(JSON.stringify({ processed: sent + failed, sent, failed }), { status: 200, headers: jsonHeaders });
});
