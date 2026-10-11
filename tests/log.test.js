// Tests für das lokale Protokoll (48-Stunden-Bereinigung). Aufruf: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\*LOG-START\*\/([\s\S]*?)\/\*LOG-END\*\//);
assert.ok(m, 'Log-Marker in index.html nicht gefunden');
const mod = { exports: {} };
new Function('module', m[1] + '\nreturn module.exports;')(mod);
const GameLog = mod.exports;

const H = 60 * 60 * 1000;
function fakeStorage(initial) {
  const data = {};
  if (initial !== undefined) data[GameLog.KEY] = initial;
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}
function mk(storage, startAt = 1_000_000_000_000) {
  const clock = { t: startAt };
  const queue = [];
  const log = GameLog.create(storage, () => clock.t, (fn) => queue.push(fn));
  return { log, clock, runQueue: () => { while (queue.length) queue.shift()(); }, queue };
}
const stored = (st) => JSON.parse(st.data[GameLog.KEY] || '[]');

test('Konstanten: 48 Stunden', () => {
  assert.equal(GameLog.MAX_AGE, 48 * H);
});

test('Beim Laden werden Einträge älter als 48 Stunden gelöscht und der Speicher bereinigt', () => {
  const now = 1_000_000_000_000;
  const st = fakeStorage(JSON.stringify([
    { t: now - 49 * H, m: 'alt 49h' },
    { t: now - 48 * H - 1, m: 'alt knapp' },
    { t: now - 48 * H, m: 'genau 48h' },
    { t: now - 47 * H, m: 'neu 47h' },
    { t: now - 1000, m: 'frisch' }
  ]));
  const { log } = mk(st, now);
  assert.deepEqual(log.entries().map((e) => e.m), ['genau 48h', 'neu 47h', 'frisch']);
  assert.deepEqual(stored(st).map((e) => e.m), ['genau 48h', 'neu 47h', 'frisch'], 'bereinigte Liste sofort gespeichert');
});

test('Im laufenden Betrieb: Einträge, die älter als 48 Stunden werden, verschwinden beim nächsten Schreiben', () => {
  const st = fakeStorage();
  const { log, clock, runQueue } = mk(st);
  log.add('erster');
  clock.t += 30 * H;
  log.add('zweiter');
  runQueue();
  assert.equal(stored(st).length, 2);
  clock.t += 19 * H;        // erster ist jetzt 49 h alt
  log.add('dritter');
  runQueue();
  assert.deepEqual(stored(st).map((e) => e.m), ['zweiter', 'dritter']);
  clock.t += 100 * H;       // alles uralt, ein neuer Eintrag bleibt
  log.add('vierter');
  runQueue();
  assert.deepEqual(stored(st).map((e) => e.m), ['vierter']);
});

test('text() zeigt nie Einträge über 48 Stunden, auch ohne vorheriges Schreiben', () => {
  const st = fakeStorage();
  const { log, clock } = mk(st);
  log.add('wird alt');
  clock.t += 49 * H;
  const t = log.text();
  assert.ok(!t.includes('wird alt'));
  assert.match(t, /0 Einträge/);
});

test('Schreiben wird gebündelt (nicht bei jedem Eintrag)', () => {
  const st = fakeStorage();
  let writes = 0;
  const orig = st.setItem; st.setItem = (k, v) => { writes++; orig(k, v); };
  const { log, runQueue, queue } = mk(st);
  for (let i = 0; i < 100; i++) log.add('e' + i);
  assert.equal(queue.length, 1);
  assert.equal(writes, 0);
  runQueue();
  assert.equal(writes, 1);
  assert.equal(stored(st).length, 100);
});

test('Obergrenze: höchstens MAX_ENTRIES, die neuesten bleiben', () => {
  const st = fakeStorage();
  const { log, runQueue } = mk(st);
  for (let i = 0; i < GameLog.MAX_ENTRIES + 500; i++) log.add('e' + i);
  runQueue();
  const s = stored(st);
  assert.equal(s.length, GameLog.MAX_ENTRIES);
  assert.equal(s[s.length - 1].m, 'e' + (GameLog.MAX_ENTRIES + 499));
  assert.equal(s[0].m, 'e500');
});

test('Kaputter oder fremder Speicherinhalt führt nicht zum Absturz', () => {
  for (const bad of ['{kaputt', '"text"', '42', 'null', '{"a":1}', '[1,2,"x",{"t":"x","m":1},null]']) {
    const { log } = mk(fakeStorage(bad));
    assert.equal(log.count(), 0, bad);
    log.add('geht trotzdem');
    assert.equal(log.count(), 1);
  }
});

test('Speicher nicht verfügbar oder voll: kein Fehler, Spiel läuft weiter', () => {
  const broken = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('voll'); } };
  const { log, runQueue } = mk(broken);
  assert.doesNotThrow(() => { log.add('x'); runQueue(); log.clear(); log.text(); });
});

test('Speicher voll: älteste Hälfte wird verworfen und es wird erneut geschrieben', () => {
  const st = fakeStorage();
  let fail = true;
  const orig = st.setItem;
  st.setItem = (k, v) => { if (fail && JSON.parse(v).length > 10) throw new Error('Quota'); orig(k, v); };
  const { log, runQueue } = mk(st);
  for (let i = 0; i < 20; i++) log.add('e' + i);
  runQueue();
  const s = stored(st);
  assert.ok(s.length <= 10 && s.length > 0);
  assert.equal(s[s.length - 1].m, 'e19');
});

test('Lange Einträge werden gekürzt, text() hat Zeitstempel im ISO-Format', () => {
  const st = fakeStorage();
  const { log, clock } = mk(st, Date.UTC(2026, 9, 11, 12, 0, 0));
  log.add('x'.repeat(1000));
  assert.equal(log.entries()[0].m.length, 400);
  const lines = log.text().trim().split('\n');
  assert.match(lines[1], /^2026-10-11T12:00:00\.000Z {2}x+$/);
});

test('clear() leert Liste und Speicher', () => {
  const st = fakeStorage();
  const { log, runQueue } = mk(st);
  log.add('a'); runQueue();
  log.clear();
  assert.equal(log.count(), 0);
  assert.deepEqual(stored(st), []);
});

test('Zwei Tabs mit gemeinsamem Speicher überschreiben sich nicht', () => {
  const st = fakeStorage();
  const a = mk(st), b = mk(st);
  a.log.add('von A'); a.clock.t += 5; 
  b.clock.t = a.clock.t + 10; b.log.add('von B');
  a.runQueue(); b.runQueue();
  assert.deepEqual(stored(st).map((e) => e.m).sort(), ['von A', 'von B']);
  a.clock.t += 1; a.log.add('A nochmal'); a.runQueue();
  assert.deepEqual(stored(st).map((e) => e.m), ['von A', 'A nochmal', 'von B'], 'nach Zeitstempel sortiert, nichts verloren');
});

test('Zusammenführen entfernt auch fremde Einträge über 48 Stunden', () => {
  const now = 1_000_000_000_000;
  const st = fakeStorage();
  const { log, runQueue } = mk(st, now);
  st.data[GameLog.KEY] = JSON.stringify([{ t: now - 60 * H, m: 'uralt von anderem Tab' }, { t: now - H, m: 'ok von anderem Tab' }]);
  log.add('eigener'); runQueue();
  assert.deepEqual(stored(st).map((e) => e.m), ['ok von anderem Tab', 'eigener']);
});

test('clear() löscht auch, wenn noch ein Schreibvorgang ansteht', () => {
  const st = fakeStorage();
  const { log, runQueue } = mk(st);
  log.add('x'); log.clear(); runQueue();
  assert.deepEqual(stored(st), []);
});
