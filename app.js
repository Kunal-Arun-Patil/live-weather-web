/* ══════════════════════════════════════════════════
   LiveWeather — Frontend Application Logic
   ══════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────
const state = {
  unit: 'metric',       // 'metric' | 'imperial'
  lastLat: null,
  lastLon: null,
  lastCity: null,
  autocompleteTimer: null,
};

// ── DOM References ─────────────────────────────────
const $ = id => document.getElementById(id);
const cityInput       = $('cityInput');
const searchBtn       = $('searchBtn');
const unitToggle      = $('unitToggle');
const unitLabel       = $('unitLabel');
const locationBtn     = $('locationBtn');
const autocompleteList= $('autocompleteList');
const loaderWrap      = $('loaderWrap');
const errorCard       = $('errorCard');
const errorTitle      = $('errorTitle');
const errorMsg        = $('errorMsg');
const weatherContainer= $('weatherContainer');
const apiBanner       = $('apiBanner');
const appBody         = $('app-body');
const bgParticles     = $('bgParticles');

// ── Weather Icon Map ───────────────────────────────
const WEATHER_ICONS = {
  // Clear
  '01d': '☀️', '01n': '🌙',
  // Few clouds
  '02d': '🌤️', '02n': '🌤️',
  // Scattered clouds
  '03d': '⛅', '03n': '⛅',
  // Broken clouds
  '04d': '☁️', '04n': '☁️',
  // Shower rain
  '09d': '🌧️', '09n': '🌧️',
  // Rain
  '10d': '🌦️', '10n': '🌦️',
  // Thunderstorm
  '11d': '⛈️', '11n': '⛈️',
  // Snow
  '13d': '❄️', '13n': '❄️',
  // Mist / fog
  '50d': '🌫️', '50n': '🌫️',
};

// ── Weather Theme Map ──────────────────────────────
const WEATHER_THEMES = {
  Clear: 'weather-clear',
  Clouds: 'weather-clouds',
  Rain: 'weather-rain',
  Drizzle: 'weather-drizzle',
  Thunderstorm: 'weather-thunderstorm',
  Snow: 'weather-snow',
  Mist: 'weather-mist',
  Fog: 'weather-fog',
  Haze: 'weather-haze',
};

// ── AQI Data ───────────────────────────────────────
const AQI_DATA = [
  { label: 'Good',      cls: 'good',      desc: 'Air quality is satisfactory. No health risks.' },
  { label: 'Fair',      cls: 'fair',      desc: 'Acceptable air quality. Sensitive groups may notice mild effects.' },
  { label: 'Moderate',  cls: 'moderate',  desc: 'Some pollutants may affect sensitive groups.' },
  { label: 'Poor',      cls: 'poor',      desc: 'Increased health risk. Reduce prolonged outdoor exertion.' },
  { label: 'Very Poor', cls: 'very-poor', desc: 'Health alert! Everyone may experience serious effects.' },
];

// ── Wind Direction Helper ──────────────────────────
function degToDir(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ── Unit Helpers ───────────────────────────────────
function speedUnit()  { return state.unit === 'metric' ? 'm/s' : 'mph'; }
function tempSuffix() { return state.unit === 'metric' ? '°C' : '°F'; }
function fmt(val, decimals = 0) {
  return typeof val === 'number' ? val.toFixed(decimals) : '–';
}

// ── Timestamp → local HH:MM ────────────────────────
function tsToTime(ts, tz) {
  const date = new Date((ts + tz) * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// ── Datetime string ────────────────────────────────
function buildDatetime(tz) {
  const now = new Date(Date.now() + tz * 1000);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[now.getUTCDay()]}, ${now.getUTCDate()} ${months[now.getUTCMonth()]} · ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
}

// ── Particles Background ───────────────────────────
function spawnParticles(count = 18) {
  bgParticles.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 60 + 20;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 15 + 10}s;
      animation-delay:${Math.random() * -15}s;
      opacity:${Math.random() * 0.4 + 0.05};
    `;
    bgParticles.appendChild(p);
  }
}

// ── Apply weather theme to body ────────────────────
function applyTheme(main) {
  const themeClasses = Object.values(WEATHER_THEMES);
  appBody.classList.remove(...themeClasses);
  const cls = WEATHER_THEMES[main] || 'weather-clear';
  appBody.classList.add(cls);
}

// ── Show / Hide UI states ──────────────────────────
function showLoader()  {
  loaderWrap.classList.add('visible');
  errorCard.classList.remove('visible');
  weatherContainer.classList.remove('visible');
}
function hideLoader()  { loaderWrap.classList.remove('visible'); }
function showError(title, msg) {
  hideLoader();
  errorCard.classList.add('visible');
  weatherContainer.classList.remove('visible');
  errorTitle.textContent = title;
  errorMsg.textContent   = msg;
}
function showWeather() {
  hideLoader();
  errorCard.classList.remove('visible');
  weatherContainer.classList.add('visible');
}

// ── Fetch helpers ──────────────────────────────────
async function apiFetch(endpoint) {
  const res = await fetch(endpoint);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── Render Current Weather ─────────────────────────
function renderCurrent(data) {
  const { name, sys, weather, main, wind, visibility, timezone } = data;
  const w = weather[0];

  // Theme
  applyTheme(w.main);

  // City info
  $('cityName').textContent       = name;
  $('cityCountry').textContent    = sys.country ? `📍 ${sys.country}` : '';
  $('currentDatetime').textContent = buildDatetime(timezone);

  // Icon & description
  $('weatherIconAnim').textContent = WEATHER_ICONS[w.icon] || '🌡️';
  $('weatherDesc').textContent     = w.description;

  // Temperature
  $('temperature').textContent = fmt(main.temp);
  $('tempUnit').textContent    = tempSuffix();
  $('feelsLike').textContent   = `${fmt(main.feels_like)}${tempSuffix()}`;
  $('tempMax').textContent     = `${fmt(main.temp_max)}${tempSuffix()}`;
  $('tempMin').textContent     = `${fmt(main.temp_min)}${tempSuffix()}`;

  // Stats
  $('humidity').textContent    = `${main.humidity}%`;
  $('windSpeed').textContent   = `${fmt(wind.speed)} ${speedUnit()}`;
  $('pressure').textContent    = `${main.pressure} hPa`;
  $('visibility').textContent  = visibility ? `${(visibility / 1000).toFixed(1)} km` : '–';
  $('sunrise').textContent     = tsToTime(sys.sunrise, timezone);
  $('sunset').textContent      = tsToTime(sys.sunset, timezone);

  // Wind compass
  $('windDeg').textContent      = wind.deg ?? '–';
  $('windDir').textContent      = wind.deg != null ? degToDir(wind.deg) : '–';
  $('windSpeedBig').textContent = `${fmt(wind.speed)} ${speedUnit()}`;
  $('windGust').textContent     = wind.gust ? `${fmt(wind.gust)} ${speedUnit()}` : 'N/A';

  // Rotate compass needle
  if (wind.deg != null) {
    $('compassNeedle').style.transform = `rotate(${wind.deg}deg)`;
  }

  // Store coords for air quality
  state.lastLat = data.coord.lat;
  state.lastLon = data.coord.lon;
}

// ── Render Forecast ────────────────────────────────
function renderForecast(data, tz = 0) {
  const list = data.list;

  // ── Hourly (next 8 items = 24h) ──
  const hourlyHTML = list.slice(0, 8).map(item => {
    const localDate = new Date((item.dt + tz) * 1000);
    const hours = localDate.getUTCHours();
    const minutes = localDate.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const time = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
    const icon  = WEATHER_ICONS[item.weather[0].icon] || '🌡️';
    const temp  = fmt(item.main.temp);
    const pop   = item.pop ? `💧 ${Math.round(item.pop * 100)}%` : '';
    return `
      <div class="hourly-item">
        <div class="hourly-time">${time}</div>
        <div class="hourly-icon">${icon}</div>
        <div class="hourly-temp">${temp}${tempSuffix()}</div>
        ${pop ? `<div class="hourly-pop">${pop}</div>` : ''}
      </div>`;
  }).join('');
  $('hourlyScroll').innerHTML = hourlyHTML;

  // ── Daily (1 item per day at ~noon) ──
  const dailyMap = {};
  list.forEach(item => {
    const d = new Date((item.dt + tz) * 1000);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (!dailyMap[key]) dailyMap[key] = [];
    dailyMap[key].push(item);
  });

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const forecastHTML = Object.values(dailyMap).slice(0, 5).map((items, idx) => {
    const noonItem  = items.reduce((prev, cur) => {
      const h = new Date((cur.dt + tz) * 1000).getUTCHours();
      return Math.abs(h - 12) < Math.abs(new Date((prev.dt + tz) * 1000).getUTCHours() - 12) ? cur : prev;
    });
    const d       = new Date((noonItem.dt + tz) * 1000);
    const dayName = idx === 0 ? 'Today' : days[d.getUTCDay()];
    const icon    = WEATHER_ICONS[noonItem.weather[0].icon] || '🌡️';
    const desc    = noonItem.weather[0].description;
    const hi      = Math.max(...items.map(i => i.main.temp_max));
    const lo      = Math.min(...items.map(i => i.main.temp_min));
    const avgPop  = items.reduce((s, i) => s + (i.pop || 0), 0) / items.length;

    return `
      <div class="forecast-item">
        <div class="forecast-day">${dayName}</div>
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-desc">${desc}</div>
        <div class="forecast-temps">
          <span class="forecast-hi">${fmt(hi)}°</span>
          <span class="forecast-lo">${fmt(lo)}°</span>
        </div>
        ${avgPop > 0.05 ? `<div class="forecast-pop">💧 ${Math.round(avgPop * 100)}%</div>` : ''}
      </div>`;
  }).join('');
  $('forecastGrid').innerHTML = forecastHTML;
}

// ── Render Air Quality ─────────────────────────────
function renderAirQuality(data) {
  try {
    const aqi    = data.list[0].main.aqi;          // 1–5
    const comp   = data.list[0].components;
    const info   = AQI_DATA[aqi - 1] || AQI_DATA[0];
    const ring   = $('aqiRing');

    $('aqiValue').textContent = aqi;
    $('aqiLabel').textContent = info.label;
    $('aqiDesc').textContent  = info.desc;

    ring.className = `aqi-ring ${info.cls}`;

    $('pm25').textContent = `${comp.pm2_5.toFixed(1)} µg`;
    $('pm10').textContent = `${comp.pm10.toFixed(1)} µg`;
    $('co').textContent   = `${comp.co.toFixed(0)} µg`;
    $('no2').textContent  = `${comp.no2.toFixed(1)} µg`;
    $('o3').textContent   = `${comp.o3.toFixed(1)} µg`;
    $('so2').textContent  = `${comp.so2.toFixed(1)} µg`;
  } catch (e) {
    // Air quality data unavailable — silently skip
  }
}

// ── Check API banner ───────────────────────────────
async function checkApiBanner() {
  try {
    const res = await fetch('/api/weather?city=test');
    const json = await res.json();
    if (json.error && json.error.includes('API key')) {
      apiBanner.style.display = 'flex';
    }
  } catch (_) {}
}

// ── Main Search ────────────────────────────────────
async function searchCity(cityOrOptions) {
  closeAutocomplete();
  showLoader();

  try {
    let weatherUrl, forecastUrl;

    if (typeof cityOrOptions === 'object' && cityOrOptions.lat) {
      const { lat, lon } = cityOrOptions;
      weatherUrl  = `/api/weather?lat=${lat}&lon=${lon}&units=${state.unit}`;
      forecastUrl = `/api/forecast?lat=${lat}&lon=${lon}&units=${state.unit}`;
    } else {
      const city = encodeURIComponent(cityOrOptions);
      weatherUrl  = `/api/weather?city=${city}&units=${state.unit}`;
      forecastUrl = `/api/forecast?city=${city}&units=${state.unit}`;
      state.lastCity = cityOrOptions;
    }

    // Fetch weather + forecast in parallel
    const [weatherData, forecastData] = await Promise.all([
      apiFetch(weatherUrl),
      apiFetch(forecastUrl),
    ]);

    renderCurrent(weatherData);
    renderForecast(forecastData, forecastData.city?.timezone || 0);
    showWeather();
    spawnParticles();

    // Fetch air quality (non-blocking)
    if (state.lastLat !== null) {
      apiFetch(`/api/air-quality?lat=${state.lastLat}&lon=${state.lastLon}`)
        .then(renderAirQuality)
        .catch(() => {});
    }

    // Scroll to results smoothly
    setTimeout(() => {
      weatherContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);

  } catch (err) {
    const msg = err.message || 'Something went wrong.';
    if (msg.toLowerCase().includes('api key')) {
      showError('API Key Missing', 'Add your OpenWeatherMap key to .env and restart the server.');
      apiBanner.style.display = 'flex';
    } else if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('city not found')) {
      showError('City Not Found', `We couldn't find "${state.lastCity || 'that location'}". Please check the spelling.`);
    } else {
      showError('Something Went Wrong', msg);
    }
  }
}

// ── Autocomplete ───────────────────────────────────
function closeAutocomplete() {
  autocompleteList.classList.remove('open');
  autocompleteList.innerHTML = '';
}

async function fetchAutocomplete(query) {
  try {
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!data.length) { closeAutocomplete(); return; }

    autocompleteList.innerHTML = data.map((item, i) => {
      const label = [item.name, item.state, item.country].filter(Boolean).join(', ');
      return `<li data-lat="${item.lat}" data-lon="${item.lon}" data-name="${item.name}" tabindex="0">
        <i class="fa-solid fa-location-dot"></i> ${label}
      </li>`;
    }).join('');

    autocompleteList.classList.add('open');

    autocompleteList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        cityInput.value = li.dataset.name;
        closeAutocomplete();
        searchCity({ lat: li.dataset.lat, lon: li.dataset.lon });
      });
    });
  } catch (_) {
    closeAutocomplete();
  }
}

// ── Geolocation ────────────────────────────────────
function useMyLocation() {
  if (!navigator.geolocation) {
    showError('Geolocation Unavailable', 'Your browser does not support geolocation.');
    return;
  }
  locationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  navigator.geolocation.getCurrentPosition(
    pos => {
      locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
      searchCity({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    () => {
      locationBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
      showError('Location Denied', 'Please allow location access or search manually.');
    }
  );
}

// ── Unit Toggle ────────────────────────────────────
function toggleUnit() {
  state.unit = state.unit === 'metric' ? 'imperial' : 'metric';
  unitLabel.textContent = state.unit === 'metric' ? '°C' : '°F';

  // Re-fetch with new unit if we have a city/coords
  if (state.lastLat) {
    searchCity({ lat: state.lastLat, lon: state.lastLon });
  } else if (state.lastCity) {
    searchCity(state.lastCity);
  }
}

// ── Event Listeners ────────────────────────────────
searchBtn.addEventListener('click', () => {
  const val = cityInput.value.trim();
  if (val) searchCity(val);
});

cityInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = cityInput.value.trim();
    if (val) searchCity(val);
  }
  if (e.key === 'Escape') closeAutocomplete();
  if (e.key === 'ArrowDown') {
    const first = autocompleteList.querySelector('li');
    if (first) first.focus();
  }
});

cityInput.addEventListener('input', () => {
  const val = cityInput.value.trim();
  clearTimeout(state.autocompleteTimer);
  if (val.length < 2) { closeAutocomplete(); return; }
  state.autocompleteTimer = setTimeout(() => fetchAutocomplete(val), 300);
});

// Keyboard navigation in autocomplete
autocompleteList.addEventListener('keydown', e => {
  const items = [...autocompleteList.querySelectorAll('li')];
  const idx = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' && idx < items.length - 1) items[idx + 1].focus();
  if (e.key === 'ArrowUp') {
    if (idx > 0) items[idx - 1].focus();
    else cityInput.focus();
  }
  if (e.key === 'Enter' && idx >= 0) items[idx].click();
  if (e.key === 'Escape') { closeAutocomplete(); cityInput.focus(); }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) closeAutocomplete();
});

locationBtn.addEventListener('click', useMyLocation);
unitToggle.addEventListener('click', toggleUnit);

// Quick city pills
document.querySelectorAll('.city-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    cityInput.value = btn.dataset.city;
    searchCity(btn.dataset.city);
  });
});

// ── Init ───────────────────────────────────────────
(function init() {
  spawnParticles();
  checkApiBanner();

  // Auto-load user's location on first visit
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => searchCity({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        // Default to London if geolocation denied
        searchCity('London');
      },
      { timeout: 5000 }
    );
  } else {
    searchCity('London');
  }
})();
