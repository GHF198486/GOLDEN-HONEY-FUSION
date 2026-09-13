GHF PARTNER SYSTEM — FINAL STEP 1

Files:
- public/index.html  = current GHF menu, preserved except for an optional API-base hook
- public/partner.html = partner dashboard
- server.js = existing GHF backend + partner login/orders/status routes
- package.json = Node/Express dependencies
- data/ = persistent JSON database directory

Flow:
Customer -> /api/orders -> NEW ORDER -> Partner login -> Confirm -> Ship -> WhatsApp status -> Delivered

Partner credentials are set with environment variables:
PARTNER_USERNAME
PARTNER_PASSWORD

Recommended production setup:
Set BASE_URL to the public backend URL.
Set PARTNER_USERNAME and PARTNER_PASSWORD to private values.
The partner opens /partner.html and does not need GitHub access.

If the customer menu is hosted by this same backend, leave the API base empty.
If the customer menu is hosted on GitHub Pages, put the backend URL in:
<meta name="ghf-api-base" content="https://YOUR-BACKEND-URL">

No WhatsApp Business API is required for the partner's manual status message button.
