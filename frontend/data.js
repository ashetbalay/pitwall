const CURRENT_YEAR = new Date().getFullYear();
const FIRST_YEAR = 2025;
const memory = new Map();
let backend = false;

export async function json(url, timeout = 18000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Источник недоступен (${response.status})`);
  return response.json();
}

export async function initialize() {
  try {
    const response = await fetch('./api/health', { signal: AbortSignal.timeout(1200) });
    backend = response.ok && response.headers.get('content-type')?.includes('application/json') && (await response.json()).status === 'ok';
  } catch { backend = false; }
  return { current: CURRENT_YEAR, seasons: Array.from({ length: Math.max(0, CURRENT_YEAR - FIRST_YEAR + 1) }, (_, i) => CURRENT_YEAR - i) };
}

export function startDate(race) {
  return new Date(`${race.date}T${race.time || '23:59:59Z'}`);
}

export function available(race) {
  return Boolean(race.available && startDate(race) < new Date());
}

export async function seasonData(year, force = false) {
  if (!force && memory.has(`season-${year}`)) return memory.get(`season-${year}`);
  let data;
  if (backend) {
    data = await json(`./api/seasons/${year}/races`, 45000);
  } else {
    let snapshot;
    try { snapshot = await json(`./data/season-${year}.json`); } catch { /* New season may not have a snapshot. */ }
    try {
      const [calendar, winners] = await Promise.all([
        json(`https://api.jolpi.ca/ergast/f1/${year}/races.json?limit=100`, 6500),
        json(`https://api.jolpi.ca/ergast/f1/${year}/results/1.json?limit=100`, 6500),
      ]);
      const completed = new Set(winners.MRData.RaceTable.Races.map(r => r.round));
      data = { season: year, updated_at: new Date().toISOString(), stale: false, races: calendar.MRData.RaceTable.Races.map(r => {
        const saved = snapshot?.races.find(s => s.round === r.round && s.Circuit.circuitId === r.Circuit.circuitId);
        return { ...saved, ...r, Results: saved?.Results || [], available: completed.has(r.round) && startDate(r) < new Date() };
      }) };
    } catch {
      if (!snapshot) throw new Error('Не удалось загрузить календарь. Проверьте соединение и повторите попытку.');
      data = { ...snapshot, stale: true };
    }
  }
  memory.set(`season-${year}`, data);
  return data;
}

export async function raceData(year, round, race) {
  if (memory.has(`race-${year}-${round}`)) return memory.get(`race-${year}-${round}`);
  let detail;
  if (backend) detail = await json(`./api/seasons/${year}/races/${round}`, 45000);
  else {
    if (race.Results?.length) detail = race;
    else {
      const result = await json(`https://api.jolpi.ca/ergast/f1/${year}/${round}/results.json?limit=100`);
      detail = { ...race, ...result.MRData.RaceTable.Races[0] };
    }
  }
  if (!detail.Results?.length) throw new Error('Результаты ещё не опубликованы. Попробуйте позже.');
  detail = { ...race, ...detail, Results: [...detail.Results].sort((a, b) => Number(a.position) - Number(b.position)) };
  memory.set(`race-${year}-${round}`, detail);
  return detail;
}

export async function timingData(year, round, race, kind = 'laps') {
  const key = `timing-${year}-${round}-${kind}`;
  if (memory.has(key)) return memory.get(key);
  let data;
  if (backend) data = await json(`./api/seasons/${year}/races/${round}/timing?kind=${kind}`, 90000);
  else {
    let sessionKey = race.session_key;
    if (!sessionKey) {
      let sessions = memory.get(`sessions-${year}`);
      if (!sessions) {
        sessions = await json(`https://api.openf1.org/v1/sessions?year=${year}&session_name=Race`);
        memory.set(`sessions-${year}`, sessions);
      }
      const candidates = sessions.filter(s => !s.is_cancelled).sort((a, b) => Math.abs(new Date(a.date_start) - startDate(race)) - Math.abs(new Date(b.date_start) - startDate(race)));
      const match = candidates[0];
      if (!match || Math.abs(new Date(match.date_start) - startDate(race)) > 36 * 3600000) throw new Error('Для этой гонки нет подробной статистики.');
      sessionKey = match.session_key;
    }
    try { data = await json(`./data/timing-${sessionKey}-${kind}.json`, 2000); }
    catch { data = await json(`https://api.openf1.org/v1/${kind}?session_key=${sessionKey}`, 45000); }
  }
  if (!Array.isArray(data)) throw new Error('Источник вернул данные в неизвестном формате.');
  if (!data.length) throw new Error('Подробные данные этой гонки пока недоступны.');
  memory.set(key, data);
  return data;
}
