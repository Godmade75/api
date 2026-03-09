// Health tracking for APIs
interface ApiHealth {
  healthy: boolean;
  consecutiveFailures: number;
  lastFailure?: number;
}

const apiHealth: Record<string, ApiHealth> = {
  espn: { healthy: true, consecutiveFailures: 0 },
  reddit: { healthy: true, consecutiveFailures: 0 },
  newsapi: { healthy: true, consecutiveFailures: 0 },
  gnews: { healthy: true, consecutiveFailures: 0 },
  'api-football': { healthy: true, consecutiveFailures: 0 },
  thesportsdb: { healthy: true, consecutiveFailures: 0 }
};

const MAX_FAILURES = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchWithFallback<T>(
  fetchers: (() => Promise<T>)[],
  apiName: string
): Promise<T[]> {
  const results: T[] = [];

  for (const fetcher of fetchers) {
    // Determine which API this fetcher uses (crude but works for this example)
    const apiKey = Object.keys(apiHealth).find(k => fetcher.toString().includes(k)) || apiName;

    if (!apiHealth[apiKey]?.healthy) {
      const health = apiHealth[apiKey];
      if (health && health.lastFailure && Date.now() - health.lastFailure > COOLDOWN_MS) {
        // Retry after cooldown
        health.healthy = true;
        health.consecutiveFailures = 0;
      } else {
        continue; // Skip unhealthy API
      }
    }

    try {
      const result = await fetcher();
      if (result && (Array.isArray(result) ? result.length > 0 : true)) {
        results.push(result);
        // Reset health on success
        if (apiHealth[apiKey]) {
          apiHealth[apiKey].healthy = true;
          apiHealth[apiKey].consecutiveFailures = 0;
        }
        // Continue to next fetcher to gather more data (parallel would be better, but we keep it simple)
      }
    } catch (err) {
      console.error(`API ${apiKey} failed:`, err);
      if (apiHealth[apiKey]) {
        apiHealth[apiKey].consecutiveFailures++;
        if (apiHealth[apiKey].consecutiveFailures >= MAX_FAILURES) {
          apiHealth[apiKey].healthy = false;
          apiHealth[apiKey].lastFailure = Date.now();
        }
      }
    }
  }

  return results;
}

export function getApiStatus(req: any, res: any) {
  res.json({ apis: apiHealth });
}

export function resetApiHealth(req: any, res: any) {
  const { apiName } = req.params;
  if (apiHealth[apiName]) {
    apiHealth[apiName].healthy = true;
    apiHealth[apiName].consecutiveFailures = 0;
    delete apiHealth[apiName].lastFailure;
    res.json({ message: `API ${apiName} reset` });
  } else {
    res.status(404).json({ error: 'API not found' });
  }
}