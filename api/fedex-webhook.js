import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// FedEx event codes that indicate pickup/in-transit
const PICKUP_EVENTS = ['PU', 'OC', 'IT', 'DP', 'AR', 'AF', 'OD'];
// FedEx event codes that indicate delivery
const DELIVERY_EVENTS = ['DL'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // TODO: Validate FedEx webhook signature using FEDEX_WEBHOOK_SECRET
    // const signature = req.headers['x-fedex-signature'];
    // if (!verifySignature(signature, req.body)) return res.status(401).end();

    const events = parseEvents(req.body);

    for (const event of events) {
      await processTrackingEvent(event);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('FedEx webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function parseEvents(body) {
  // TODO: Adjust to match actual FedEx webhook payload structure
  // FedEx Track API webhooks send an array of tracking events
  // Expected structure (adjust when wiring up real API):
  // {
  //   "trackingNumber": "...",
  //   "eventType": "PU" | "IT" | "DL" | etc,
  //   "eventDescription": "Picked up",
  //   "timestamp": "2026-08-18T10:00:00Z"
  // }

  if (!body) return [];

  // Handle both single event and array of events
  const rawEvents = Array.isArray(body.events) ? body.events : [body];

  return rawEvents
    .filter(e => e.trackingNumber && e.eventType)
    .map(e => ({
      trackingNumber: e.trackingNumber,
      eventType: e.eventType,
      description: e.eventDescription || '',
      timestamp: e.timestamp || new Date().toISOString(),
    }));
}

async function processTrackingEvent({ trackingNumber, eventType }) {
  // Find order by tracking number
  const orders = await sql`
    SELECT id, status FROM orders WHERE tracking_number = ${trackingNumber}
  `;

  if (orders.length === 0) return;

  const order = orders[0];

  // Pickup/in-transit scan → move from Processing to Shipped
  if (PICKUP_EVENTS.includes(eventType) && order.status === 'confirmed') {
    await sql`
      UPDATE orders SET status = 'shipped', updated_at = now()
      WHERE id = ${order.id}
    `;
    console.log(`Order ${order.id} moved to Shipped (event: ${eventType})`);
  }

  // Delivery scan → move from Shipped to Delivered
  if (DELIVERY_EVENTS.includes(eventType) && order.status === 'shipped') {
    await sql`
      UPDATE orders SET status = 'delivered', updated_at = now()
      WHERE id = ${order.id}
    `;
    console.log(`Order ${order.id} moved to Delivered (event: ${eventType})`);
  }
}
