-- NOOLTHARI clean business-data reset
-- Run ONLY after applying master.sql (fresh project) or the latest migration (existing project).
-- BACK UP first. This clears shop, sales, stock, and financial records.
-- It deliberately preserves auth.users, public.profiles (including admin and customers),
-- customer addresses, and each customer's cart container.

begin;

-- Customer shopping state and previous product favourites are cleared because
-- the related catalogue items are being removed. Customer logins are untouched.
delete from public.cart_items;
delete from public.wishlist_items;

-- Remove return records before their order/item/product parents.
delete from public.return_images;
delete from public.return_requests;
delete from public.refunds;

-- Remove notifications and guest-cart synchronisation history.
delete from public.notification_queue;
delete from public.guest_cart_imports;

-- Clear the common order register and related payment / delivery records.
delete from public.payments;
delete from public.shipments;
delete from public.order_items;
delete from public.orders;

-- Clear the financial register before deleting its referenced business records.
delete from public.business_ledger_entries;
delete from public.vendor_purchase_payments;
delete from public.purchase_items;
delete from public.purchases;
delete from public.expenses;
delete from public.stock_movements;

-- Clear the catalogue, images and vendor master data.
delete from public.product_images;
delete from public.products;
delete from public.categories;
delete from public.vendors;

-- Clear incoming contact enquiries so the new store starts with a clean inbox.
delete from public.contact_messages;

-- IMPORTANT: Do not delete from auth.users or public.profiles.
-- store_settings is intentionally retained so the current homepage banner remains.
-- Customer addresses and cart containers are retained; their cart_items are cleared.

commit;

notify pgrst, 'reload schema';
