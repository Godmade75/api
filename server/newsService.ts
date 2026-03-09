import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { fetchWithFallback } from './apiManager.js';

// Cache
let newsCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to fetch from a single source
async function fetchFromSource(source: string, sport?: string): Promise<any[]> {
  const sportParam = sport ? `?sport=${sport}` : '';
  switch (source) {
    case 'espn':
      // ESPN news endpoint – adapt for each sport
      if (sport === 'basketball') {
        const res = await fetch('http://site.api.espn.com/apis/site/v2/sports/basketball/nba/news');
        const data: any = await res.json();
        return (data.articles || []).map((a: any) => ({
          id: `espn_${a.id}`,
          title: a.headline,
          description: a.description,
          content: a.story,
          url: a.links?.web?.href || '',
          imageUrl: a.images?.[0]?.url,
          source: 'ESPN',
          author: a.byline,
          publishedAt: a.published,
          sportId: sport,
          category: a.type || 'news',
          tags: a.categories?.map((c: any) => c.description) || []
        }));
      }
      // Add football, soccer similarly
      return [];

    case 'reddit':
      const subreddits: Record<string, string> = {
        basketball: 'nba',
        football: 'nfl',
        soccer: 'soccer'
      };
      const sub = subreddits[sport || 'basketball'];
      if (!sub) return [];
      const redditRes = await fetch(`https://www.reddit.com/r/${sub}/.json?limit=25`);
      const redditData: any = await redditRes.json();
      return redditData.data.children.map((child: any) => {
        const d = child.data;
        return {
          id: `reddit_${d.id}`,
          title: d.title,
          description: d.selftext.substring(0, 200),
          url: `https://reddit.com${d.permalink}`,
          source: 'Reddit',
          author: d.author,
          publishedAt: new Date(d.created_utc * 1000).toISOString(),
          sportId: sport,
          category: 'viral',
          tags: ['viral']
        };
      });

    // Add other sources (NewsAPI, Gnews, API-Football, TheSportsDB) similarly
    default:
      return [];
  }
}

// Main news aggregation with fallback
export async function getNews(req: Request, res: Response) {
  const sport = req.query.sport as string || 'basketball';
  const limit = parseInt(req.query.limit as string) || 50;
  const refresh = req.query.refresh === 'true';

  if (!refresh && newsCache && (Date.now() - newsCache.timestamp < CACHE_TTL)) {
    return res.json({
      articles: newsCache.data.slice(0, limit),
      totalResults: newsCache.data.length,
      sport,
      lastUpdated: new Date(newsCache.timestamp).toISOString()
    });
  }

  try {
    // Sources in priority order
    const sources = ['espn', 'reddit', 'newsapi', 'gnews', 'api-football', 'thesportsdb'];
    const results = await fetchWithFallback(
      sources.map(src => () => fetchFromSource(src, sport)),
      'news'
    );

    // Flatten and deduplicate (by title + source)
    const all = results.flat();
    const unique = Array.from(new Map(all.map(item => [item.title + item.source, item])).values());

    // Sort by publishedAt descending
    unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    newsCache = { data: unique, timestamp: Date.now() };

    res.json({
      articles: unique.slice(0, limit),
      totalResults: unique.length,
      sport,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('News aggregation error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}

// Additional endpoints (by category, source) – omitted for brevity; add similar logic
export async function getNewsByCategory(req: Request, res: Response) { /* ... */ }
export async function getNewsBySource(req: Request, res: Response) { /* ... */ }
export async function clearNewsCache(req: Request, res: Response) {
  newsCache = null;
  res.json({ message: 'News cache cleared' });
}
export async function getNewsCacheStats(req: Request, res: Response) {
  res.json({
    cached: !!newsCache,
    age: newsCache ? Date.now() - newsCache.timestamp : null,
    itemCount: newsCache?.data.length || 0
  });
}