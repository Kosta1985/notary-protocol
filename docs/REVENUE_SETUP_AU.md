# Revenue setup for an Australian pilot

This is an operational checklist, not accounting, tax or legal advice. Confirm
the final setup with an Australian accountant when the first pilot is ready to
sign.

## Before accepting payment

1. Use an active ABN for the seller named on the invoice.
2. Receive revenue into a separate business bank account. A sole trader is not
   required to use a separate account, but the Australian Government recommends
   it to keep business income and expenses clear.
3. Agree a short written scope, acceptance check, price, payment schedule,
   confidentiality terms and intellectual-property treatment.
4. Issue a numbered invoice containing the seller name, ABN, issue date,
   contact details, service description, buyer name, amount, due date and bank
   payment instructions.
5. Use the words `Tax Invoice` and add GST only when the seller is registered
   for GST. Otherwise use `Invoice` and do not add GST.

Australian GST registration is generally required when current or projected
GST turnover reaches A$75,000. Registration may be voluntary below that level.

Official references:

- https://business.gov.au/finance/set-up-your-finances/set-up-your-business-bank-account
- https://business.gov.au/Finance/Payments-and-invoicing/How-to-invoice
- https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst

## Launch-period policy

- accept no product payments through 24 November 2026;
- require no card or paid plan for early access;
- do not accept cryptocurrency, private keys or customer funds handled by a
  verified agent transaction;
- prepare the ABN, business account and invoice process before paid bulk export
  is introduced.

## When to add Stripe

Add a Stripe Payment Link only after two or three pilots validate a repeatable
offer or when a customer explicitly requires card payment. Keep Stripe outside
the protocol and verification API. The service should redirect to a
Stripe-hosted page rather than handling card data.

Official Australian Stripe pricing and Payment Links:

- https://stripe.com/au/payments/payment-links
- https://stripe.com/au/pricing
