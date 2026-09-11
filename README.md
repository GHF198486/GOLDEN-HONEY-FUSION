# Golden Honey Fusion — Final WEB + Order Backend

## Public order routing
Customer orders from the main GHF menu are routed to the partner WhatsApp number:
**+961 71 127 840** (`96171127840`).

The Iranian WhatsApp Business number is kept private and is not exposed to customers.

## New final changes
- Each invoice line shows the product's rating stars beside the product name.
- Lebanon delivery-location map is embedded in the order/customer section.
- Customer can tap the map to place an exact pin, drag the pin, or use the device location button.
- Latitude/longitude are saved with the order payload.
- Customer can still enter governorate, town/city, exact address, floor/building and notes.
- Pharmacy/store display-only catalogs remain without ordering/cart flow.

## Run
1. Install Node.js 18+.
2. `npm install`
3. Copy `.env.example` to `.env` and configure server values.
4. `npm start`
5. Open the server URL.

The Meta WhatsApp Cloud API is not considered live until valid Meta credentials, templates and hosting are configured.

## UX updates
- Compact gold shopping basket appears under the GHF mark on the home page and in the menu.
- Collections submenu titles are larger and gold.
- Delivery map uses satellite imagery with a light road overlay.
- Governorate selector uses a dark-gold luxury treatment instead of white.
- Purchase privilege is visibly explained in the basket (3.3% → 4% → 5% based on consecutive confirmed purchases).
- Invoice includes CONFIRM ORDER / SHIP ORDER control fields and a SAVE PDF TO PHONE action.
- If the optional audio files are not deployed, the menu falls back to a very quiet built-in ambient melody after the first user interaction.
