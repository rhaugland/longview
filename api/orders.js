import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') return await createOrder(req, res);
    if (req.method === 'GET') return await listOrders(req, res);
    if (req.method === 'PATCH') return await updateOrder(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createOrder(req, res) {
  const { firstName, lastName, email, phone, address, city, state, zip, country } = req.body;

  const required = { firstName, lastName, email, phone, address, city, state, zip, country };
  const missing = Object.entries(required).filter(([, v]) => !v || !v.trim()).map(([k]) => k);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const rows = await sql`
    INSERT INTO orders (first_name, last_name, email, phone, address, city, state, zip, country)
    VALUES (${firstName.trim()}, ${lastName.trim()}, ${email.trim().toLowerCase()}, ${phone.trim()}, ${address.trim()}, ${city.trim()}, ${state.trim()}, ${zip.trim()}, ${country.trim()})
    RETURNING id
  `;

  return res.status(201).json({ success: true, orderId: rows[0].id });
}

async function listOrders(req, res) {
  const orders = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
  return res.status(200).json({ orders });
}

async function updateOrder(req, res) {
  const { id, status, owner } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing id' });
  }

  // Owner-only update (claim)
  if (owner !== undefined && !status) {
    const rows = await sql`
      UPDATE orders SET owner = ${owner}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ success: true, order: rows[0] });
  }

  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }

  const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
  }

  const rows = await sql`
    UPDATE orders SET status = ${status}, owner = COALESCE(${owner || null}, owner), updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.status(200).json({ success: true, order: rows[0] });
}
