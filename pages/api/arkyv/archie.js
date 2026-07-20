import { getAgentAIStatus } from '@/lib/aiProvider';
import { runArchieAgent } from '@/lib/archieAgent';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

function publicStatus() {
  const status = getAgentAIStatus();
  return {
    ...status,
    name: 'Archie',
    limits: {
      maximumTurns: 18,
      maximumToolCalls: 28,
      maximumChangedRecords: 220,
    },
  };
}

function safeArchieError(error) {
  const raw = String(error?.message || error || 'Archie could not finish this task.');
  if (/<html|<!doctype/i.test(raw)) {
    const status = raw.match(/\b([45]\d\d)\b/)?.[1];
    return `The configured model provider returned ${status ? `HTTP ${status}` : 'an HTML error page'}. Verify its base URL and model name.`;
  }
  return raw.replace(/\s+/g, ' ').slice(0, 800);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(publicStatus());
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const status = getAgentAIStatus();
  if (!status.available) {
    return res.status(503).json({
      error: status.error || 'Archie has no configured model provider.',
      status: publicStatus(),
    });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const controller = new AbortController();
  req.once('aborted', () => controller.abort(new Error('Administrator stopped Archie.')));
  const emit = (event) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    emit({ type: 'status', status: 'loading_world', message: 'Archie is opening the world archive…' });
    const result = await runArchieAgent({
      prompt: req.body?.prompt,
      world: req.body?.world,
      history: req.body?.history,
      emit,
      signal: controller.signal,
    });
    emit({ type: 'final', ...result });
  } catch (error) {
    const stopped = controller.signal.aborted || error?.name === 'AbortError';
    emit({
      type: stopped ? 'stopped' : 'error',
      error: stopped ? 'Archie stopped before making any changes.' : safeArchieError(error),
    });
  } finally {
    if (!res.writableEnded) res.end();
  }
}
