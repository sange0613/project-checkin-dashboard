export const CATEGORIES = [
  { id: 'work', name: '工作', color: '#aaaaaa' },
  { id: 'entertainment', name: '娱乐', color: '#808080' },
  { id: 'rest', name: '休息', color: '#595959' },
];
const clockDateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const clockTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function clockSnapshot(now = new Date()) {
  const parts = Object.fromEntries(clockDateFormatter.formatToParts(now).map(part => [part.type, part.value]));
  const time = clockTimeFormatter.format(now);
  const [hour, minute] = time.split(':').map(Number);
  return { dateKey: `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`, dateLabel: clockDateFormatter.format(now).replace('日', '日 '), time, minuteOfDay: hour * 60 + minute };
}
export function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const legacy = { study: ['work', '学习'], life: ['entertainment', '生活'], other: ['entertainment', '其他'] }[record.category];
  if (!legacy) return { ...record };
  const title = typeof record.title === 'string' ? record.title : '';
  return { ...record, category: legacy[0], originalCategory: record.originalCategory || record.category, originalTitle: record.originalTitle ?? title, title: title ? `${legacy[1]} · ${title}` : legacy[1] };
}
export function splitInterval(start, end) {
  const pieces = [];
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, (Math.floor(cursor / 15) + 1) * 15);
    pieces.push({ start: cursor, end: next });
    cursor = next;
  }
  return pieces;
}
export function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : h === 24 && m === 0 ? 1440 : NaN;
}
export function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function validateBlock(block, blocks) {
  if (!Number.isInteger(block.start) || !Number.isInteger(block.end) || block.start < 0 || block.end > 1440) return '请输入有效时间，范围为 00:00–24:00。';
  if (block.end <= block.start) return '结束时间需要晚于开始时间；跨午夜请分两天记录。';
  if (!CATEGORIES.some(c => c.id === block.category)) return '请选择一个时间类型。';
  if (blocks.some(b => b.id !== block.id && block.start < b.end && block.end > b.start)) return '这段时间与已有记录重叠，请调整起止时间。';
  return '';
}
export function summarize(blocks) {
  const totals = Object.fromEntries(CATEGORIES.map(c => [c.id, 0]));
  for (const block of blocks) totals[block.category] += block.end - block.start;
  const recorded = Object.values(totals).reduce((a, b) => a + b, 0);
  totals.unrecorded = 1440 - recorded;
  return { recorded, totals };
}
export function averageHistory(store, today) {
  const pastDays = Object.entries(store).filter(([date, blocks]) => date < today && blocks.length > 0);
  const totals = summarize([]).totals;
  if (!pastDays.length) return { days: 0, totals };
  for (const category of CATEGORIES) totals[category.id] = 0;
  for (const [, blocks] of pastDays) {
    const day = summarize(blocks).totals;
    for (const category of CATEGORIES) totals[category.id] += day[category.id];
  }
  for (const category of CATEGORIES) totals[category.id] /= pastDays.length;
  totals.unrecorded = 1440 - CATEGORIES.reduce((sum, category) => sum + totals[category.id], 0);
  return { days: pastDays.length, totals };
}
export function applyCategory(blocks, slot, category, newId) {
  const previous = slot.id ? blocks.find(block => block.id === slot.id) : null;
  const block = { title: '', ...previous, ...slot, id: previous?.id || newId, category };
  const error = validateBlock(block, blocks);
  if (error) return { error };
  return {
    next: previous ? blocks.map(item => item.id === block.id ? block : item) : [...blocks, block],
    error: '',
  };
}
export function clearDay(store, date) {
  return { next: { ...store, [date]: [] }, removed: (store[date] || []).map(record => ({ ...record })) };
}
export function restoreDay(store, date, removed) {
  const merged = [...(store[date] || [])];
  for (const record of removed) {
    if (merged.some(existing => existing.id === record.id)) continue;
    if (validateBlock(record, merged)) return { error: '原时间已有新记录，无法撤销重置。' };
    merged.push({ ...record });
  }
  return { next: { ...store, [date]: merged }, error: '' };
}
export function categoryPalette(totals) {
  const longest = Math.max(...CATEGORIES.map(category => totals[category.id] || 0));
  return CATEGORIES.map(category => ({
    ...category,
    color: longest > 0 && totals[category.id] === longest ? '#ffffff' : category.color,
  }));
}
export function distributionSegments(totals) {
  let offset = 0;
  return [...categoryPalette(totals), { id: 'unrecorded', name: '未记录', color: '#303030' }].map(category => {
    const minutes = totals[category.id];
    const segment = { ...category, minutes, offset, percent: Math.round(minutes / 1440 * 1000) / 10 };
    offset += minutes;
    return segment;
  });
}
export function nextOpenSlot(blocks, preferred = 540) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = 0;
  for (const block of sorted) {
    if (block.start > cursor) gaps.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < 1440) gaps.push({ start: cursor, end: 1440 });
  const selected = gaps.find(g => g.start <= preferred && g.end > preferred) || gaps.find(g => g.start >= preferred) || gaps[0];
  if (!selected) return null;
  const start = selected.start <= preferred && selected.end > preferred ? preferred : selected.start;
  return { start, end: Math.min(start + 60, selected.end) };
}
