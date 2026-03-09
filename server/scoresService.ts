import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { fetchWithFallback } from './apiManager.js';

let scoresCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1 minute

async function fetchScoresFromSource(source: string, sport?: string): Promise<any[]> {
  const sportParam = sport || 'basketball';
  switch (source) {
    case 'espn': {
      let url = '';
      if (sportParam === 'basketball') url = 'http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
      else if (sportParam === 'football') url = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
      else if (sportParam === 'soccer') url = 'http://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard';
      else return [];
      const res = await fetch(url);
      const data: any = await res.json();
      return (data.events || []).map((event: any) => {
        const comp = event.competitions[0];
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        return {
          id: `espn_${event.id}`,
          sportId: sportParam,
          league: event.league?.name || sportParam,
          homeTeam: home?.team?.name || '',
          awayTeam: away?.team?.name || '',
          homeScore: home?.score || null,
          awayScore: away?.score || null,
          status: comp.status?.type?.state === 'post' ? 'finished' : (comp.status?.type?.state === 'in' ? 'live' : 'scheduled'),
          startTime: event.date,
          period: comp.status?.type?.detail,
          venue: comp.venue?.fullName,
          source: 'ESPN'
        };
      });
    }
    // Add API-Football, TheSportsDB similarly
    default:
      return [];
  }
}

export async function getScores(req: Request, res: Response) {
  const sport = req.query.sport as string;
  const refresh = req.query.refresh === 'true';

  if (!refresh && scoresCache && (Date.now() - scoresCache.timestamp < CACHE_TTL)) {
    let data = scoresCache.data;
    if (sport) data = data.filter(s => s.sportId === sport);
    return res.json({ scores: data, totalResults: data.length, sport: sport || 'all', lastUpdated: new Date(scoresCache.timestamp).toISOString() });
  }

  try {
    const sources = ['espn', 'api-football', 'thesportsdb'];
    const results = await fetchWithFallback(
      sources.map(src => () => fetchScoresFromSource(src, sport)),
      'scores'
    );
    const all = results.flat();
    // Deduplicate by id
    const unique = Array.from(new Map(all.map(s => [s.id, s])).values());
    unique.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    scoresCache = { data: unique, timestamp: Date.now() };

    let filtered = unique;
    if (sport) filtered = filtered.filter(s => s.sportId === sport);

    res.json({ scores: filtered, totalResults: filtered.length, sport: sport || 'all', lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('Scores error:', error);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
}

export async function getScoreboard(req: Request, res: Response) { /* ... */ }
export async function clearScoresCache(req: Request, res: Response) {
  scoresCache = null;
  res.json({ message: 'Scores cache cleared' });
}