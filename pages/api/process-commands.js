// Commands are processed synchronously by the SpacetimeDB submit_command reducer.
// This compatibility endpoint remains for older clients that still trigger it.
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ processed: true, backend: 'spacetimedb' });
}
