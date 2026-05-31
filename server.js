require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting – 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api', limiter);

// Helper: validate API key
function checkApiKey(req, res, next) {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    return res.status(503).json({
      error: 'API key not configured. Please add your OpenWeatherMap API key to the .env file.'
    });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/weather?city=London&units=metric
app.get('/api/weather', checkApiKey, async (req, res) => {
  const { city, lat, lon, units = 'metric' } = req.query;
  try {
    let url;
    if (lat && lon) {
      url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    } else if (city) {
      url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${API_KEY}`;
    } else {
      return res.status(400).json({ error: 'Provide city name or lat/lon coordinates.' });
    }
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to fetch weather data.';
    res.status(status).json({ error: message });
  }
});

// GET /api/forecast?city=London&units=metric  (5-day / 3-hour forecast)
app.get('/api/forecast', checkApiKey, async (req, res) => {
  const { city, lat, lon, units = 'metric' } = req.query;
  try {
    let url;
    if (lat && lon) {
      url = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    } else if (city) {
      url = `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=${units}&appid=${API_KEY}`;
    } else {
      return res.status(400).json({ error: 'Provide city name or lat/lon coordinates.' });
    }
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to fetch forecast data.';
    res.status(status).json({ error: message });
  }
});

// GET /api/air-quality?lat=51.5&lon=-0.12
app.get('/api/air-quality', checkApiKey, async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required.' });
  try {
    const url = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to fetch air quality data.';
    res.status(status).json({ error: message });
  }
});

// GET /api/search?q=Lon  (city autocomplete)
app.get('/api/search', checkApiKey, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters.' });
  try {
    const url = `${GEO_URL}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to search cities.';
    res.status(status).json({ error: message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌤  Weather API Server running at http://localhost:${PORT}`);
  console.log(`📡  API Endpoints:`);
  console.log(`    GET /api/weather?city=London`);
  console.log(`    GET /api/forecast?city=London`);
  console.log(`    GET /api/air-quality?lat=51.5&lon=-0.12`);
  console.log(`    GET /api/search?q=Lon\n`);
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.warn('⚠️  WARNING: No API key set! Add OPENWEATHER_API_KEY to .env\n');
  }
});
