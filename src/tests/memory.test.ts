/* ─────────────────────────────────────────────────────────────
   Chuck IDE — tests/memory.test.ts
   Tests unitaires : Ram64K
   ───────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ram64K } from '../core/memory.js';

describe('Ram64K', () => {

  let ram: Ram64K;

  beforeEach(() => { ram = new Ram64K(); });

  // ── Lecture / écriture de base ──────────────────────────

  describe('read / write', () => {
    it('retourne 0 par défaut sur toute la RAM', () => {
      expect(ram.read(0x0000)).toBe(0);
      expect(ram.read(0x0600)).toBe(0);
      expect(ram.read(0xffff)).toBe(0);
    });

    it('écrit et relit un octet', () => {
      ram.write(0x0010, 0xab);
      expect(ram.read(0x0010)).toBe(0xab);
    });

    it('masque les valeurs > 0xFF', () => {
      ram.write(0x0010, 0x1ff);
      expect(ram.read(0x0010)).toBe(0xff);
    });

    it('masque les adresses > 0xFFFF', () => {
      ram.write(0x10001, 0x42);
      expect(ram.read(0x0001)).toBe(0x42);
    });

    it('les écritures sont indépendantes par adresse', () => {
      ram.write(0x0010, 0x11);
      ram.write(0x0011, 0x22);
      expect(ram.read(0x0010)).toBe(0x11);
      expect(ram.read(0x0011)).toBe(0x22);
    });
  });

  // ── Adresse spéciale $FE ────────────────────────────────

  describe('$FE — octet aléatoire', () => {
    it('retourne toujours un entier entre 0 et 255', () => {
      for (let i = 0; i < 100; i++) {
        const v = ram.read(0xfe);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('retourne des valeurs différentes (distribution aléatoire)', () => {
      const values = new Set(Array.from({ length: 50 }, () => ram.read(0xfe)));
      // 50 lectures, très peu de chances d'avoir < 5 valeurs distinctes
      expect(values.size).toBeGreaterThan(5);
    });
  });

  // ── store() avec hook display ───────────────────────────

  describe('store() — hook display', () => {
    it('déclenche le hook pour les adresses $0200–$05FF', () => {
      const hook = vi.fn();
      ram.setPixelHook(hook);

      ram.store(0x0200, 0x05);
      expect(hook).toHaveBeenCalledWith(0x0200, 0x05);

      ram.store(0x05ff, 0x0f);
      expect(hook).toHaveBeenCalledWith(0x05ff, 0x0f);
    });

    it('ne déclenche pas le hook hors zone display', () => {
      const hook = vi.fn();
      ram.setPixelHook(hook);

      ram.store(0x01ff, 0x01);  // juste avant
      ram.store(0x0600, 0x01);  // juste après
      ram.store(0x0000, 0x01);
      expect(hook).not.toHaveBeenCalled();
    });

    it('write() n\'appelle jamais le hook', () => {
      const hook = vi.fn();
      ram.setPixelHook(hook);
      ram.write(0x0200, 0x07);
      expect(hook).not.toHaveBeenCalled();
    });

    it('écrit bien la valeur en RAM même avec le hook', () => {
      ram.setPixelHook(vi.fn());
      ram.store(0x0300, 0x0b);
      expect(ram.buffer[0x0300]).toBe(0x0b);
    });
  });

  // ── readWord ─────────────────────────────────────────────

  describe('readWord()', () => {
    it('lit un mot 16 bits little-endian', () => {
      ram.write(0x0010, 0x34);
      ram.write(0x0011, 0x12);
      expect(ram.readWord(0x0010)).toBe(0x1234);
    });

    it('gère le wrap-around $FFFF → $0000', () => {
      ram.write(0xffff, 0xcd);
      ram.write(0x0000, 0xab);
      expect(ram.readWord(0xffff)).toBe(0xabcd);
    });
  });

  // ── loadBytes ────────────────────────────────────────────

  describe('loadBytes()', () => {
    it('charge un tableau d\'octets à partir d\'une adresse de base', () => {
      ram.loadBytes(0x0600, [0xa9, 0x42, 0x00]);
      expect(ram.read(0x0600)).toBe(0xa9);
      expect(ram.read(0x0601)).toBe(0x42);
      expect(ram.read(0x0602)).toBe(0x00);
    });

    it('ne déclenche pas le hook display pendant le chargement', () => {
      const hook = vi.fn();
      ram.setPixelHook(hook);
      // Charger dans la zone display
      ram.loadBytes(0x0200, [0x01, 0x02, 0x03]);
      expect(hook).not.toHaveBeenCalled();
    });
  });

  // ── reset ─────────────────────────────────────────────────

  describe('reset()', () => {
    it('remet toute la RAM à zéro', () => {
      ram.write(0x0010, 0xff);
      ram.write(0x0600, 0xaa);
      ram.write(0xffff, 0x55);
      ram.reset();
      expect(ram.read(0x0010)).toBe(0);
      expect(ram.read(0x0600)).toBe(0);
      expect(ram.read(0xffff)).toBe(0);
    });

    it('conserve le hook après reset', () => {
      const hook = vi.fn();
      ram.setPixelHook(hook);
      ram.reset();
      ram.store(0x0200, 0x03);
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  // ── storeKeypress ─────────────────────────────────────────

  describe('storeKeypress()', () => {
    it('écrit le code ASCII en $FF', () => {
      ram.storeKeypress(65); // 'A'
      expect(ram.read(0xff)).toBe(65);
    });

    it('masque les valeurs > 0xFF', () => {
      ram.storeKeypress(0x1ff);
      expect(ram.read(0xff)).toBe(0xff);
    });
  });

  // ── hexDump ───────────────────────────────────────────────

  describe('hexDump()', () => {
    it('produit des lignes de 16 octets préfixées par l\'adresse', () => {
      ram.write(0x0600, 0xa9);
      ram.write(0x0601, 0x42);
      const dump = ram.hexDump(0x0600, 16);
      expect(dump).toContain('0600:');
      expect(dump).toContain('A9');
      expect(dump).toContain('42');
    });

    it('produit le bon nombre de lignes pour 32 octets', () => {
      const dump = ram.hexDump(0x0000, 32);
      const lines = dump.trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

});
