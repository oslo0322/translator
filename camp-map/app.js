'use strict';
const $ = selector => document.querySelector(selector);
const NS = 'http://www.w3.org/2000/svg';
const API = 'https://camp-map-oslo0322.oslo0322.chatgpt.site/api/entries';
const sites = Array.from({length: 16}, (_, i) => ({
  id: String(i + 1), title: `${i + 1} 號營位`,
  x: i < 7 ? 370 + i * 45 : i < 13 ? 303 + (i - 7) * 42 : 555 + (i - 13) * 75,
  y: i < 7 ? 274 : 414, w: i < 13 ? 40 : 70, h: i < 13 ? 70 : 40,
}));
const areas = [
  {id: 'cabin', title: '小屋區', x: 354, y: 195, w: 186, h: 64, theme: 'cabin'},
  {id: 'military', title: '軍事區', x: 572, y: 160, w: 192, h: 96, theme: 'military'},
  {id: 'lounge1', title: '第一客廳區', x: 163, y: 361, w: 133, h: 52, theme: 'lounge'},
  {id: 'lounge2', title: '第二客廳區', x: 51, y: 276, w: 94, h: 58, theme: 'lounge'},
  {id: 'lounge3', title: '第三客廳區', x: 1, y: 277, w: 42, h: 121, theme: 'lounge narrow'},
  {id: 'lounge4', title: '第四客廳區', x: 53, y: 413, w: 101, h: 58, theme: 'lounge'},
];
const locations = [...sites, ...areas];
const locationById = new Map(locations.map(s => [s.id, s]));
function validate(values) {
  if (!values || Array.isArray(values) || typeof values !== 'object') throw Error('資料格式錯誤');
  const result = {};
  for (const [id, value] of Object.entries(values)) {
    const location = locationById.get(id);
    if (!location || typeof value !== 'string') throw Error('營位或區域代碼錯誤');
    const list = value.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    if (location.theme ? list.length > 10 || list.some(n => n.length > 40) : value.length > 40 || list.length > 1) {
      throw Error(location.theme ? '每區最多 10 位，每個名字最多 40 字' : '營位姓名最多 40 字，請勿換行');
    }
    result[id] = list.join('\n');
  }
  return result;
}
let names = {}, versions = {}, active = null, ready = false, saving = false;
let editVersion = 0, lastSaved = '', debounce, syncing = false;
function status(message, state = '') {
  $('#status').textContent = message;
  $('#status').dataset.state = state;
}
function el(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}
function html(tag, className, text, parent) {
  const node = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}
function bindLocation(node, location) {
  node.addEventListener('click', () => { if (!dragged) openLocation(location); });
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLocation(location); }
  });
}
function draw() {
  $('#sites').replaceChildren();
  for (const s of sites) {
    const group = el('g', {class: 'site' + (names[s.id] ? ' assigned' : ''), role: 'button', tabindex: 0,
      'aria-label': `${s.title}：${names[s.id] || '尚未安排'}`, 'data-id': s.id}, $('#sites'));
    el('rect', {x: s.x, y: s.y, width: s.w, height: s.h, rx: 6}, group);
    el('text', {x: s.x + s.w / 2, y: s.y + (s.h === 70 ? 27 : 17)}, group).textContent = s.id;
    const value = names[s.id] || '';
    const label = el('text', {class: 'person', x: s.x + s.w / 2, y: s.y + (s.h === 70 ? 47 : 32)}, group);
    // Long names wrap into two lines instead of shrinking until unreadable.
    const chars = [...value], perLine = s.h === 70 ? 3 : 5;
    const display = chars.slice(0, perLine * 2);
    if (chars.length > display.length) display[display.length - 1] = '…';
    for (let i = 0; i < display.length; i += perLine) {
      el('tspan', {x: s.x + s.w / 2, dy: i ? 11 : 0}, label).textContent = display.slice(i, i + perLine).join('');
    }
    if (s.h === 40 && chars.length > perLine) label.setAttribute('y', s.y + 27);
    el('title', {}, group).textContent = `${s.title}：${value || '尚未安排'}`;
    bindLocation(group, s);
  }
  $('#areas').replaceChildren();
  for (const a of areas) {
    const list = (names[a.id] || '').split('\n').filter(Boolean);
    const group = el('g', {class: 'area ' + a.theme, role: 'button', tabindex: 0,
      'aria-label': `${a.title}：${list.join('、') || '尚未安排'}`, 'data-id': a.id}, $('#areas'));
    const foreign = el('foreignObject', {x: a.x, y: a.y, width: a.w, height: a.h}, group);
    const card = html('div', 'area-card ' + a.theme + ' ' + a.id + (list.length ? ' filled' : ''), '', foreign);
    const heading = html('div', 'area-title', '', card);
    html('strong', '', a.title, heading);
    if (list.length) html('span', 'area-count', `${list.length} 人`, heading);
    const chips = html('div', 'name-chips', '', card);
    if (!list.length) html('span', 'area-empty', '＋ 填寫姓名', chips);
    list.slice(0, 5).forEach(name => html('span', 'name-chip', name, chips));
    if (list.length > 5) html('span', 'name-chip more', `＋${list.length - 5}`, chips);
    el('title', {}, group).textContent = `${a.title}：${list.join('、') || '尚未安排'}`;
    bindLocation(group, a);
  }
  $('#occupied').textContent = sites.filter(s => names[s.id]).length;
  $('#area-cards').replaceChildren();
  for (const area of areas) {
    const list = (names[area.id] || '').split('\n').filter(Boolean);
    const card = document.createElement('button'); card.type = 'button'; card.className = 'roster-card ' + area.theme;
    card.dataset.id = area.id;
    const heading = document.createElement('div'); heading.className = 'roster-heading';
    const title = document.createElement('strong'); title.textContent = area.title;
    const count = document.createElement('span'); count.textContent = list.length ? `${list.length} 位同行` : '尚未安排';
    heading.append(title, count); card.append(heading);
    const chips = document.createElement('div'); chips.className = 'roster-names';
    if (!list.length) { const empty = document.createElement('span'); empty.className = 'roster-empty'; empty.textContent = '＋ 新增同行的人'; chips.append(empty); }
    for (const name of list) { const chip = document.createElement('span'); chip.textContent = name; chips.append(chip); }
    card.append(chips); card.setAttribute('aria-label', `編輯${area.title}名單`);
    card.onclick = () => openLocation(area); $('#area-cards').append(card);
  }
  $('#area-summary').textContent = `${areas.filter(s => names[s.id]).length} / 6 區域已安排`;
}
// All shared data access stays in this adapter; the GitHub Pages frontend is buildless.
const storage = {
  async read() {
    const response = await fetch(API, {cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw Error('無法讀取共用名單');
    const data = await response.json();
    return {names: validate(data.names), versions: data.versions};
  },
  async update(changes) {
    const response = await fetch(API, {method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({changes}), signal: AbortSignal.timeout(12000)});
    const data = await response.json();
    if (response.status === 409) { const error = Error('有人剛修改了這個位置，請先查看最新名單再儲存。'); error.conflict = true; throw error; }
    if (!response.ok) throw Error(data.error || '儲存失敗，請稍後重試');
    return data;
  },
};
async function refresh() {
  if (syncing || saving || document.hidden) return;
  syncing = true;
  try {
    const data = await storage.read();
    for (const [id, value] of Object.entries(data.names)) {
      if ((data.versions[id] || 0) >= (versions[id] || 0)) {
        names[id] = value; versions[id] = data.versions[id];
      }
    }
    ready = true;
    draw();
    if (!$('#editor').open) status('● 共用名單已同步', 'ok');
    return true;
  } catch {
    if (!$('#editor').open) status(ready ? '暫時無法同步，請檢查網路' : '無法連上共用名單，請重試', 'error');
    return false;
  } finally { syncing = false; }
}
async function applyChanges(values, expected = versions) {
  if (saving) return false;
  const valid = validate(values);
  saving = true; status('正在儲存到共用名單…');
  try {
    const changes = Object.entries(valid).map(([id, name]) => ({id, name, version: expected[id] || 0}));
    const data = await storage.update(changes);
    // Merge just the rows acknowledged by this write; never revert other users' locations.
    for (const row of data.entries) { names[row.id] = row.name; versions[row.id] = row.revision; }
    draw(); status('● 已儲存，大家都看得到', 'ok');
    return true;
  } catch (error) {
    status(error.message, 'error');
    $('#edit-error').textContent = error.message;
    if (error.conflict) $('#reload-edit').hidden = false;
    return false;
  } finally { saving = false; }
}
function editorField() { return active?.theme ? $('#group-names') : $('#name'); }
function openLocation(location) {
  if (!ready) { status('請先連上共用名單，再編輯姓名', 'error'); refresh(); return; }
  active = location; editVersion = versions[active.id] || 0; lastSaved = names[active.id] || '';
  $('#site-title').textContent = location.title;
  $('#dimensions').textContent = location.theme ? '一起出發的人，一行填一個名字。' : `${location.w / 10} × ${location.h / 10} 公尺 · 28 平方公尺`;
  $('#name').hidden = !!location.theme; $('#group-names').hidden = !location.theme;
  $('#group-help').hidden = !location.theme;
  $('#name-label').htmlFor = location.theme ? 'group-names' : 'name';
  $('#name-label').textContent = location.theme ? '同行名單' : '露營者姓名';
  $('#edit-error').textContent = ''; $('#reload-edit').hidden = true;
  editorField().value = lastSaved; $('#editor').showModal(); editorField().focus();
}
async function saveEditor() {
  clearTimeout(debounce);
  if (!active) return true;
  // A blur / submit may arrive while autosave is in flight. Preserve this draft and wait.
  while (saving) await new Promise(resolve => setTimeout(resolve, 50));
  let value;
  try { value = validate({[active.id]: editorField().value})[active.id]; }
  catch (error) { $('#edit-error').textContent = error.message; return false; }
  if (value === lastSaved) { status('● 共用名單已同步', 'ok'); return true; }
  const id = active.id;
  if (await applyChanges({[id]: value}, {[id]: editVersion})) {
    lastSaved = value; editVersion = versions[id]; $('#edit-error').textContent = '';
    return true;
  }
  return false;
}
for (const selector of ['#name', '#group-names']) $(selector).addEventListener('input', () => {
  clearTimeout(debounce); $('#edit-error').textContent = ''; status('有修改，正在準備儲存…');
  debounce = setTimeout(saveEditor, 550);
});
$('#edit-form').addEventListener('submit', async event => { event.preventDefault(); if (await saveEditor()) $('#editor').close(); });
$('#delete').onclick = async () => { editorField().value = ''; await saveEditor(); editorField().focus(); };
$('#reload-edit').onclick = async () => {
  if (editorField().value !== lastSaved && !confirm('重新載入會放棄這次尚未儲存的修改，是否繼續？')) return;
  clearTimeout(debounce);
  if (!await refresh()) { $('#edit-error').textContent = '無法讀取最新名單，請檢查網路後再試。'; return; }
  editVersion = versions[active.id] || 0; lastSaved = names[active.id] || ''; editorField().value = lastSaved;
  $('#reload-edit').hidden = true; $('#edit-error').textContent = '';
};
$('#editor').addEventListener('cancel', async event => { event.preventDefault(); if (await saveEditor()) $('#editor').close(); });
$('#close-editor').onclick = () => {
  clearTimeout(debounce);
  if (saving) { status('正在儲存，請稍候'); return; }
  if (editorField().value !== lastSaved && !confirm('尚有未儲存內容，確定放棄並關閉？')) return;
  $('#editor').close();
};
$('#clear').onclick = async () => {
  if (!ready || saving) return;
  if (confirm('確定要清空所有營位、小屋、軍事區和客廳姓名？這會影響所有人，建議先匯出備份。') &&
      confirm('再次確認：共用名單清空後無法復原，確定繼續？')) {
    await applyChanges(Object.fromEntries(locations.map(s => [s.id, ''])));
  }
};
$('#sync').onclick = refresh;
function csvRows(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell!=='')throw Error('CSV 引號格式錯誤');else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('CSV 引號未關閉');row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows}

$('#export').onclick = () => {
  if (!ready) { status('請先同步共用名單後再匯出', 'error'); return; }
  const quote = v => '"' + String(v).replaceAll('"', '""') + '"';
  const csv = '\ufeff營位編號,姓名\r\n' + locations.map(s => [s.id, names[s.id] || ''].map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = 'camp-map.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); status('CSV 已匯出');
};
$('#import').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (!ready) throw Error('請先連上共用名單');
    if (file.size > 100000) throw Error('CSV 檔案過大');
    const rows = csvRows((await file.text()).replace(/^\uFEFF/, ''));
    if (rows[0]?.[0] === '營位編號' && rows[0]?.[1] === '姓名') rows.shift();
    if (!rows.length) throw Error('CSV 沒有資料');
    const next = {}, seen = new Set();
    for (const row of rows) {
      if (row.length !== 2 || seen.has(row[0])) throw Error('CSV 欄位錯誤或位置重複');
      seen.add(row[0]); next[row[0]] = row[1];
    }
    const valid = validate(next);
    if (confirm(`匯入 ${rows.length} 個位置，將覆蓋共用名單中的對應姓名，所有人都看得到，是否繼續？`)) await applyChanges(valid);
  } catch (error) { status('匯入失敗：' + error.message, 'error'); }
  finally { event.target.value = ''; }
};
let legacy = {};
try {
  legacy = validate(JSON.parse(localStorage.getItem('camp-map.names.v1') || '{}'));
  if (Object.values(legacy).some(Boolean)) $('#legacy').hidden = false;
} catch { /* Old local data is left untouched. */ }
$('#migrate').onclick = async () => {
  if (!ready) return;
  const values = Object.fromEntries(Object.entries(legacy).filter(([, value]) => value));
  if (confirm('將此瀏覽器舊名單匯入共用名單，覆蓋對應位置並讓所有人看見，是否繼續？') && await applyChanges(values)) $('#legacy').hidden = true;
};
for (const [x, y] of [[43,137],[130,148],[157,189],[307,188],[305,125],[244,142],[242,178],[565,156],[628,136],[159,257],[45,249]]) {
  el('use', {href: '#tree', transform: `translate(${x} ${y}) scale(.8)`}, $('#trees'));
}
for (const [x, y] of [[320,284],[550,270],[636,270],[343,484],[429,484],[511,484],[612,456]]) {
  el('circle', {cx: x, cy: y, r: 5}, $('#utilities'));
}
const viewport = $('#viewport'), map = $('#map');
const HOME = {x: -8, y: 112, w: 818, h: 408};
let box = {...HOME}, dragged = false;
const pointers = new Map(); let gesture = null;
function renderBox() { map.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); }
function zoom(factor, cx = .5, cy = .5) {
  const w = Math.max(180, Math.min(HOME.w, box.w * factor)), h = w * HOME.h / HOME.w;
  box = {x: box.x + (box.w - w) * cx, y: box.y + (box.h - h) * cy, w, h}; renderBox();
}
$('#plus').onclick = () => zoom(.8); $('#minus').onclick = () => zoom(1.25);
$('#reset').onclick = () => { box = {...HOME}; renderBox(); };
function point(event) {
  const rect = map.getBoundingClientRect();
  return {x: event.clientX, y: event.clientY, scale: Math.min(rect.width / box.w, rect.height / box.h)};
}
function baseline() {
  const p = [...pointers.values()];
  gesture = {points: p, box: {...box}, distance: p.length === 2 ? Math.hypot(p[1].x-p[0].x, p[1].y-p[0].y) : 0};
}
viewport.addEventListener('pointerdown', event => {
  if (!pointers.size) dragged = false;
  pointers.set(event.pointerId, point(event)); baseline();
});
viewport.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, point(event));
  const p = [...pointers.values()], a = gesture.points[0];
  if (Math.hypot(p[0].x-a.x, p[0].y-a.y) > 5 || p.length > 1) dragged = true;
  if (!dragged) return;
  box = {...gesture.box};
  if (p.length === 2 && gesture.points.length === 2) {
    zoom(gesture.distance / Math.max(1, Math.hypot(p[1].x-p[0].x, p[1].y-p[0].y)));
  }
  box.x -= (p[0].x-a.x) / a.scale; box.y -= (p[0].y-a.y) / a.scale; renderBox();
});
function end(event) { pointers.delete(event.pointerId); if (pointers.size) baseline(); }
window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
viewport.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.12 : .89); }, {passive: false});
window.addEventListener('beforeunload', event => {
  if (saving || ($('#editor').open && editorField().value !== lastSaved)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('focus', refresh);
setInterval(refresh, 5000);
draw(); status('正在連接共用名單…'); refresh();
