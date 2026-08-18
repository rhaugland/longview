import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const members = await sql`SELECT * FROM team ORDER BY created_at ASC`;
      return res.status(200).json({ members });
    }

    if (req.method === 'POST') {
      const { name, role } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const rows = await sql`
        INSERT INTO team (name, role) VALUES (${name.trim()}, ${(role || 'Worker').trim()})
        RETURNING *
      `;
      return res.status(201).json({ success: true, member: rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      await sql`DELETE FROM team WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
