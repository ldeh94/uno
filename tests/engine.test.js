// Tests für die Spiel-Engine. Aufruf: node --test tests/
// Die Engine steckt in index.html zwischen den Markern ENGINE-START und ENGINE-END.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
assert.ok(m, 'Engine-Marker in index.html nicht gefunden');
const mod = { exports: {} };
new Function('module', m[1] + '\nreturn module.exports;')(mod);
const E = mod.exports;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mk = (n, opts) => E.newGame({
  players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, human: false })),
  stack: !!(opts && opts.stack), target: (opts && opts.target) || 0
}, (opts && opts.rng) || mulberry32(1));

// Spielzustand von Hand setzen, um einzelne Regeln gezielt zu prüfen
function setup(n, { hands, top, color, cur = 0, dir = 1, stack = false, draw }) {
  const s = mk(n, { stack });
  let id = 1000;
  const C = (c, v) => ({ id: id++, c, v });
  s.players.forEach((p, i) => { p.hand = (hands[i] || []).map(([c, v]) => C(c, v)); });
  s.discard = [C(top[0], top[1])];
  s.color = color || (top[0] === 'w' ? 'r' : top[0]);
  s.cur = cur; s.dir = dir; s.pending = 0; s.pendingType = null; s.phase = 'turn';
  s.drawnId = null; s.uno = s.players.map(() => false);
  s.draw = (draw || Array.from({ length: 30 }, () => ['b', '1'])).map(([c, v]) => C(c, v));
  return s;
}
const total = (s) => s.draw.length + s.discard.length + s.players.reduce((a, p) => a + p.hand.length, 0);

test('Deck: 108 Karten mit korrekter Verteilung', () => {
  const d = E.makeDeck();
  assert.equal(d.length, 108);
  assert.equal(new Set(d.map(c => c.id)).size, 108);
  for (const c of E.COLORS) {
    const of = d.filter(x => x.c === c);
    assert.equal(of.length, 25);
    assert.equal(of.filter(x => x.v === '0').length, 1);
    for (let n = 1; n <= 9; n++) assert.equal(of.filter(x => x.v === String(n)).length, 2);
    for (const v of ['S', 'R', 'D']) assert.equal(of.filter(x => x.v === v).length, 2);
  }
  assert.equal(d.filter(x => x.v === 'W').length, 4);
  assert.equal(d.filter(x => x.v === 'F').length, 4);
});

test('Start: 7 Karten pro Spieler, 108 Karten insgesamt, Startkarte ist keine +4', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const n of [2, 3, 4]) {
      const s = mk(n, { rng: mulberry32(seed) });
      assert.equal(total(s), 108);
      assert.notEqual(E.topCard(s).v, 'F');
      s.players.forEach((p, i) => {
        const base = 7;
        // Startkarte +2 gibt dem ersten Spieler 2 Karten dazu
        assert.ok(p.hand.length === base || p.hand.length === base + 2, `Spieler ${i}, Seed ${seed}: ${p.hand.length}`);
      });
    }
  }
});

test('Zug-Reihenfolge: Zahl passt nach Farbe oder Wert, sonst nicht', () => {
  const s = setup(3, { hands: [[['r', '5'], ['g', '5'], ['g', '7'], ['w', 'W']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  const ids = s.players[0].hand.map(c => c.id);
  assert.ok(E.canPlay(s, 0, s.players[0].hand[0]));  // gleiche Farbe
  assert.ok(!E.canPlay(s, 0, s.players[0].hand[1])); // grüne 5 auf rote 3
  assert.ok(!E.canPlay(s, 0, s.players[0].hand[2]));
  assert.ok(E.canPlay(s, 0, s.players[0].hand[3])); // Farbwahl immer
  const r = E.play(s, 0, ids[1], null, mulberry32(1));
  assert.equal(r.ok, false);
  assert.ok(r.reason.length > 0);
  assert.equal(s.cur, 0, 'Fehlzug ändert nichts');
});

test('Gleiche Zahl in anderer Farbe darf gelegt werden und ändert die Farbe', () => {
  const s = setup(3, { hands: [[['g', '3'], ['g', '9']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  const r = E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.ok(r.ok);
  assert.equal(s.color, 'g');
  assert.equal(s.cur, 1);
});

test('Nur wer nicht an der Reihe ist, kann nicht spielen', () => {
  const s = setup(3, { hands: [[['r', '1']], [['r', '2']], [['r', '4']]], top: ['r', '3'] });
  const r = E.play(s, 1, s.players[1].hand[0].id, null, mulberry32(1));
  assert.equal(r.ok, false);
});

test('Aussetzen überspringt den nächsten Spieler', () => {
  const s = setup(4, { hands: [[['r', 'S'], ['r', '1']], [['b', '1']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.cur, 2);
});

test('Richtungswechsel dreht die Reihenfolge (3 Spieler)', () => {
  const s = setup(3, { hands: [[['r', 'R'], ['r', '1']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.dir, -1);
  assert.equal(s.cur, 2);
});

test('Richtungswechsel zu zweit wirkt wie Aussetzen', () => {
  const s = setup(2, { hands: [[['r', 'R'], ['r', '1']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.cur, 0);
});

test('+2: Nächster zieht 2 und setzt aus', () => {
  const s = setup(3, { hands: [[['r', 'D'], ['r', '1']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.players[1].hand.length, 3);
  assert.equal(s.cur, 2);
  assert.equal(total(s), 30 + 1 + 2 + 1 + 1);
});

test('+4 ist gesperrt, solange man die aktuelle Farbe hat', () => {
  const s = setup(3, { hands: [[['w', 'F'], ['r', '1']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  assert.ok(!E.canPlay(s, 0, s.players[0].hand[0]));
  s.players[0].hand = s.players[0].hand.filter(c => c.c !== 'r').concat([{ id: 5000, c: 'g', v: '2' }]);
  assert.ok(E.canPlay(s, 0, s.players[0].hand[0]));
});

test('Farbwahl verlangt eine gültige Farbe und setzt sie', () => {
  const s = setup(3, { hands: [[['w', 'W'], ['r', '1']], [['b', '1']], [['b', '1']]], top: ['r', '3'] });
  const id = s.players[0].hand[0].id;
  const bad = E.play(s, 0, id, null, mulberry32(1));
  assert.equal(bad.ok, false);
  assert.equal(bad.needColor, true);
  assert.ok(E.play(s, 0, id, 'g', mulberry32(1)).ok);
  assert.equal(s.color, 'g');
  // Danach muss Grün (oder Farbwahl) gelegt werden
  assert.ok(E.canPlay(s, 1, { id: 1, c: 'g', v: '1' }));
  assert.ok(!E.canPlay(s, 1, { id: 2, c: 'r', v: '1' }));
});

test('Ziehen: passende Karte darf sofort gespielt werden, sonst Zug vorbei', () => {
  const s = setup(2, { hands: [[['g', '1']], [['b', '1']]], top: ['r', '3'], draw: [['b', '2'], ['r', '8']] });
  const r = E.draw(s, 0, mulberry32(1)); // zieht r8, passt
  assert.ok(r.canPlayDrawn);
  assert.equal(s.phase, 'drawn');
  assert.equal(s.cur, 0);
  // Nur die gezogene Karte ist spielbar
  assert.equal(E.legalIds(s, 0).length, 1);
  assert.ok(E.pass(s, 0).ok);
  assert.equal(s.cur, 1);
  const r2 = E.draw(s, 1, mulberry32(1)); // zieht b2, passt nicht auf r3
  assert.ok(!r2.canPlayDrawn);
  assert.equal(s.cur, 0);
});

const R = (n) => mulberry32(n);
const fourCards = [['r', '1'], ['r', '2'], ['r', '4']];

test('Uno: mit einer Restkarte sofort nach dem Ausspielen gibt es noch keine Strafe', () => {
  const s = setup(3, { hands: [[['r', '1'], ['r', '2']], [['b', '1'], ['b', '3']], [['b', '4']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, R(1));
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.unoDue, 0);
  assert.equal(s.cur, 1);
});

test('Uno vergessen: Strafe von 2 Karten, sobald der nächste Spieler seinen Zug macht', () => {
  for (const act of ['play', 'draw']) {
    const s = setup(3, { hands: [[['r', '1'], ['r', '2']], [['r', '9'], ['b', '3'], ['b', '5']], [['b', '4']]], top: ['r', '3'] });
    E.play(s, 0, s.players[0].hand[0].id, null, R(1));
    if (act === 'play') E.play(s, 1, s.players[1].hand[0].id, null, R(1));
    else E.draw(s, 1, R(1));
    assert.equal(s.players[0].hand.length, 3, act);
    assert.equal(s.unoDue, null);
  }
});

test('Uno nach dem Ausspielen gerufen: keine Strafe', () => {
  const s = setup(3, { hands: [[['r', '1'], ['r', '2']], [['r', '9'], ['b', '3']], [['b', '4']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, R(1));
  assert.ok(E.callUno(s, 0), 'mit einer Karte rufbar, auch wenn man nicht am Zug ist');
  assert.equal(s.unoDue, null);
  E.play(s, 1, s.players[1].hand[0].id, null, R(1));
  assert.equal(s.players[0].hand.length, 1);
});

test('Uno vorher mit zwei Karten gerufen: keine Strafe', () => {
  const s = setup(3, { hands: [[['r', '1'], ['r', '2']], [['r', '9'], ['b', '3']], [['b', '4']]], top: ['r', '3'] });
  assert.ok(E.callUno(s, 0));
  E.play(s, 0, s.players[0].hand[0].id, null, R(1));
  assert.equal(s.unoDue, null);
  E.draw(s, 1, R(1));
  assert.equal(s.players[0].hand.length, 1);
});

test('Uno-Ruf geht jederzeit mit höchstens 2 Karten, nicht mit mehr', () => {
  const s = setup(2, { hands: [fourCards, [['b', '1']]], top: ['r', '3'] });
  assert.equal(E.callUno(s, 0), false, '3 Karten');
  s.players[0].hand.pop();
  assert.equal(E.callUno(s, 0), true, '2 Karten');
  assert.equal(E.callUno(s, 1), true, '1 Karte, auch wenn man nicht dran ist');
  s.players[1].hand = [];
  assert.equal(E.callUno(s, 1), false, '0 Karten');
  s.phase = 'over';
  assert.equal(E.callUno(s, 0), false, 'nach Rundenende');
});

test('Uno-Ruf verfällt, wenn man danach wieder Karten bekommt', () => {
  const s = setup(2, { hands: [[['g', '1'], ['g', '2']], [['r', 'D'], ['b', '1']]], top: ['r', '3'], draw: [['b', '2'], ['b', '3'], ['b', '4']] });
  assert.ok(E.callUno(s, 0));
  s.cur = 1;
  E.play(s, 1, s.players[1].hand[0].id, null, R(1)); // +2 für Spieler 0
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.uno[0], false);
});

test('Uno: Spieler mit Aussetzen kommt selbst wieder dran, dann keine Strafe von sich selbst', () => {
  const s = setup(2, { hands: [[['r', 'S'], ['r', '2']], [['b', '1'], ['b', '2']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, R(1)); // Gegner setzt aus, Spieler 0 wieder dran
  assert.equal(s.cur, 0);
  assert.equal(s.unoDue, 0);
  E.draw(s, 0, R(1));
  assert.equal(s.unoDue, null);
  assert.equal(s.players[0].hand.length, 2, 'nur die gezogene Karte, keine Strafe');
});

test('Uno: Strafe auch, wenn der nächste Spieler passt', () => {
  const s = setup(2, { hands: [[['r', '1']], [['b', '1'], ['b', '2']]], top: ['r', '3'] });
  // Spieler 0 hat nur eine Karte und nicht gerufen; Spieler 1 hat gezogen und passt jetzt
  s.unoDue = 0; s.cur = 1; s.phase = 'drawn'; s.drawnId = s.players[1].hand[0].id;
  assert.ok(E.pass(s, 1, R(1)).ok);
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.unoDue, null);
});

test('Uno: Strafkarten kommen vor dem eigenen Ziehen des Nächsten vom Stapel', () => {
  const s = setup(2, { hands: [[['r', '1'], ['r', '2']], [['b', '1']]], top: ['r', '3'], draw: [['b', '5'], ['b', '6'], ['b', '7'], ['r', '8']] });
  E.play(s, 0, s.players[0].hand[0].id, null, R(1));
  E.draw(s, 1, R(1));
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.players[1].hand.length, 2);
});

test('Uno: neue Runde setzt den offenen Uno-Zustand zurück', () => {
  const s = setup(2, { hands: [[['r', '1'], ['r', '2']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, R(1));
  assert.equal(s.unoDue, 0);
  E.nextRound(s, R(2));
  assert.equal(s.unoDue, null);
});

test('Rundenende: Sieger bekommt Punkte der Restkarten', () => {
  const s = setup(3, {
    hands: [[['r', '4']], [['b', '7'], ['g', 'S']], [['w', 'F'], ['y', '2']]], top: ['r', '3']
  });
  const r = E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.ok(r.won);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  assert.equal(s.players[0].score, 7 + 20 + 50 + 2);
  assert.equal(E.play(s, 1, s.players[1].hand[0].id, null, mulberry32(1)).ok, false, 'nach Rundenende kein Zug mehr');
});

test('Letzte Karte +2 lässt den Gegner noch ziehen (Punkte zählen danach)', () => {
  const s = setup(2, { hands: [[['r', 'D']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.players[1].hand.length, 3);
  assert.equal(s.players[0].score, 1 + 1 + 1);
});

test('Spielziel: erreicht eine Punktzahl >= Ziel, gewinnt das Spiel', () => {
  const s = setup(2, { hands: [[['r', '4']], [['w', 'F']]], top: ['r', '3'] });
  s.cfg.target = 50;
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.gameWinner, 0);
});

test('Nächste Runde: Punkte bleiben, Karten neu gegeben, Startspieler wechselt', () => {
  const s = mk(3, { rng: mulberry32(5), target: 500 });
  s.players[1].score = 120;
  const first = s.cur;
  E.nextRound(s, mulberry32(6));
  assert.equal(s.players[1].score, 120);
  assert.equal(s.round, 2);
  assert.equal(total(s), 108);
  assert.notEqual(s.cur, first);
});

test('Stapeln: +2 auf +2 wird weitergereicht, Ziehen löst die Summe aus', () => {
  const s = setup(3, {
    stack: true,
    hands: [[['r', 'D'], ['r', '1']], [['g', 'D'], ['g', '1']], [['b', '1'], ['b', '2']]], top: ['r', '3']
  });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.pending, 2);
  assert.equal(s.cur, 1);
  assert.deepEqual(E.legalIds(s, 1), [s.players[1].hand[0].id], 'nur die +2 ist spielbar');
  E.play(s, 1, s.players[1].hand[0].id, null, mulberry32(1));
  assert.equal(s.pending, 4);
  assert.equal(s.cur, 2);
  const r = E.draw(s, 2, mulberry32(1));
  assert.equal(r.penalty, 4);
  assert.equal(s.players[2].hand.length, 6);
  assert.equal(s.pending, 0);
  assert.equal(s.cur, 0);
});

test('Stapeln: +4 lässt sich nicht auf +2 legen', () => {
  const s = setup(3, {
    stack: true,
    hands: [[['r', 'D'], ['r', '1']], [['w', 'F'], ['g', '1']], [['b', '1']]], top: ['r', '3']
  });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.deepEqual(E.legalIds(s, 1), []);
});

test('Stapeln: letzte Karte +2 – Strafkarten werden trotzdem gezogen', () => {
  const s = setup(2, { stack: true, hands: [[['r', 'D']], [['b', '1']]], top: ['r', '3'] });
  E.play(s, 0, s.players[0].hand[0].id, null, mulberry32(1));
  assert.equal(s.players[1].hand.length, 3);
  assert.equal(s.pending, 0);
});

test('Nachziehstapel leer: Ablagestapel wird gemischt, oberste Karte bleibt liegen', () => {
  const s = setup(2, { hands: [[['g', '1']], [['b', '1']]], top: ['r', '3'], draw: [] });
  s.discard = [['r', '1'], ['y', '5'], ['r', '3']].map((x, i) => ({ id: 900 + i, c: x[0], v: x[1] }));
  s.color = 'r';
  const topId = s.discard[2].id;
  E.draw(s, 0, mulberry32(1));
  assert.equal(E.topCard(s).id, topId);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.draw.length, 1);
});

test('Nichts mehr zu ziehen: Spieler passt, Spiel hängt nicht', () => {
  const s = setup(2, { hands: [[['g', '1']], [['b', '1']]], top: ['r', '3'], draw: [] });
  s.discard = [{ id: 900, c: 'r', v: '3' }];
  const r = E.draw(s, 0, mulberry32(1));
  assert.ok(r.ok);
  assert.equal(s.cur, 1);
});

// ---------- Simulation ganzer Partien ----------
function simulate(n, stack, seed) {
  const rng = mulberry32(seed);
  const s = mk(n, { stack, rng, target: 0 });
  let steps = 0;
  const check = () => {
    assert.equal(total(s), 108, `Kartenzahl, Seed ${seed}`);
    const ids = new Set();
    for (const c of [...s.draw, ...s.discard, ...s.players.flatMap(p => p.hand)]) {
      assert.ok(!ids.has(c.id), `doppelte Karte ${c.id}`); ids.add(c.id);
    }
  };
  check();
  while (s.phase !== 'over') {
    assert.ok(++steps < 3000, `Partie endet nicht (Seed ${seed}, ${n} Spieler, stack=${stack})`);
    const p = s.cur;
    const ch = E.botChoose(s, p, rng);
    if (ch.action === 'play') {
      if (s.players[p].hand.length === 2) E.callUno(s, p);
      const r = E.play(s, p, ch.id, ch.color, rng);
      assert.ok(r.ok, `Bot-Zug ungültig: ${r.reason}`);
    } else if (ch.action === 'draw') assert.ok(E.draw(s, p, rng).ok);
    else assert.ok(E.pass(s, p).ok);
    check();
  }
  assert.ok(s.players[s.winner].hand.length === 0);
  const expected = s.players.reduce((a, q, i) => a + (i === s.winner ? 0 : q.hand.reduce((x, c) => x + E.points(c), 0)), 0);
  assert.equal(s.players[s.winner].score, expected);
  return steps;
}

for (const n of [2, 3, 4]) {
  for (const stack of [false, true]) {
    test(`Simulation: 150 Bot-Partien mit ${n} Spielern, Stapeln=${stack}`, () => {
      let max = 0;
      for (let seed = 1; seed <= 150; seed++) max = Math.max(max, simulate(n, stack, seed * 7919));
      assert.ok(max > 0);
    });
  }
}

test('Mehrere Runden bis Spielziel laufen durch', () => {
  const rng = mulberry32(42);
  const s = mk(4, { rng, target: 200 });
  let rounds = 0;
  while (s.gameWinner === null) {
    assert.ok(++rounds < 60, 'Spielziel wird nie erreicht');
    let steps = 0;
    while (s.phase !== 'over') {
      assert.ok(++steps < 3000);
      const p = s.cur;
      const ch = E.botChoose(s, p, rng);
      if (ch.action === 'play') { if (s.players[p].hand.length === 2) E.callUno(s, p); E.play(s, p, ch.id, ch.color, rng); }
      else if (ch.action === 'draw') E.draw(s, p, rng);
      else E.pass(s, p);
    }
    if (s.gameWinner === null) E.nextRound(s, rng);
  }
  assert.ok(s.players[s.gameWinner].score >= 200);
});

// ---------- Online-Sicht ----------
test('Sicht: fremde Hände und Nachziehstapel bleiben verborgen', () => {
  const s = mk(4, { rng: mulberry32(11) });
  for (let seat = 0; seat < 4; seat++) {
    const v = JSON.parse(JSON.stringify(E.makeView(s, seat)));
    v.players.forEach((p, i) => {
      if (i === seat) assert.equal(p.hand.length, s.players[i].hand.length);
      else assert.equal(p.hand, null);
      assert.equal(p.count, s.players[i].hand.length);
    });
    const text = JSON.stringify(v);
    assert.ok(!('draw' in v), 'Nachziehstapel darf nicht übertragen werden');
    // keine Karten-ID eines fremden Spielers im Datenstrom (außer Ablagestapel)
    const visible = new Set([...v.players[seat].hand.map(c => c.id), ...v.discard.map(c => c.id)]);
    s.players.forEach((p, i) => { if (i !== seat) p.hand.forEach(c => { if (!visible.has(c.id)) assert.ok(!text.includes('"id":' + c.id + ','), `Karte ${c.id} von Spieler ${i} geleakt`); }); });
    assert.ok(v.uno.every((u, i) => i === seat || u === false));
  }
});

test('Sicht: Client sieht dieselben spielbaren Karten wie der Host (150 zufällige Zwischenstände)', () => {
  let checked = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rng = mulberry32(seed * 31);
    const n = 2 + (seed % 3);
    const s = mk(n, { stack: seed % 2 === 0, rng });
    let steps = 0;
    while (s.phase !== 'over' && steps++ < 400) {
      for (let seat = 0; seat < n; seat++) {
        const c = E.stateFromView(JSON.parse(JSON.stringify(E.makeView(s, seat))));
        assert.ok(c, 'Sicht ungültig');
        assert.equal(c.cur, s.cur);
        assert.deepEqual(E.legalIds(c, seat), E.legalIds(s, seat));
        assert.equal(E.topCard(c).id, E.topCard(s).id);
        c.players.forEach((p, i) => assert.equal(p.hand.length, s.players[i].hand.length));
        checked++;
      }
      const p = s.cur, ch = E.botChoose(s, p, rng);
      if (ch.action === 'play') { if (s.players[p].hand.length === 2) E.callUno(s, p); E.play(s, p, ch.id, ch.color, rng); }
      else if (ch.action === 'draw') E.draw(s, p, rng); else E.pass(s, p);
    }
    // am Rundenende sind alle Hände sichtbar
    const end = E.stateFromView(JSON.parse(JSON.stringify(E.makeView(s, 0))));
    end.players.forEach((p, i) => assert.deepEqual(p.hand.map(c => c.id).sort(), s.players[i].hand.map(c => c.id).sort()));
    assert.equal(end.winner, s.winner);
  }
  assert.ok(checked > 1000);
});

test('Sicht: manipulierte Daten werden abgelehnt', () => {
  const s = mk(3, { rng: mulberry32(3) });
  const good = () => JSON.parse(JSON.stringify(E.makeView(s, 1)));
  assert.ok(E.stateFromView(good()));
  const bad = [
    (v) => { v.discard[0].v = '<img src=x onerror=alert(1)>'; },
    (v) => { v.discard[0].c = 'x'; },
    (v) => { v.discard = []; },
    (v) => { v.players[1].hand[0].v = 'W'; },       // wild mit Farbe
    (v) => { v.players[0].count = 1e9; },
    (v) => { v.players.push(v.players[0], v.players[0]); },
    (v) => { v.players = [v.players[0]]; },
    (v) => { v.cur = 7; },
    (v) => { v.seat = -1; },
    (v) => { v.dir = 5; },
    (v) => { v.color = 'w'; },
    (v) => { v.phase = 'hacked'; },
    (v) => { v.winner = 9; },
    (v) => { v.drawCount = -1; }
  ];
  bad.forEach((f, i) => { const v = good(); f(v); assert.equal(E.stateFromView(v), null, 'Fall ' + i); });
  for (const junk of [null, undefined, 5, 'x', [], {}]) assert.equal(E.stateFromView(junk), null);
  const v = good(); v.players[0].name = 'A'.repeat(500) + '\u0007x';
  assert.ok(E.stateFromView(v).players[0].name.length <= 14);
});
