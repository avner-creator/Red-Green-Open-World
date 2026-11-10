import { describe, expect, it } from 'vitest';
import {
  ConeBuilder,
  FLAVOURS,
  SCOOPS,
  SECRETS,
  StackWobble,
  WOBBLE,
  effectsFor,
  makeRecipe,
  matchesRecipe,
  rng,
  scoreCone,
  secretOfDay,
  ticketFor,
  tilesFor,
} from '../../src/activities/scoops/logic';
import type { Recipe } from '../../src/activities/scoops/logic';

describe('stack wobble', () => {
  it('a settled stack of five never topples when each scoop waits for the wobble', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = new StackWobble(rng(seed));
      for (let n = 1; n <= SCOOPS.maxScoops; n++) {
        w.push(n);
        let fell = false;
        for (let i = 0; i < 600 && !(i > 30 && w.calm()); i++) fell ||= w.step(1 / 60, n);
        expect(fell, `seed ${seed}, scoop ${n}`).toBe(false);
      }
    }
  });

  it('spamming scoops onto a wobbling stack topples it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = new StackWobble(rng(seed));
      let fell = false;
      for (let n = 1; n <= SCOOPS.maxScoops && !fell; n++) {
        w.push(n);
        for (let i = 0; i < 6 && !fell; i++) fell = w.step(1 / 60, n);
      }
      for (let i = 0; i < 120 && !fell; i++) fell = w.step(1 / 60, SCOOPS.maxScoops);
      expect(fell, `seed ${seed}`).toBe(true);
    }
  });

  it('short stacks never topple however hard they are pushed', () => {
    const w = new StackWobble(rng(3));
    for (let i = 0; i < 10; i++) w.push(WOBBLE.keep);
    let fell = false;
    for (let i = 0; i < 600; i++) fell ||= w.step(1 / 60, WOBBLE.keep);
    expect(fell).toBe(false);
  });

  it('settles back to upright and is frame-rate independent', () => {
    const a = new StackWobble(rng(9));
    const b = new StackWobble(rng(9));
    a.push(3);
    b.push(3);
    for (let i = 0; i < 60; i++) a.step(1 / 60, 3);
    for (let i = 0; i < 20; i++) b.step(1 / 20, 3);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.02);
    for (let i = 0; i < 600; i++) a.step(1 / 60, 3);
    expect(a.calm()).toBe(true);
  });
});

describe('cone builder', () => {
  it('walks cone → scoops → sauce → toppings → eat', () => {
    const b = new ConeBuilder(rng(1));
    expect(b.stage).toBe('cone');
    expect(b.choose({ kind: 'cone', id: 'choco' })).toEqual({ type: 'cone', id: 'choco' });
    expect(b.stage).toBe('scoops');
    expect(b.next()).toEqual({ type: 'noop' }); // needs a scoop first
    b.choose({ kind: 'flavour', id: 'mint' });
    b.choose({ kind: 'flavour', id: 'choc' });
    expect(b.scoops).toEqual(['mint', 'choc']);
    expect(b.next()).toEqual({ type: 'stage', stage: 'sauce' });
    b.choose({ kind: 'sauce', id: 'caramel' });
    expect(b.stage).toBe('toppings');
    b.choose({ kind: 'topping', id: 'pickle' });
    expect(b.choose({ kind: 'topping', id: 'pickle' }).type).toBe('noop'); // once each
    b.choose({ kind: 'next' });
    expect(b.stage).toBe('eat');
    expect(b.tiles()).toEqual([]);
  });

  it('caps scoops and toppings and parks the cursor on "next" when full', () => {
    const b = new ConeBuilder(rng(2));
    b.choose({ kind: 'cone', id: 'waffle' });
    for (let i = 0; i < SCOOPS.maxScoops; i++) b.choose({ kind: 'flavour', id: FLAVOURS[i] });
    expect(b.choose({ kind: 'flavour', id: 'mint' })).toEqual({ type: 'full' });
    expect(b.current()).toEqual({ kind: 'next' });
    b.next();
    b.next(); // skip sauce
    expect(b.sauce).toBeNull();
    for (const t of ['worms', 'duck', 'marsh'] as const) b.choose({ kind: 'topping', id: t });
    expect(b.choose({ kind: 'topping', id: 'popcorn' })).toEqual({ type: 'full' });
    expect(b.current()).toEqual({ kind: 'next' });
  });

  it('cursor wraps and lands on the first useful tile of each row', () => {
    const b = new ConeBuilder(rng(4));
    b.move(-1);
    expect(b.selected).toBe(2);
    b.move(1);
    expect(b.selected).toBe(0);
    b.choose();
    expect(b.current()).toEqual({ kind: 'flavour', id: 'vanilla' });
    expect(tilesFor('toppings').length).toBe(6 + SCOOPS.jars + 1);
  });

  it('the right jar gives the secret; a wrong jar moves it and the jars close after two misses', () => {
    for (let seed = 1; seed < 30; seed++) {
      const b = new ConeBuilder(rng(seed));
      b.choose({ kind: 'cone', id: 'waffle' });
      b.choose({ kind: 'flavour', id: 'berry' });
      b.next();
      b.next();
      const first = b.secretJar;
      expect(first).toBeGreaterThanOrEqual(0);
      const wrong = (first + 1) % SCOOPS.jars;
      const r1 = b.choose({ kind: 'jar', index: wrong });
      expect(r1.type).toBe('jarWrong');
      expect(b.openJars).toEqual([wrong]);
      expect(b.secretJar).not.toBe(wrong);
      expect(b.enabled({ kind: 'jar', index: wrong })).toBe(false);
      const right = b.secretJar;
      expect(b.choose({ kind: 'jar', index: right })).toEqual({ type: 'jarRight', index: right });
      expect(b.secret).toBe(true);
      expect(b.secretJar).toBe(-1);
    }
    const b = new ConeBuilder(rng(5));
    b.choose({ kind: 'cone', id: 'waffle' });
    b.choose({ kind: 'flavour', id: 'berry' });
    b.next();
    b.next();
    for (let i = 0; i < SCOOPS.jarTries; i++) {
      const wrong = [0, 1, 2].find((j) => j !== b.secretJar && !b.openJars.includes(j))!;
      expect(b.choose({ kind: 'jar', index: wrong }).type).toBe('jarWrong');
    }
    expect(b.secretJar).toBe(-1);
    expect([0, 1, 2].every((j) => !b.enabled({ kind: 'jar', index: j }))).toBe(true);
  });

  it('dropTop removes the top scoops after a topple', () => {
    const b = new ConeBuilder(rng(6));
    b.choose({ kind: 'cone', id: 'rainbow' });
    for (const f of ['vanilla', 'choc', 'berry', 'mint', 'blue'] as const) b.choose({ kind: 'flavour', id: f });
    b.dropTop(3);
    expect(b.scoops).toEqual(['vanilla', 'choc']);
    expect(b.current()?.kind).toBe('flavour');
  });
});

describe('recipes, effects, secret, tickets', () => {
  it('recipes are valid and deterministic', () => {
    const a = makeRecipe(rng(42));
    expect(makeRecipe(rng(42))).toEqual(a);
    for (let s = 0; s < 200; s++) {
      const r = makeRecipe(rng(s));
      expect(r.scoops.length === 2 || r.scoops.length === 3).toBe(true);
      for (let i = 1; i < r.scoops.length; i++) expect(r.scoops[i]).not.toBe(r.scoops[i - 1]);
    }
  });

  it('matching is forgiving about scoop order and extra toppings', () => {
    const r: Recipe = { cone: 'waffle', scoops: ['mint', 'choc'], sauce: 'fudge', topping: 'duck' };
    const base = { stage: 'eat' as const, secret: false, secretJar: -1, jarTries: 0, openJars: [], selected: 0 };
    expect(matchesRecipe({ ...base, cone: 'waffle', scoops: ['choc', 'mint'], sauce: 'fudge', toppings: ['popcorn', 'duck'] }, r)).toBe(true);
    expect(matchesRecipe({ ...base, cone: 'choco', scoops: ['choc', 'mint'], sauce: 'fudge', toppings: ['duck'] }, r)).toBe(false);
    expect(matchesRecipe({ ...base, cone: 'waffle', scoops: ['choc', 'mint', 'mint'], sauce: 'fudge', toppings: ['duck'] }, r)).toBe(false);
    expect(matchesRecipe({ ...base, cone: 'waffle', scoops: ['choc', 'mint'], sauce: null, toppings: ['duck'] }, r)).toBe(false);
    expect(matchesRecipe({ ...base, cone: 'waffle', scoops: ['choc', 'mint'], sauce: 'fudge', toppings: ['worms'] }, r)).toBe(false);
  });

  it('effects come from toppings, else the top scoop; the secret adds its own', () => {
    expect(effectsFor({ scoops: ['choc'], toppings: ['pickle', 'sprinkles'], secret: false }, 'starCandy')).toEqual(['bigHead', 'rainbow']);
    expect(effectsFor({ scoops: ['choc', 'mint'], toppings: [], secret: false }, 'starCandy')).toEqual(['speed']);
    expect(effectsFor({ scoops: ['vanilla'], toppings: ['popcorn'], secret: true }, 'starCandy')).toEqual(['moon']);
    expect(effectsFor({ scoops: ['vanilla'], toppings: ['duck'], secret: true }, 'glowBear')).toEqual(['burps', 'rainbow']);
  });

  it('the secret topping changes every day and cycles through all of them', () => {
    const seen = new Set<string>();
    for (let d = 20000; d < 20000 + SECRETS.length; d++) seen.add(secretOfDay(d));
    expect(seen.size).toBe(SECRETS.length);
    expect(secretOfDay(-3)).toBeTruthy();
  });

  it('first cone free; then a ticket; a child who cannot pay sees how many gems are missing', () => {
    expect(ticketFor(0, 0)).toEqual({ ok: true, price: 0, free: true });
    expect(ticketFor(3, undefined)).toEqual({ ok: true, price: 0, free: true });
    expect(ticketFor(1, 10)).toEqual({ ok: true, price: SCOOPS.ticket, free: false });
    expect(ticketFor(1, 1)).toEqual({ ok: false, need: SCOOPS.ticket - 1 });
  });

  it('scores: a matching card pays more than its ticket; stars 1-3', () => {
    const r: Recipe = { cone: 'waffle', scoops: ['mint', 'choc'], sauce: null, topping: 'duck' };
    const b = { stage: 'eat' as const, cone: 'waffle' as const, scoops: ['mint', 'choc'] as ('mint' | 'choc')[], sauce: null, toppings: ['duck' as const], secret: true, secretJar: -1, jarTries: 0, openJars: [], selected: 0 };
    const s = scoreCone(b, r);
    expect(s.recipe).toBe(true);
    expect(s.gems).toBe(SCOOPS.prizeCone + SCOOPS.prizeRecipe + SCOOPS.prizeSecret);
    expect(s.gems).toBeGreaterThan(SCOOPS.ticket);
    expect(s.stars).toBe(3);
    expect(scoreCone({ ...b, secret: false, toppings: [] }, r)).toMatchObject({ stars: 1, gems: SCOOPS.prizeCone });
  });
});
