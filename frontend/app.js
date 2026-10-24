import { initialize, seasonData, raceData, timingData, available, startDate } from './data.js';
import { driverLaps, compareLaps, median, lapTime } from './analysis.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const main = $('#main');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const calendarMeta = {
  albert_park: ['Австралия', 'Мельбурн', '🇦🇺'], shanghai: ['Китай', 'Шанхай', '🇨🇳'], suzuka: ['Япония', 'Судзука', '🇯🇵'],
  bahrain: ['Бахрейн', 'Сахир', '🇧🇭'], jeddah: ['Саудовская Аравия', 'Джидда', '🇸🇦'], miami: ['Майами', 'Майами', '🇺🇸'],
  imola: ['Эмилия-Романья', 'Имола', '🇮🇹'], monaco: ['Монако', 'Монте-Карло', '🇲🇨'], catalunya: ['Барселона', 'Барселона', '🇪🇸'],
  villeneuve: ['Канада', 'Монреаль', '🇨🇦'], red_bull_ring: ['Австрия', 'Шпильберг', '🇦🇹'], silverstone: ['Великобритания', 'Сильверстоун', '🇬🇧'],
  spa: ['Бельгия', 'Спа-Франкоршам', '🇧🇪'], hungaroring: ['Венгрия', 'Будапешт', '🇭🇺'], zandvoort: ['Нидерланды', 'Зандворт', '🇳🇱'],
  monza: ['Италия', 'Монца', '🇮🇹'], madring: ['Испания', 'Мадрид', '🇪🇸'], madrid: ['Испания', 'Мадрид', '🇪🇸'], baku: ['Азербайджан', 'Баку', '🇦🇿'],
  marina_bay: ['Сингапур', 'Марина-Бэй', '🇸🇬'], americas: ['США', 'Остин', '🇺🇸'], rodriguez: ['Мексика', 'Мехико', '🇲🇽'],
  interlagos: ['Сан-Паулу', 'Сан-Паулу', '🇧🇷'], vegas: ['Лас-Вегас', 'Лас-Вегас', '🇺🇸'], las_vegas: ['Лас-Вегас', 'Лас-Вегас', '🇺🇸'],
  losail: ['Катар', 'Лусаил', '🇶🇦'], yas_marina: ['Абу-Даби', 'Яс-Марина', '🇦🇪'], sepang: ['Малайзия', 'Сепанг', '🇲🇾'],
};
const colors = { mclaren: '#e88928', ferrari: '#d44643', mercedes: '#22a995', red_bull: '#4565b6', aston_martin: '#39877a', alpine: '#d96eb2', williams: '#4984dc', sauber: '#59a85c', audi: '#bf4550', haas: '#8c96a2', rb: '#737cda', racing_bulls: '#737cda', cadillac: '#81768b' };
const color = r => colors[r.Constructor.constructorId] || '#738497';
const meta = r => calendarMeta[r.Circuit.circuitId] || [r.raceName.replace(' Grand Prix', ''), r.Circuit.Location.locality, '🏁'];
const fmtDate = (date, opts = {}) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', ...opts }).format(date).replace(' г.', '').replaceAll('.', '');
const fmtTime = date => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
const fullName = r => `${r.Driver.givenName} ${r.Driver.familyName}`;
const code = r => r.Driver.code || r.Driver.familyName.slice(0, 3).toUpperCase();
const arrow = '<span aria-hidden="true">↗</span>';
const plural = (count, one, few, many) => {
  const n = count % 100, last = count % 10;
  return n >= 11 && n <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
};
let config, year = new Date().getFullYear(), catalog, selectedRace, renderId = 0, activeTab = 'results', filter = 'all', search = '';
let driverA, driverB;
$('.skip').addEventListener('click', e => { e.preventDefault(); main.focus(); main.scrollIntoView(); });

function loading(label) { return `<div class="loading"><span class="spinner"></span><span>${esc(label)}</span></div>`; }
function errorBox(message, retry = true) { return `<div class="empty-state"><span class="empty-icon">↻</span><h3>Пока не удалось загрузить данные</h3><p>${esc(message)}</p>${retry ? '<button class="primary-button" id="retry">Попробовать ещё раз</button>' : ''}</div>`; }
function bindRetry(fn) { $('#retry')?.addEventListener('click', fn); }

function seasonMenu() {
  $('#season-label').textContent = year;
  $('#season-menu').innerHTML = `<div class="menu-label">ВЫБЕРИТЕ СЕЗОН</div>${config.seasons.map(s => `<button class="season-option ${s === year ? 'selected' : ''}" data-season="${s}"><span>${s}</span><span>${s === year ? '✓' : s === config.current ? 'Текущий' : 'Архив'}</span></button>`).join('')}<p>История Pitwall начинается с 2025</p>`;
  document.querySelectorAll('[data-season]').forEach(button => button.addEventListener('click', () => {
    closeMenu();
    filter = 'all'; search = '';
    location.hash = `#/season/${button.dataset.season}`;
  }));
}
function closeMenu() { $('#season-menu').hidden = true; $('#season-button').setAttribute('aria-expanded', 'false'); }
$('#season-button').addEventListener('click', () => {
  const open = $('#season-menu').hidden;
  $('#season-menu').hidden = !open;
  $('#season-button').setAttribute('aria-expanded', String(open));
  if (open) $('.season-option')?.focus();
});
document.addEventListener('click', e => { if (!e.target.closest('.season-picker')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
const dialog = $('#about-dialog');
$('#about-button').addEventListener('click', () => dialog.showModal());
$('.dialog-close').addEventListener('click', () => dialog.close());
$('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

async function route() {
  const token = ++renderId;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const match = location.hash.match(/^#\/season\/(\d{4})(?:\/race\/(\d+))?(?:\?tab=(results|pace|pits|compare))?$/);
  if (location.hash && location.hash !== '#/' && !match) {
    main.innerHTML = errorBox('Страница не найдена. Вернитесь к календарю гонок.', false) + '<a class="back-link" href="#/">← К гонкам</a>';
    return;
  }
  year = match ? Number(match[1]) : config.current;
  if (!config.seasons.includes(year)) { location.hash = '#/'; return; }
  document.title = `Сезон ${year} — Pitwall`;
  seasonMenu();
  main.innerHTML = loading('Загружаем сезон…');
  try {
    catalog = await seasonData(year);
    if (token !== renderId) return;
    if (match?.[2]) {
      const race = catalog.races.find(r => Number(r.round) === Number(match[2]));
      if (!race || !available(race)) {
        main.innerHTML = `<div class="empty-state"><span class="eyebrow">ГОНКА ЕЩЁ НЕ ДОСТУПНА</span><h2>${race ? esc(meta(race)[0]) : 'Гонка не найдена'}</h2><p>${race ? `Старт: ${fmtDate(startDate(race))}, ${fmtTime(startDate(race))}. Статистика откроется после завершения гонки и публикации результата.` : 'Проверьте номер этапа.'}</p><a class="primary-button" href="#/season/${year}">← К календарю</a></div>`;
        return;
      }
      selectedRace = await raceData(year, Number(match[2]), race);
      if (token !== renderId) return;
      activeTab = match[3] || 'results';
      driverA = selectedRace.Results[0]?.Driver.driverId;
      driverB = selectedRace.Results[1]?.Driver.driverId;
      renderRace();
      await renderTab(token);
    } else renderCalendar();
  } catch (e) {
    if (token !== renderId) return;
    main.innerHTML = errorBox(e.message);
    bindRetry(async () => { try { await seasonData(year, true); } catch {} route(); });
  }
}

function renderCalendar() {
  document.title = `Сезон ${year} — Pitwall`;
  selectedRace = null;
  const completed = catalog.races.filter(available).length;
  const upcoming = catalog.races.find(r => startDate(r) > new Date());
  const last = catalog.races.filter(available).at(-1);
  const feature = upcoming || last;
  const featureMeta = feature ? meta(feature) : null;
  main.innerHTML = `
    <section class="calendar-hero">
      <div class="hero-copy"><div class="eyebrow"><span class="tiny-line"></span> СЕЗОН ${year} <span class="eyebrow-dot">/</span> ${year === config.current ? 'В ЦЕНТРЕ ГОНКИ' : 'АРХИВ ГРАН-ПРИ'}</div><h1>Каждая гонка.<br><span>Больше деталей.</span></h1><p>Результаты, гоночный темп и сравнение пилотов.<br>Выберите Гран-при — разберём его по кругам.</p><div class="hero-stat"><span><strong>${String(catalog.races.length).padStart(2, '0')}</strong> ${plural(catalog.races.length, 'этап', 'этапа', 'этапов')} в календаре</span><i></i><span><strong>${String(completed).padStart(2, '0')}</strong> доступны для анализа</span></div></div>
      ${feature ? `<div class="feature-card"><div class="feature-top"><span class="live-dot"></span>${upcoming ? 'СЛЕДУЮЩИЙ ГРАН-ПРИ' : 'ПОСЛЕДНИЙ ГРАН-ПРИ'}<span class="feature-round">R${String(feature.round).padStart(2, '0')}</span></div><div class="feature-content"><span class="feature-flag" aria-hidden="true">${featureMeta[2]}</span><h2>${esc(featureMeta[0])}<span>${esc(featureMeta[1])}</span></h2><div class="feature-date">${fmtDate(startDate(feature), { month: 'long' })}<span>${fmtTime(startDate(feature))} · ваше время</span></div></div><div class="feature-bottom">${upcoming ? '<span>В ожидании зелёных огней</span><span class="start-lights"><i></i><i></i><i></i><i></i><i></i></span>' : `<a href="#/season/${year}/race/${feature.round}">Открыть статистику ${arrow}</a>`}</div><span class="feature-watermark">${year}</span></div>` : ''}
    </section>
    <section class="calendar-section" aria-labelledby="calendar-title"><div class="section-heading"><div><span class="eyebrow">THE RACE CALENDAR</span><h2 id="calendar-title">Календарь гонок <span>${year}</span></h2></div><label class="search-box"><span aria-hidden="true">⌕</span><input id="race-search" type="search" placeholder="Найти Гран-при" value="${esc(search)}" aria-label="Поиск гонки"></label></div><div class="calendar-toolbar"><div class="filters" aria-label="Фильтр гонок"><button data-filter="all">Все этапы <span>${catalog.races.length}</span></button><button data-filter="completed">Прошедшие <span>${completed}</span></button><button data-filter="upcoming">Предстоящие <span>${catalog.races.filter(r => startDate(r) > new Date()).length}</span></button></div><span class="calendar-hint"><span class="status-dot"></span> Статистика после финиша</span></div><div id="race-grid" class="race-grid"></div><div class="source-note"><span>↻ ${catalog.stale ? 'Сохранённые данные от' : 'Календарь проверен'} ${fmtDate(new Date(catalog.updated_at), { year: 'numeric' })}${catalog.stale ? ' · Источник временно недоступен' : ''}</span><span>Время старта — в вашем часовом поясе</span></div></section>
    <aside class="calendar-bottom"><span class="bottom-mark">↗</span><div><h3>Финиш — только начало анализа.</h3><p>Откройте прошедшую гонку, чтобы увидеть то, что осталось за кадром.</p></div><span class="bottom-label">LIGHTS OUT. DATA ON.</span></aside>`;
  renderCards();
  $('#race-search').addEventListener('input', e => { search = e.target.value; renderCards(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; renderCards(); }));
}

function renderCards() {
  const next = catalog.races.find(r => startDate(r) > new Date());
  const races = catalog.races.filter(r => {
    const matches = `${meta(r).join(' ')} ${r.raceName} ${r.Circuit.circuitName} ${r.Circuit.Location.locality}`.toLowerCase().includes(search.toLowerCase().trim());
    return matches && (filter === 'all' || filter === 'completed' && available(r) || filter === 'upcoming' && startDate(r) > new Date());
  });
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); });
  $('#race-grid').innerHTML = races.length ? races.map(r => {
    const unlocked = available(r), future = startDate(r) > new Date(), isNext = r === next, [name, city, flag] = meta(r);
    const inside = `<div class="race-card-top"><span class="round-label">ЭТАП ${String(r.round).padStart(2, '0')}</span><span class="race-flag" aria-hidden="true">${flag}</span></div><div class="race-card-title"><h3>${esc(name)}</h3><p>${esc(city)}</p></div><div class="circuit-name">${esc(r.Circuit.circuitName)}</div><div class="race-card-bottom"><span>${fmtDate(startDate(r))}<span class="card-time">${fmtTime(startDate(r))}</span></span>${unlocked ? `<span class="card-action"><span class="check-circle">✓</span> Статистика <span class="card-arrow">↗</span></span>` : `<span class="locked-label">${isNext ? '<span class="orange-dot"></span> ' : ''}${future ? 'Ожидаем старт' : 'Ждём результат'} <span aria-hidden="true">⌑</span></span>`}</div>`;
    return unlocked ? `<a class="race-card" href="#/season/${year}/race/${r.round}" aria-label="Гран-при ${esc(name)}, ${fmtDate(startDate(r))} — открыть статистику">${inside}</a>` : `<button class="race-card locked ${isNext ? 'next-race' : ''}" disabled aria-label="Гран-при ${esc(name)}, старт ${fmtDate(startDate(r))}, ${fmtTime(startDate(r))}. Недоступно.">${isNext ? '<span class="next-label">СЛЕДУЮЩАЯ ГОНКА</span>' : ''}${inside}</button>`;
  }).join('') : '<div class="no-results"><h3>Такого Гран-при не нашли</h3><p>Попробуйте другое название или измените фильтр.</p><button class="secondary-button" id="clear-search">Сбросить поиск</button></div>';
  $('#clear-search')?.addEventListener('click', () => { search = ''; filter = 'all'; $('#race-search').value = ''; renderCards(); });
}

function renderRace() {
  const race = selectedRace, [name, city, flag] = meta(race), winner = race.Results[0];
  document.title = `Гран-при ${name} ${year} — Pitwall`;
  const fastest = race.Results.find(r => r.FastestLap?.rank === '1');
  const laps = Math.max(...race.Results.map(r => Number(r.laps)));
  const tabs = [['results', 'Результаты', '01'], ['pace', 'Темп гонки', '02'], ['pits', 'Пит-стопы и шины', '03'], ['compare', 'Сравнение пилотов', '04']];
  main.innerHTML = `<a class="back-link" href="#/season/${year}">← Все гонки сезона ${year}</a><section class="race-hero"><div><div class="eyebrow"><span class="tiny-line"></span> ЭТАП ${String(race.round).padStart(2, '0')} <span class="eyebrow-dot">/</span> СЕЗОН ${year}</div><h1><span class="race-title-flag">${flag}</span> Гран-при ${esc(name)}</h1><p>${esc(race.Circuit.circuitName)} <span>·</span> ${esc(city)} <span>·</span> ${fmtDate(startDate(race), { month: 'long', year: 'numeric' })}</p></div><span class="finished-badge"><span class="status-dot"></span> Гонка завершена</span></section><div class="race-summary"><div><span class="summary-label">ПОБЕДИТЕЛЬ</span><strong><i style="background:${color(winner)}"></i>${esc(fullName(winner))}</strong><span>${esc(winner.Constructor.name)}</span></div><div><span class="summary-label">ЛУЧШИЙ КРУГ</span><strong class="mono">${esc(fastest?.FastestLap?.Time?.time || '—')}</strong><span>${fastest ? esc(fullName(fastest)) : 'Нет данных'}</span></div><div><span class="summary-label">ДИСТАНЦИЯ</span><strong>${laps} <small>кругов</small></strong><span>В протоколе: ${race.Results.length} ${plural(race.Results.length, 'пилот', 'пилота', 'пилотов')}</span></div><div class="summary-note"><span class="summary-label">ВАШ ГОНОЧНЫЙ РАЗБОР</span><p>Выберите, что хотите<br>узнать об этой гонке.</p><span class="summary-arrow">↙</span></div></div><nav class="race-tabs" aria-label="Статистика гонки">${tabs.map(([id, label, num]) => `<a href="#/season/${year}/race/${race.round}?tab=${id}" data-tab="${id}" class="${activeTab === id ? 'active' : ''}" ${activeTab === id ? 'aria-current="page"' : ''}><span>${num}</span>${label}</a>`).join('')}</nav><section id="tab-content" aria-live="polite"></section>`;
  // Keep selections and avoid reloading the race when only switching a tab.
  document.querySelectorAll('[data-tab]').forEach(link => link.addEventListener('click', e => {
    e.preventDefault();
    activeTab = link.dataset.tab;
    history.pushState(null, '', link.href);
    document.querySelectorAll('[data-tab]').forEach(a => { a.classList.toggle('active', a === link); if (a === link) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderTab(++renderId);
  }));
}

async function renderTab(token) {
  const content = $('#tab-content');
  if (activeTab === 'results') { renderResults(content); return; }
  content.innerHTML = loading(activeTab === 'pits' ? 'Загружаем пит-стопы и отрезки…' : 'Загружаем покруговку…');
  try {
    if (activeTab === 'pits') {
      const responses = await Promise.allSettled([timingData(year, selectedRace.round, selectedRace, 'pit'), timingData(year, selectedRace.round, selectedRace, 'stints')]);
      if (token !== renderId) return;
      if (responses.every(r => r.status === 'rejected')) throw new Error('Пит-стопы и отрезки пока недоступны. Попробуйте загрузить их снова.');
      renderPits(content, responses[0].status === 'fulfilled' ? responses[0].value : null, responses[1].status === 'fulfilled' ? responses[1].value : null);
    } else {
      const laps = await timingData(year, selectedRace.round, selectedRace);
      if (token !== renderId) return;
      if (activeTab === 'compare') renderComparison(content, laps);
      else renderPace(content, laps);
    }
  } catch (e) {
    if (token !== renderId) return;
    content.innerHTML = errorBox(`${e.message} Результаты гонки доступны в первом разделе.`);
    bindRetry(() => renderTab(++renderId));
  }
}

function renderResults(content) {
  content.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">THE CHEQUERED FLAG</span><h2>Итоговый протокол</h2></div><span class="small-note">${selectedRace.Results.length} ${plural(selectedRace.Results.length, 'пилот', 'пилота', 'пилотов')} · Основная гонка</span></div><div class="table-wrap"><table><thead><tr><th>ПОЗ.</th><th>ПИЛОТ</th><th>КОМАНДА</th><th>СТАРТ</th><th>КРУГИ</th><th>ВРЕМЯ / СТАТУС</th><th>ОЧКИ</th></tr></thead><tbody>${selectedRace.Results.map(r => `<tr><td><span class="position ${Number(r.position) <= 3 ? 'podium-position' : ''}">${esc(r.positionText)}</span></td><td><span class="driver-cell"><i style="background:${color(r)}"></i><span><strong>${esc(fullName(r))}</strong><small>#${esc(r.number)}</small></span></span></td><td><span class="team-name">${esc(r.Constructor.name)}</span></td><td>${r.grid === '0' ? 'PL' : esc(r.grid)}</td><td>${esc(r.laps)}</td><td class="mono result-time">${esc(r.Time?.time || r.status)}</td><td><strong class="points">${esc(r.points)}</strong></td></tr>`).join('')}</tbody></table></div><p class="data-footnote">Источник: Jolpica. Итоговые позиции учитывают опубликованные штрафы. PL — старт с пит-лейна.</p>`;
}

function driverOptions(selected, excluded) {
  return selectedRace.Results.map(r => `<option value="${esc(r.Driver.driverId)}" ${r.Driver.driverId === selected ? 'selected' : ''} ${r.Driver.driverId === excluded ? 'disabled' : ''}>${esc(fullName(r))} · ${esc(r.Constructor.name)}</option>`).join('');
}
function resultById(id) { return selectedRace.Results.find(r => r.Driver.driverId === id); }

function renderPace(content, laps) {
  const r = resultById(driverA), rows = driverLaps(laps, r.number);
  content.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">LAP BY LAP</span><h2>Темп гонки</h2></div><label class="select-label">Пилот<select id="pace-driver">${driverOptions(driverA)}</select></label></div><div class="mini-metrics"><div><span>Лучший доступный круг</span><strong class="mono">${lapTime(rows.length ? Math.min(...rows.map(l => l.lap_duration)) : null)}</strong></div><div><span>Медиана кругов</span><strong class="mono">${lapTime(median(rows.map(l => l.lap_duration)))}</strong></div><div><span>Кругов в расчёте</span><strong>${rows.length}</strong></div></div><div class="chart-panel">${chart([{ rows, label: fullName(r), color: color(r) }])}</div><p class="data-footnote">Источник: OpenF1. Исключены круги без времени и круги выезда из боксов. Круги въезда в боксы, трафик и периоды Safety Car могут влиять на темп. Медиана — середина отсортированного ряда времён.</p>`;
  $('#pace-driver').addEventListener('change', e => { driverA = e.target.value; renderPace(content, laps); });
  bindChart();
}

function renderComparison(content, laps) {
  if (driverA === driverB) driverB = selectedRace.Results.find(r => r.Driver.driverId !== driverA).Driver.driverId;
  const a = resultById(driverA), b = resultById(driverB), analysis = compareLaps(laps, a.number, b.number);
  const comparisonRows = [
    ['Позиция на финише', a.positionText, b.positionText], ['Стартовая позиция', a.grid === '0' ? 'PL' : a.grid, b.grid === '0' ? 'PL' : b.grid],
    ['Очки', a.points, b.points], ['Кругов пройдено', a.laps, b.laps], ['Лучший круг по протоколу', a.FastestLap?.Time?.time || '—', b.FastestLap?.Time?.time || '—'],
    ['Медиана доступных кругов', lapTime(analysis.medianA), lapTime(analysis.medianB)],
  ];
  const delta = analysis.delta;
  content.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">HEAD TO HEAD</span><h2>Два пилота. Одна гонка.</h2></div><span class="small-note">Выберите свою пару для сравнения</span></div><div class="comparison-pickers"><label class="driver-picker" style="--driver-color:${color(a)}"><span>ПИЛОТ 01</span><select id="driver-a">${driverOptions(driverA, driverB)}</select><small>${esc(a.Constructor.name)} <strong>#${esc(a.number)}</strong></small></label><span class="versus">VS</span><label class="driver-picker" style="--driver-color:${color(b)}"><span>ПИЛОТ 02</span><select id="driver-b">${driverOptions(driverB, driverA)}</select><small>${esc(b.Constructor.name)} <strong>#${esc(b.number)}</strong></small></label></div><div class="comparison-insight"><span class="insight-symbol">↔</span><div><strong>${delta === null ? 'Недостаточно общих кругов' : Math.abs(delta) < .0005 ? 'Равный темп на общих кругах' : `${esc(code(delta < 0 ? a : b))} быстрее на ${Math.abs(delta).toFixed(3)} с`}</strong><p>Медианная разница на ${analysis.pairs.length} общих кругах. Без поправки на шины, трафик и Safety Car.</p></div><span class="insight-badge">СРАВНЕНИЕ ТЕМПА</span></div><div class="chart-panel"><div class="chart-heading"><h3>Время круга</h3><span>Меньше — быстрее</span></div>${chart([{ rows: analysis.a, label: fullName(a), color: '#ec633d' }, { rows: analysis.b, label: fullName(b), color: '#4e75ac' }])}</div><div class="comparison-table"><div class="comparison-table-head"><strong>${esc(code(a))}</strong><span>ПОКАЗАТЕЛЬ</span><strong>${esc(code(b))}</strong></div>${comparisonRows.map(([label, av, bv]) => `<div><strong>${esc(av)}</strong><span>${label}</span><strong>${esc(bv)}</strong></div>`).join('')}</div><p class="data-footnote">Итоги: Jolpica · Круги: OpenF1. Исключены круги без времени и круги выезда из боксов. Разница считается только на совпадающих номерах кругов; круги въезда, Safety Car и трафик не исключены. Сравнение не определяет причину разницы в темпе.</p>`;
  $('#driver-a').addEventListener('change', e => { driverA = e.target.value; renderComparison(content, laps); });
  $('#driver-b').addEventListener('change', e => { driverB = e.target.value; renderComparison(content, laps); });
  bindChart();
}

function chart(series) {
  const all = series.flatMap(s => s.rows);
  if (!all.length) return '<div class="no-results"><h3>Нет доступных времён круга</h3><p>Попробуйте выбрать другого пилота.</p></div>';
  const width = 1000, height = 310, left = 64, right = 20, top = 20, bottom = 40;
  const maxLap = Math.max(...all.map(l => l.lap_number));
  const min = Math.floor(Math.min(...all.map(l => l.lap_duration)) - 1);
  const max = Math.ceil(Math.max(...all.map(l => l.lap_duration)) + 1);
  const x = lap => left + ((lap - 1) / Math.max(1, maxLap - 1)) * (width - left - right);
  const y = time => top + (1 - (time - min) / Math.max(1, max - min)) * (height - top - bottom);
  const grid = Array.from({ length: 5 }, (_, i) => { const value = min + (max - min) * i / 4, py = y(value); return `<line x1="${left}" x2="${width-right}" y1="${py}" y2="${py}" stroke="#e9ebef" stroke-dasharray="4 5"/><text x="${left-12}" y="${py+4}" text-anchor="end">${lapTime(value).slice(0, -4)}</text>`; }).join('');
  const labels = [1, ...Array.from({ length: Math.floor(maxLap / 10) }, (_, i) => (i + 1) * 10)].map(l => `<text x="${x(l)}" y="${height-12}" text-anchor="middle">${l}</text>`).join('');
  return `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}<span class="chart-unit">Время круга, мин:с</span></div><div class="chart-scroll"><svg class="lap-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="График времени круга. По горизонтали — номер круга, по вертикали — время. Значения доступны в таблице ниже.">${grid}${labels}${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${s.rows.map(l => `${x(l.lap_number)},${y(l.lap_duration)}`).join(' ')}"/>${s.rows.map(l => `<circle cx="${x(l.lap_number)}" cy="${y(l.lap_duration)}" r="4" fill="${s.color}"><title>${esc(s.label)} · Круг ${l.lap_number} · ${lapTime(l.lap_duration)}</title></circle>`).join('')}`).join('')}<text x="${width-right}" y="${height-12}" text-anchor="end">Круг</text></svg></div><details class="chart-details"><summary>Показать времена кругов в таблице</summary><div class="table-wrap"><table><thead><tr><th>КРУГ</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${Array.from(new Set(all.map(l => l.lap_number))).sort((a,b)=>a-b).map(lap => `<tr><td>${lap}</td>${series.map(s => `<td class="mono">${lapTime(s.rows.find(l=>l.lap_number===lap)?.lap_duration)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function bindChart() { /* SVG titles and the expandable table provide pointer and keyboard access. */ }

function renderPits(content, pits, stints) {
  const byNumber = new Map(selectedRace.Results.map(r => [Number(r.number), r]));
  const sorted = pits ? [...pits].sort((a,b) => Number(a.lap_number)-Number(b.lap_number)) : [];
  const tyres = { SOFT: ['S', '#d85a58'], MEDIUM: ['M', '#d2a525'], HARD: ['H', '#9ba3af'], INTERMEDIATE: ['I', '#4a9b69'], WET: ['W', '#518cc4'] };
  content.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">THE STRATEGY BOARD</span><h2>Пит-стопы и шины</h2></div><span class="small-note">${pits ? `${pits.length} заездов в боксы` : 'Часть данных недоступна'}</span></div>${stints ? `<div class="stints-panel"><div class="chart-heading"><h3>Отрезки на шинах</h3><span class="tyre-legend">${Object.values(tyres).map(([name, shade]) => `<span><i style="background:${shade}">${name}</i></span>`).join('')}</span></div>${selectedRace.Results.map(r => { const rows = stints.filter(s => Number(s.driver_number) === Number(r.number)).sort((a,b)=>a.stint_number-b.stint_number); const total = Math.max(Number(r.laps), ...rows.map(s=>s.lap_end||0), 1); return `<div class="stint-row"><strong>${esc(code(r))}</strong><div class="stint-track">${rows.map(s => { const [label, shade] = tyres[s.compound] || ['?', '#85909f']; const start = Number(s.lap_start)||1, end=Number(s.lap_end)||start; return `<span class="stint" style="left:${(start-1)/total*100}%;width:${Math.max(1,(end-start+1)/total*100)}%;--tyre:${shade}" title="${esc(s.compound)} · Круги ${start}–${end}">${label}<small>${end-start+1}</small></span>`; }).join('')}</div><small>${r.laps}</small></div>`; }).join('')}<p class="data-footnote">S — Soft · M — Medium · H — Hard · I — Intermediate · W — Wet. Ширина отрезков относительна дистанции каждого пилота.</p></div>` : '<p class="inline-warning">Данные по шинам пока недоступны.</p>'}${pits ? `<div class="table-wrap"><table><thead><tr><th>КРУГ</th><th>ПИЛОТ</th><th>ВРЕМЯ В ПИТ-ЛЕЙНЕ</th><th>ОСТАНОВКА</th></tr></thead><tbody>${sorted.map(p => { const r=byNumber.get(Number(p.driver_number)); return `<tr><td>${p.lap_number}</td><td>${r ? esc(fullName(r)) : `#${p.driver_number}`}</td><td class="mono">${Number.isFinite(p.lane_duration ?? p.pit_duration) ? `${(p.lane_duration ?? p.pit_duration).toFixed(3)} с` : '—'}</td><td class="mono">${Number.isFinite(p.stop_duration) ? `${p.stop_duration.toFixed(3)} с` : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="inline-warning">Список пит-стопов пока недоступен.</p>'}<p class="data-footnote">Источник: OpenF1. Время в пит-лейне включает проезд; время неподвижной остановки показано отдельно, если источник его предоставляет.</p>`;
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { /* hashchange handles browser navigation. */ });
try { config = await initialize(); await route(); }
catch (e) { main.innerHTML = errorBox(e.message); bindRetry(() => location.reload()); }
