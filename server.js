import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
// import helmet from 'helmet';
import morgan from 'morgan';
import axios from 'axios';
import path from 'path';
import qs from 'qs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
// app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Env config
const PORT = process.env.PORT || 3000;
const CHECKOUTCHAMP_BASE = 'https://api.checkoutchamp.com';
const CHECKOUTCHAMP_LOGIN = process.env.CHECKOUTCHAMP_LOGIN_ID || '';
const CHECKOUTCHAMP_PASSWORD = process.env.CHECKOUTCHAMP_PASSWORD || '';
const CHECKOUTCHAMP_CAMPAIGN_ID = process.env.CHECKOUTCHAMP_CAMPAIGN_ID || '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_MAP_ID = process.env.GOOGLE_MAPS_MAP_ID || '';

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Health/config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    result: 'SUCCESS',
    message: {
      campaignId: CHECKOUTCHAMP_CAMPAIGN_ID,
      googleMapsApiKey: GOOGLE_MAPS_API_KEY ? 'present' : 'missing'
    }
  });
});

// Expose Maps API key for client to load SDK (Google Maps keys are public but should be domain-restricted)
app.get('/api/maps-key', (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(404).json({ result: 'ERROR', message: 'Google Maps API key not configured' });
  }
  res.json({ result: 'SUCCESS', message: { key: GOOGLE_MAPS_API_KEY, mapId: GOOGLE_MAPS_MAP_ID || undefined } });
});

// Helper for CheckoutChamp POST requests
async function postToCheckoutChamp(endpointPath, params) {
  const url = `${CHECKOUTCHAMP_BASE}${endpointPath}`;
  const payload = {
    loginId: CHECKOUTCHAMP_LOGIN,
    password: CHECKOUTCHAMP_PASSWORD,
    campaignId: CHECKOUTCHAMP_CAMPAIGN_ID,
    ...params
  };
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const data = qs.stringify(payload);
  const response = await axios.post(url, data, { headers, timeout: 20000 });
  return response.data;
}

// Countries
app.get('/api/countries', async (req, res) => {
  try {
    const data = await postToCheckoutChamp('/campaign/query/', {});
    // Extract countries from data.message.data[<campaignId>].countries
    const campaignData = data?.message?.data?.[String(CHECKOUTCHAMP_CAMPAIGN_ID)];
    const countries = campaignData?.countries || [];
    res.json({ result: 'SUCCESS', message: { countries } });
  } catch (error) {
    const errorMessage = error?.response?.data || error.message;
    res.status(500).json({ result: 'ERROR', message: errorMessage });
  }
});

// Products
app.get('/api/products', async (req, res) => {
  try {
    const data = await postToCheckoutChamp('/product/query/', { productType: 'OFFER' });
    const products = data?.message?.data || [];
    res.json({ result: 'SUCCESS', message: { products } });
  } catch (error) {
    const errorMessage = error?.response?.data || error.message;
    res.status(500).json({ result: 'ERROR', message: errorMessage });
  }
});

// Lead (partial lead before payment)
app.post('/api/lead', async (req, res) => {
  try {
    const { leadId, firstName, lastName, emailAddress, product1_id } = req.body || {};

    if (leadId) {
      // Update existing partial lead (order)
      const payload = {
        orderId: leadId,
        firstName,
        lastName,
        emailAddress,
        product1_id
      };
      const data = await postToCheckoutChamp('/order/update/', payload);
      if (data?.result === 'SUCCESS') {
        return res.json({ result: 'SUCCESS', message: { orderId: leadId } });
      }
      const errorText = typeof data?.message === 'string' ? data.message : 'Failed to update partial lead';
      return res.status(400).json({ result: 'ERROR', message: errorText });
    }

    // Create new partial lead
    const createPayload = {
      firstName,
      lastName,
      emailAddress,
      product1_id
    };
    const createRes = await postToCheckoutChamp('/leads/import/', createPayload);
    if (createRes?.result === 'SUCCESS') {
      const msg = createRes?.message || {};
      return res.json({ result: 'SUCCESS', message: { orderId: msg.orderId } });
    }
    const errorText = typeof createRes?.message === 'string' ? createRes.message : 'Failed to create partial lead';
    return res.status(400).json({ result: 'ERROR', message: errorText });
  } catch (error) {
    const errorMessage = error?.response?.data || error.message;
    res.status(500).json({ result: 'ERROR', message: errorMessage });
  }
});

// Checkout (order import)
app.post('/api/checkout', async (req, res) => {
  try {
    // Expect frontend to pass all required fields
    const {
      firstName,
      lastName,
      postalCode,
      emailAddress,
      phoneNumber,
      address1,
      paySource,
      cardNumber,
      cardMonth,
      cardYear,
      cardSecurityCode,
      city,
      country,
      ipAddress,
      state,
      product1_id,
      billShipSame,
      // optional extras
      address2,
      latitude,
      longitude
    } = req.body || {};

    const payload = {
      firstName,
      lastName,
      postalCode,
      emailAddress,
      phoneNumber,
      address1,
      paySource,
      cardNumber,
      cardMonth,
      cardYear,
      cardSecurityCode,
      city,
      country,
      ipAddress,
      state,
      product1_id,
      billShipSame,
      address2,
      latitude,
      longitude
    };
    const data = await postToCheckoutChamp('/order/import/', payload);
    // Pass-through result, but ensure format as requested
    if (data?.result === 'SUCCESS') {
      const msg = data.message || {};
      return res.json({ result: 'SUCCESS', message: {
        orderId: msg.orderId,
        dateCreated: msg.dateCreated,
        orderType: msg.orderType,
        orderStatus: msg.orderStatus
      }});
    }
    // Error case
    const errorText = typeof data?.message === 'string' ? data.message : 'Unknown error';
    return res.status(400).json({ result: 'ERROR', message: errorText });
  } catch (error) {
    const errorMessage = error?.response?.data || error.message;
    res.status(500).json({ result: 'ERROR', message: errorMessage });
  }
});

// Fallback to frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});


