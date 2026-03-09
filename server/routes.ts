import { Router } from 'express';
import { getNews, getNewsByCategory, getNewsBySource, clearNewsCache, getNewsCacheStats } from './newsService.js';
import { getScores, getScoreboard, clearScoresCache } from './scoresService.js';
import { getApiStatus, resetApiHealth } from './apiManager.js';

const router = Router();

// News endpoints
router.get('/news', getNews);
router.get('/news/category/:category', getNewsByCategory);
router.get('/news/source/:source', getNewsBySource);
router.post('/news/clear-cache', clearNewsCache);
router.get('/news/cache-stats', getNewsCacheStats);

// Scores endpoints
router.get('/scores', getScores);
router.get('/scores/scoreboard', getScoreboard);
router.post('/scores/clear-cache', clearScoresCache);

// Status & monitoring
router.get('/status', getApiStatus);
router.post('/status/reset/:apiName', resetApiHealth);

export default router;