# NOOLTHARI™ — daily product, sales and finance workflow

This is the practical way the new admin system connects every saree to its vendor, stock, order/customer and business ledger.

## 1. Add a new saree

Go to **Admin → Products → Add product**. Add the photos, product name, category, SKU, vendor, optional Instagram Reel link, product description, fabric/colour/pattern/occasion, unit purchase cost, customer selling price and opening stock quantity. Create a category or vendor in the same form if it does not exist. There is one Add product entry point.

When recording opening stock, enter how much you actually paid the vendor now. Leaving the paid amount blank records the full amount as paid; enter `0` or a smaller amount if the vendor is still owed money. Select the actual cash/bank/UPI account used. The database creates a purchase record, purchase item, stock movement and financial entry together.

The purchase cost and reserved stock remain admin-only. Customers see only the selling price and public product information. Photos are resized/processed in the browser and a subtle `NOOLTHARI™` watermark is added before upload; inspect the preview before saving.

For future stock purchases, open **Finance → Receive stock**. Do not overwrite stock or purchase cost manually in Edit product. The receive-stock operation records the purchase and recalculates a weighted-average unit cost for the remaining stock valuation and future order cost snapshots.

## 2. Online order

The customer checks out through Razorpay. The server creates the Razorpay order, the signature/webhook verifies it, then the database marks the order paid and reduces physical stock. A failed payment is not a sale. The reservation is released only when safe; an authorised or captured payment is protected from cleanup. Customers can remove only their own cancelled orders with no authorised/captured payment. Admin can remove the same type of failed/cancelled order.

Never delete or manually rewrite an order with a captured payment. Reconcile it against Razorpay first. The payment provider's capture/refund state must be the real provider state.

## 3. Manual/offline/Instagram/WhatsApp sale

Go to **Admin → Orders → Record a manual sale**. Enter the buyer name, phone/email if available, product, quantity, actual selling price, sale date, channel and payment method. You can link a registered customer account, but it is optional; walk-in buyers and buyers without a website login are stored as customer snapshots.

The database creates the same order number/order record/order item/shipment record used by the online store, deducts stock and adds the sale to Finance. Choose `Offline`, `Instagram` or `WhatsApp` for normal paid sales. Select `Gift` or `Instagram collaboration` and ₹0 price for a free saree; that records zero revenue but still records stock leaving the business and the saree's cost in COGS.

For a customer who has not paid yet, untick **Payment received** and choose credit. It appears as an unpaid manual order and is shown separately as **Customer due** in Finance. When money actually arrives, use the **Mark paid** control in Admin Orders and choose the real method. Do not mark it paid before receiving money.

## 4. Customers — website users and offline buyers

The Admin Customers page combines registered customer accounts with buyers created by manual orders. A walk-in or Instagram customer does not need a password or website account. Buyers are grouped by email/phone when available; orders without contact details remain separate so different people are not accidentally merged. The directory shows order count, paid order value and latest activity.

## 5. Finance — one source of truth

The Finance page has one business ledger and these entries:

- **Owner investment:** money you put into the business. Record starting capital as the opening investment; capital is not sales revenue or profit.
- **Stock purchase:** saree inventory bought from vendors. Enter total cost and actual paid amount. Paid cash/bank/UPI reduces that balance; unpaid portion appears as vendor due. Later payments are recorded in Pay vendor balance.
- **Business expense:** trademark, registration, domain, packaging, shipping/Speed Post, ads, collaboration costs and other operating costs. Choose the account the money actually left from.
- **Sales receipt:** recorded automatically when an online order is verified or a manual order is marked paid.
- **Razorpay settlement:** use the actual Razorpay gross settlement amount, exact bank credit and fee. Bank credit + fee must equal gross and settlement cannot exceed recorded unsettled Razorpay funds.
- **Refund:** reflected when the refund record is marked refunded. The website does not send a refund just because Finance shows one; complete/verify the real refund with Razorpay first.

### Understand the numbers

- **Revenue:** paid sale value in the selected date range.
- **COGS:** weighted-average cost of the sarees sold or gifted in the selected range.
- **Gross profit:** revenue minus COGS.
- **Expenses:** business expenses entered in Finance.
- **Net profit estimate:** gross profit minus expenses, refunds and gateway fees.
- **Cash / bank / UPI / other:** balances from ledger entries recorded in those accounts.
- **Razorpay unsettled:** captured payments received by Razorpay but not yet reconciled as transferred to your bank.
- **Business funds:** recorded operating balances plus Razorpay unsettled funds. Inventory is shown separately.
- **Inventory value:** current stock quantity multiplied by current weighted-average purchase cost.
- **Vendor due:** unpaid amount from stock purchases.
- **Customer due:** unpaid manual-sale amounts not yet collected.

Stock purchase is an asset/inventory movement, not an immediate P&L loss. Its cost becomes COGS when the saree leaves stock through a sale or gift. A free gift has no revenue but has COGS. Owner investment is capital, not revenue. These are management-accounting estimates, not audited statements or tax filings; ask an accountant about tax, GST and capitalization of trademark/registration costs.

## 6. Start with a clean ledger

After taking the backup, applying the new migration and running the reset script, record the opening capital and only then begin entering new expenses, stock purchases and sales. Use the real transaction dates and the correct payment account so balances can reconcile to bank/cash records.

The Finance page calculates only from transactions you enter. It does not connect to your bank, read WhatsApp/Instagram sales automatically or fetch Razorpay payouts automatically. You manually record external sales and reconcile settlements using your actual statements.
