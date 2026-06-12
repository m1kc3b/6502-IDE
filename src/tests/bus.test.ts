/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/bus.test.ts
   Tests unitaires : EventBus
   ───────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le bus est un singleton — on doit nettoyer entre les tests.
// On crée une instance fraîche à chaque suite en important la classe.
import { EventBus } from '../core/bus.js';

describe('EventBus', () => {

  let b: EventBus;

  beforeEach(() => {
    b = new EventBus();
  });

  // ── emit / on ────────────────────────────────────────────

  describe('emit() + on()', () => {
    it('appelle le handler avec le bon detail', () => {
      const handler = vi.fn();
      b.on('chuck:log', handler);
      b.emit('chuck:log', { text: 'hello', level: 'info' });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ text: 'hello', level: 'info' });
    });

    it('appelle tous les handlers enregistrés sur le même événement', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      b.on('chuck:reset', h1);
      b.on('chuck:reset', h2);
      b.emit('chuck:reset', undefined);
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('n\'appelle pas les handlers d\'autres événements', () => {
      const handler = vi.fn();
      b.on('chuck:run', handler);
      b.emit('chuck:stop', undefined);
      expect(handler).not.toHaveBeenCalled();
    });

    it('passe le bon payload pour chuck:cpu-updated', () => {
      const handler = vi.fn();
      const state = { A: 1, X: 2, Y: 3, P: 0x20, PC: 0x0600, SP: 0xff };
      b.on('chuck:cpu-updated', handler);
      b.emit('chuck:cpu-updated', state);
      expect(handler).toHaveBeenCalledWith(state);
    });
  });

  // ── Désabonnement ────────────────────────────────────────

  describe('désabonnement (retour de on())', () => {
    it('retourne une fonction de désabonnement', () => {
      const unsub = b.on('chuck:log', vi.fn());
      expect(typeof unsub).toBe('function');
    });

    it('n\'appelle plus le handler après désabonnement', () => {
      const handler = vi.fn();
      const unsub = b.on('chuck:log', handler);
      unsub();
      b.emit('chuck:log', { text: 'x', level: 'info' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('ne désabonne que le handler ciblé', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub = b.on('chuck:log', h1);
      b.on('chuck:log', h2);
      unsub();
      b.emit('chuck:log', { text: 'x', level: 'info' });
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledOnce();
    });
  });

  // ── once ─────────────────────────────────────────────────

  describe('once()', () => {
    it('appelle le handler exactement une fois', () => {
      const handler = vi.fn();
      b.once('chuck:run', handler);
      b.emit('chuck:run', undefined);
      b.emit('chuck:run', undefined);
      b.emit('chuck:run', undefined);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('passe le bon payload', () => {
      const handler = vi.fn();
      b.once('chuck:speed', handler);
      b.emit('chuck:speed', { value: 75 });
      expect(handler).toHaveBeenCalledWith({ value: 75 });
    });
  });

  // ── Isolement entre instances ─────────────────────────────

  describe('isolement', () => {
    it('deux instances sont indépendantes', () => {
      const b2 = new EventBus();
      const h1 = vi.fn();
      const h2 = vi.fn();
      b.on('chuck:run', h1);
      b2.on('chuck:run', h2);
      b.emit('chuck:run', undefined);
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).not.toHaveBeenCalled();
    });
  });

});