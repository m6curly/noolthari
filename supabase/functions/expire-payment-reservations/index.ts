import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
Deno.serve(async()=>{const s=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const r=await s.rpc('release_expired_reservations');return new Response(JSON.stringify({ok:!r.error}),{headers:{'Content-Type':'application/json'}})});
