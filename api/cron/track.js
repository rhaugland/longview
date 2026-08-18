import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all orders that need tracking: Processing (waiting for pickup) or Shipped (waiting for delivery)
    const orders = await sql`
      SELECT id, tracking_number, status
      FROM orders
      WHERE status IN ('confirmed', 'shipped')
        AND tracking_number IS NOT NULL
        AND tracking_number NOT LIKE 'PENDING-%'
    `;

    if (orders.length === 0) {
      return res.status(200).json({ message: 'No orders to track', updated: 0 });
    }

    let updated = 0;

    for (const order of orders) {
      const newStatus = await checkFedExStatus(order.tracking_number);

      if (!newStatus) continue;

      // Processing → Shipped (FedEx has picked it up)
      if (order.status === 'confirmed' && (newStatus === 'in_transit' || newStatus === 'delivered')) {
        await sql`UPDATE orders SET status = 'shipped', updated_at = now() WHERE id = ${order.id}`;
        updated++;
        console.log(`Order ${order.id} → Shipped`);
      }

      // Shipped → Delivered
      if ((order.status === 'shipped' || order.status === 'confirmed') && newStatus === 'delivered') {
        await sql`UPDATE orders SET status = 'delivered', updated_at = now() WHERE id = ${order.id}`;
        updated++;
        console.log(`Order ${order.id} → Delivered`);
      }
    }

    return res.status(200).json({ message: `Tracked ${orders.length} orders`, updated });
  } catch (err) {
    console.error('Tracking cron error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function checkFedExStatus(trackingNumber) {
  // TODO: Wire up FedEx Track API
  // Endpoint: https://apis.fedex.com/track/v1/trackingnumbers
  // Auth: OAuth2 with FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET
  //
  // const token = await getFedExToken();
  // const response = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${token}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
  //     includeDetailedScans: false,
  //   }),
  // });
  // const data = await response.json();
  // const latestStatus = data.output.completeTrackResults[0]
  //   .trackResults[0].latestStatusDetail.statusByLocale;
  //
  // Map FedEx status to our status:
  //   "Picked Up" / "In Transit" → 'in_transit'
  //   "Delivered" → 'delivered'
  //
  // return mapped status or null if no change

  return null; // Placeholder until FedEx API is connected
}
