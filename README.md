## CheckoutChamp Funnel (Node/Express + Static Frontend)

This project implements a full e-commerce funnel integrated with CheckoutChamp:

- Landing page (offer overview)
- Products page (dynamic from CheckoutChamp API)
- Checkout page (validations, Google Places Autocomplete with optional map, partial lead, order processing)
- Thank You page (minimal confirmation)

### Features

- Server-side proxy with Express for CheckoutChamp endpoints:
  - GET `/api/countries` → countries from campaign
  - GET `/api/products` → products with `productType=OFFER`
  - POST `/api/lead` → partial lead submission
  - POST `/api/checkout` → order import (payment)
  - GET `/api/config` → basic config status
  - GET `/api/maps-key` → provides Google Maps JS SDK key
- Frontend validation: email, card number (Luhn), expiry, CVV, required fields, real-time errors
- Google Places Autocomplete restricted by selected country; auto-fills city, state, ZIP, street
- Optional interactive map to capture lat/lng
- Modal displays error or minimal success message (orderId only); thank-you navigation occurs only after closing the modal
- `.env`-driven configuration

### Getting Started

#### Prerequisites
- Node.js >= 18

#### Install
```bash
npm install
```

#### Configure
Create `.env` in project root:
```bash
# CheckoutChamp credentials
CHECKOUTCHAMP_LOGIN_ID=your_login
CHECKOUTCHAMP_PASSWORD=your_password
CHECKOUTCHAMP_CAMPAIGN_ID=25

# Google Maps JavaScript API key (should be domain-restricted in Google Cloud)
GOOGLE_MAPS_API_KEY=your_google_maps_key

# Server
PORT=3000
```

#### Run
```bash
npm run dev
# visit http://localhost:3000
```

### How it Works

- The frontend is served from `public/`.
- Products page calls `/api/products` to render product cards. Clicking “Buy Now” passes `productId` to `checkout.html`.
- Checkout page:
  - Loads countries from `/api/countries` into the dropdown.
  - Initializes Google Places Autocomplete restricted by the dropdown’s selected country; updates restriction when user changes the country.
  - Performs real-time validation with inline errors.
  - Sends partial lead to `/api/lead` after minimal fields are valid.
  - On submit, posts to `/api/checkout`. Result is shown in a modal. On success, only a concise message is shown (with `orderId`). Navigation to `thankyou.html` happens after closing the modal.
  - Optional map is enabled by default; disable by passing `{ enableMap: false }` to `setupAddressAutocomplete` (see `public/js/maps.js`).

### Important Notes

- The server proxies all requests to CheckoutChamp with `application/x-www-form-urlencoded` body encoding.
- Countries are extracted from `data.message.data[<campaignId>].countries` and sent back as `{ result: 'SUCCESS', message: { countries } }`.
- Products are returned as `{ result: 'SUCCESS', message: { products } }`.
- Checkout response is normalized:
  - On success → `{ result: 'SUCCESS', message: { orderId, dateCreated, orderType, orderStatus } }`
  - On error → `{ result: 'ERROR', message: string }` (HTTP 400 or 500)
- Google Maps key is returned by `/api/maps-key`; it is public in the client but should be domain-restricted in Google Cloud.

### Deployment

- Ensure environment variables are configured in production.
- Serve via `npm start` behind a reverse proxy (e.g., Nginx). Static files are served from `public/`.
- Enforce HTTPS and set allowed origins if you tighten CORS.

### File Map

- `server.js` – Express server and API routes
- `public/index.html` – Landing page
- `public/products.html` – Products listing
- `public/checkout.html` – Checkout UI
- `public/thankyou.html` – Thank You page
- `public/styles.css` – Minimal styling
- `public/js/validation.js` – Client-side validation helpers
- `public/js/maps.js` – Google Places + Map integration
- `public/js/checkout.js` – Checkout page logic, modal, submission

### Troubleshooting

- Countries empty: verify `CHECKOUTCHAMP_CAMPAIGN_ID` is valid and the campaign has countries.
- Products empty: confirm products exist for the campaign and `productType=OFFER`.
- Maps not loading: ensure `GOOGLE_MAPS_API_KEY` is set and domain restrictions include your origin.
- Payment errors: server responds with `{ result: 'ERROR', message }` which is shown in the modal.

### License
MIT


