import { TIME_STEP, CATEGORIES, categoryPalette, applyCategory, minutesToTime, summarize, averageHistory, nextOpenSlot, splitInterval, snapMinute, distributionSegments, clockSnapshot, clearDay, restoreDay } from './model.mjs';
import { TIME_JOURNAL_KEY, normalizeTimeJournal, mergeTimeJournals, updateTimeJournal } from '../src/sync/timeJournalSync.ts';

const $ = id => document.getElementById(id);
const STORAGE_KEY = TIME_JOURNAL_KEY;
const todayKey = () => clockSnapshot().dateKey;
let selectedDate = todayKey();
let journal = normalizeTimeJournal();
let data = journal.days;
let pendingBlock = null;
let pendingDate = selectedDate;
let clockTimer;
let selection = null;
let toastTimer;
let undoAction = null;
let loadIssue = false;

try {
  journal = normalizeTimeJournal(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  data = journal.days;
} catch { loadIssue = true; }

const records = () => data[selectedDate] || [];
const formatDuration = minutes => {
  if (!minutes) return '0 小时';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h ? `${h} 小时` : '', m ? `${m} 分钟` : ''].filter(Boolean).join(' ');
};

function notify(message, undo = null, duration = undo ? 9000 : 4500) {
  clearTimeout(toastTimer);
  $('toast').querySelector('span').textContent = message;
  $('toast').hidden = false;
  $('undo-button').hidden = !undo;
  undoAction = undo;
  toastTimer = setTimeout(() => { $('toast').hidden = true; undoAction = null; }, duration);
}
function persist() {
  try {
    const latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    let deviceId = localStorage.getItem('project-suite-device-id-v1');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('project-suite-device-id-v1', deviceId);
    }
    const next = updateTimeJournal(journal, data, deviceId, Date.now(), latest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    journal = next;
    data = next.days;
    $('storage-status').hidden = true;
    return true;
  } catch {
    $('storage-status').textContent = '暂时无法自动保存，请勿关闭页面';
    $('storage-status').hidden = false;
    notify('浏览器未能保存记录，请检查存储权限或空间。');
    return false;
  }
}
function renderRuler() {
  const cellCount = 1440 / TIME_STEP;
  $('time-grid').style.setProperty('--time-cell-count', cellCount);
  for (let i = 0; i < cellCount; i++) {
    const cell = document.createElement('span');
    cell.className = 'time-cell';
    $('time-grid').append(cell);
  }
  for (let hour = 0; hour <= 24; hour += 2) {
    const label = document.createElement('span');
    label.className = 'hour-label';
    label.style.left = `${hour / 24 * 100}%`;
    label.textContent = String(hour).padStart(2, '0');
    $('hour-labels').append(label);
  }
}
function renderDistribution(totals, { target = 'distribution-chart', average = false, days = 0 } = {}) {
  const segments = distributionSegments(totals);
  const empty = average && days === 0;
  const chart = document.createElement('div');
  chart.className = 'daily-ring';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', empty ? '日均：暂无历史记录' : `${average ? `历史 ${days} 天的日均` : '今天'}，全天 24 小时：${segments.map(s => `${s.name} ${s.percent}%`).join('，')}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('aria-hidden', 'true');
  const legend = document.createElement('ul');
  legend.className = 'distribution-legend';
  for (const segment of segments) {
    if (segment.minutes > 0) {
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      for (const [key, value] of Object.entries({ cx: 100, cy: 100, r: 78, pathLength: 1440, fill: 'none', stroke: segment.color, 'stroke-width': 20, 'stroke-dasharray': `${segment.minutes} ${1440 - segment.minutes}`, 'stroke-dashoffset': -segment.offset, 'data-category': segment.id })) {
        arc.setAttribute(key, String(value));
      }
      svg.append(arc);
    }
    const row = document.createElement('li');
    row.className = 'legend-row';
    row.dataset.category = segment.id;
    row.style.setProperty('--category', segment.color);
    const percent = empty ? '—' : `${segment.percent}%`;
    row.setAttribute('aria-label', `${segment.name}，${average ? '日均' : formatDuration(segment.minutes)}，${percent}`);
    row.innerHTML = `<span class="legend-name"><i class="category-dot"></i>${segment.name}</span>${average ? '' : `<span class="legend-duration">${formatDuration(segment.minutes).replaceAll(' ', '')}</span>`}<span class="legend-percent">${percent}</span>`;
    legend.append(row);
  }
  const center = document.createElement('div');
  center.className = 'daily-ring-center';
  center.setAttribute('aria-hidden', 'true');
  center.innerHTML = `<strong>${average ? (empty ? '—' : days) : '24'}</strong><span>${average ? (empty ? '暂无历史记录' : '天记录') : '小时'}</span>`;
  chart.append(svg, center);
  $(target).replaceChildren(chart, legend);
}
function render() {
  const blocks = [...records()].sort((a, b) => a.start - b.start);
  const { totals } = summarize(blocks);
  const categories = categoryPalette(totals);
  for (const category of categories) {
    document.querySelector(`#category-picker button[data-category="${category.id}"]`).style.setProperty('--category', category.color);
  }
  $('reset-day').disabled = blocks.length === 0;
  $('records-toggle').hidden = blocks.length === 0;
  const listOpen = $('records-toggle').getAttribute('aria-expanded') === 'true';
  $('records-toggle').textContent = listOpen ? '收起记录' : `${blocks.length} 条记录`;
  $('record-list').hidden = !listOpen || blocks.length === 0;
  $('blocks').replaceChildren();
  $('record-list').replaceChildren();
  for (const block of blocks) {
    const category = categories.find(c => c.id === block.category);
    const label = `${minutesToTime(block.start)}–${minutesToTime(block.end)}，${category.name}${block.title ? `，${block.title}` : ''}`;
    const button = document.createElement('button');
    button.className = `time-block${block.end - block.start < 120 ? ' short-block' : ''}`;
    button.style.cssText = `--category:${category.color};left:${block.start / 1440 * 100}%;width:${(block.end - block.start) / 1440 * 100}%`;
    button.setAttribute('aria-label', `编辑 ${label}`);
    button.title = label;
    const name = document.createElement('span');
    name.className = 'block-title';
    name.textContent = block.title && block.end - block.start >= 120 ? `${category.name} · ${block.title}` : category.name;
    const time = document.createElement('span');
    time.className = 'block-time';
    time.textContent = `${minutesToTime(block.start)} – ${minutesToTime(block.end)}`;
    for (const segment of splitInterval(block.start, block.end)) {
      const tile = document.createElement('span');
      tile.className = 'block-tile';
      tile.style.left = `${(segment.start - block.start) / (block.end - block.start) * 100}%`;
      tile.style.width = `max(1px, calc(${(segment.end - segment.start) / (block.end - block.start) * 100}% - var(--time-block-gap)))`;
      tile.setAttribute('aria-hidden', 'true');
      button.append(tile);
    }
    if (block.end - block.start >= 45) button.append(name, time);
    button.addEventListener('click', e => { e.stopPropagation(); openCategoryPicker(block); });
    $('blocks').append(button);

    const row = document.createElement('button');
    row.className = 'record-row';
    row.style.setProperty('--category', category.color);
    const rowTime = document.createElement('span');
    rowTime.className = 'row-time'; rowTime.textContent = time.textContent;
    const rowName = document.createElement('span');
    rowName.className = 'row-name'; rowName.textContent = block.title || category.name;
    const rowCategory = document.createElement('span');
    rowCategory.className = 'row-category';
    const dot = document.createElement('i'); dot.className = 'category-dot';
    rowCategory.append(dot, category.name);
    const rowDuration = document.createElement('span');
    rowDuration.className = 'row-duration'; rowDuration.textContent = formatDuration(block.end - block.start);
    row.append(rowTime, rowName, rowCategory, rowDuration);
    row.addEventListener('click', () => openCategoryPicker(block));
    $('record-list').append(row);
  }
  renderDistribution(totals);
  const history = averageHistory(data, selectedDate);
  renderDistribution(history.totals, { target: 'average-chart', average: true, days: history.days });
}
function updateClock() {
  clearTimeout(clockTimer);
  const now = new Date();
  const clock = clockSnapshot(now);
  $('current-date').textContent = clock.dateLabel;
  $('live-time').textContent = clock.time;
  $('live-time').dateTime = now.toISOString();
  if (selectedDate !== clock.dateKey) {
    closeCategoryPicker();
    selectedDate = clock.dateKey;
    $('records-toggle').setAttribute('aria-expanded', 'false');
    render();
  }
  clockTimer = setTimeout(updateClock, 1000 - Date.now() % 1000);
}
function closeCategoryPicker() {
  pendingBlock = null;
  $('category-picker').hidden = true;
  clearSelection();
}
function showSelection(start, end) {
  const preview = $('selection-preview');
  preview.hidden = start === end;
  preview.style.left = `${start / 1440 * 100}%`;
  preview.style.width = `${(end - start) / 1440 * 100}%`;
  preview.querySelector('span').textContent = `${minutesToTime(start)} – ${minutesToTime(end)}`;
}
function positionCategoryPicker() {
  if (!pendingBlock) return;
  const picker = $('category-picker');
  const section = picker.parentElement.getBoundingClientRect();
  const timelineBounds = $('timeline').getBoundingClientRect();
  const end = timelineBounds.left - section.left + pendingBlock.end / 1440 * timelineBounds.width;
  const width = picker.getBoundingClientRect().width;
  picker.style.left = `${Math.max(2, Math.min(end - width / 2, section.width - width - 2))}px`;
}
function openCategoryPicker(block = null, focus = false) {
  const slot = block || nextOpenSlot(records(), Math.min(1440 - TIME_STEP, Math.floor(clockSnapshot().minuteOfDay / TIME_STEP) * TIME_STEP));
  if (!slot) { notify('这一天已经完整记录。点击已有时间块可以修改。'); return; }
  pendingBlock = { ...slot };
  pendingDate = selectedDate;
  showSelection(slot.start, slot.end);
  const picker = $('category-picker');
  picker.hidden = false;
  positionCategoryPicker();
  for (const button of picker.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(Boolean(slot.id && button.dataset.category === slot.category)));
  }
  if (focus) picker.querySelector('button').focus();
}
window.addEventListener('resize', positionCategoryPicker);
for (const category of CATEGORIES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.category = category.id;
  button.style.setProperty('--category', category.color);
  button.innerHTML = `<i class="category-dot" aria-hidden="true"></i>${category.name}`;
  button.addEventListener('click', () => {
    if (!pendingBlock) return;
    const result = applyCategory(data[pendingDate] || [], pendingBlock, category.id, crypto.randomUUID());
    if (result.error) { notify(result.error); return; }
    const before = data;
    data = { ...data, [pendingDate]: result.next };
    if (!persist()) { data = before; return; }
    closeCategoryPicker();
    render();
    $('timeline').focus({ preventScroll: true });
  });
  $('category-picker').append(button);
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#category-picker, #timeline, #record-list')) closeCategoryPicker();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && pendingBlock) {
    closeCategoryPicker();
    $('timeline').focus({ preventScroll: true });
  }
});
$('undo-button').addEventListener('click', () => undoAction?.());
$('reset-day').addEventListener('click', () => {
  updateClock();
  const date = selectedDate;
  if (!records().length) return;
  const before = data;
  const reset = clearDay(data, date);
  data = reset.next;
  if (!persist()) { data = before; render(); return; }
  $('records-toggle').setAttribute('aria-expanded', 'false');
  closeCategoryPicker(); render();
  notify('今天已重置', () => {
    const restored = restoreDay(data, date, reset.removed);
    if (restored.error) { notify(restored.error); return; }
    const beforeUndo = data;
    data = restored.next;
    if (!persist()) { data = beforeUndo; render(); return; }
    render(); notify('已恢复记录');
  }, 15000);
});
$('records-toggle').addEventListener('click', () => {
  const next = $('records-toggle').getAttribute('aria-expanded') !== 'true';
  $('records-toggle').setAttribute('aria-expanded', String(next)); render();
});
const timeline = $('timeline');
const minuteAt = x => {
  const rect = timeline.getBoundingClientRect();
  return snapMinute((x - rect.left) / rect.width * 1440);
};
function clearSelection() { selection = null; $('selection-preview').hidden = true; }
timeline.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.time-block')) return;
  closeCategoryPicker();
  selection = { start: minuteAt(e.clientX), x: e.clientX, end: minuteAt(e.clientX) };
  timeline.setPointerCapture(e.pointerId);
});
timeline.addEventListener('pointermove', e => {
  if (!selection) return;
  selection.end = minuteAt(e.clientX);
  const start = Math.min(selection.start, selection.end), end = Math.max(selection.start, selection.end);
  showSelection(start, end);
});
timeline.addEventListener('pointerup', e => {
  if (!selection) return;
  const last = minuteAt(e.clientX);
  let start = Math.min(selection.start, last), end = Math.max(selection.start, last);
  if (end === start) {
    start = Math.min(1440 - TIME_STEP, start);
    const next = records().filter(b => b.start > start).sort((a, b) => a.start - b.start)[0];
    end = Math.min(1440, start + TIME_STEP, next?.start || 1440);
  }
  clearSelection();
  if (timeline.hasPointerCapture(e.pointerId)) timeline.releasePointerCapture(e.pointerId);
  openCategoryPicker({ start, end });
});
timeline.addEventListener('pointercancel', clearSelection);
timeline.addEventListener('keydown', e => { if (e.target === timeline && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCategoryPicker(null, true); } });
renderRuler(); render();
updateClock();
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClock(); });
window.addEventListener('pageshow', updateClock);
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  try {
    const incoming = normalizeTimeJournal(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    const merged = mergeTimeJournals(journal, incoming);
    closeCategoryPicker();
    journal = merged;
    data = merged.days;
    render();
    if (JSON.stringify(merged) !== JSON.stringify(incoming)) localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch { notify('暂时无法读取同步记录，请刷新重试。'); }
});
if (loadIssue) notify('浏览器中的旧记录无法读取，请检查浏览器存储。');
