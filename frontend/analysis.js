export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function driverLaps(laps, number) {
  return laps.filter(l => Number(l.driver_number) === Number(number) && Number.isFinite(l.lap_duration) && l.lap_duration > 0 && !l.is_pit_out_lap).sort((a, b) => a.lap_number - b.lap_number);
}

export function compareLaps(laps, numberA, numberB) {
  const a = driverLaps(laps, numberA), b = driverLaps(laps, numberB);
  const mapB = new Map(b.map(l => [l.lap_number, l]));
  const pairs = a.filter(l => mapB.has(l.lap_number)).map(l => ({ lap: l.lap_number, a: l.lap_duration, b: mapB.get(l.lap_number).lap_duration }));
  return { a, b, pairs, medianA: median(a.map(l => l.lap_duration)), medianB: median(b.map(l => l.lap_duration)), delta: median(pairs.map(p => p.a - p.b)) };
}

export function lapTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const ms = Math.round(seconds * 1000);
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
