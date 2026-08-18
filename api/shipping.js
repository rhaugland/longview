import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

    // Fetch order details for label creation
    const orders = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orders[0];

    if (order.status !== 'confirmed') {
      return res.status(400).json({ error: 'Order must be in Processing to create a label' });
    }

    // TODO: Wire up FedEx API here
    // - Use order.first_name, last_name, address, city, state, zip, country
    // - Create shipping label via FedEx Ship API
    // - Get back tracking number and label PDF URL
    //
    // For now, generate a placeholder tracking number
    const trackingNumber = 'PENDING-FEDEX-' + orderId.slice(0, 8).toUpperCase();

    // Save tracking number and move to shipped
    const rows = await sql`
      UPDATE orders
      SET tracking_number = ${trackingNumber}, status = 'shipped', updated_at = now()
      WHERE id = ${orderId}
      RETURNING *
    `;

    return res.status(200).json({
      success: true,
      order: rows[0],
      trackingNumber,
      // labelUrl will come from FedEx API later
      labelUrl: null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
