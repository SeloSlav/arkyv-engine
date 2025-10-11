export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/command-processor`;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('API Route called');
  console.log('Function URL:', FUNCTION_URL);
  console.log('Service Role Key:', SERVICE_ROLE_KEY ? 'Set' : 'MISSING');

  if (!FUNCTION_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Supabase function not configured',
      details: {
        hasUrl: !!FUNCTION_URL,
        hasKey: !!SERVICE_ROLE_KEY
      }
    });
  }

  try {
    // Check if this is a direct command
    const hasDirectCommand = req.body && req.body.raw && req.body.room_id;
    const requestBody = hasDirectCommand ? { command: req.body } : {};
    
    console.log('Calling Edge Function:', FUNCTION_URL);
    console.log('Has direct command:', hasDirectCommand);
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: Object.keys(requestBody).length > 0 ? JSON.stringify(requestBody) : undefined
    });

    console.log('Edge Function response status:', response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Edge Function error:', text);
      return res.status(response.status).json({ error: text });
    }

    const result = await response.text();
    console.log('Edge Function result:', result);
    return res.status(200).json({ status: 'ok', result });
  } catch (error) {
    console.error('API route error:', error);
    return res.status(500).json({ error: error.message });
  }
}
