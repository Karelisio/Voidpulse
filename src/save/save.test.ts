import { describe, expect, it } from 'vitest';
import { MemoryStore } from './backend';
import { ImportError, checksum, exportSave, importSave, mergeDefaults, normalize } from './codec';
import { migrate } from './migrate';
import { SAVE_VERSION, defaultSave } from './schema';
import { SaveStore } from './store';

describe('sauvegarde', () => {
  it('écrit en alternant les emplacements et relit le plus récent', async () => {
    const kv = new MemoryStore();
    const store = new SaveStore(kv);
    const first = await store.load();
    expect(first.fresh).toBe(true);
    const d = first.data;
    d.stats.kills = 10;
    await store.saveNow(d);
    d.stats.kills = 20;
    await store.saveNow(d);
    expect(kv.map.size).toBe(2);
    const again = await new SaveStore(kv).load();
    expect(again.data.stats.kills).toBe(20);
    expect(again.fresh).toBe(false);
  });

  it('survit à un emplacement corrompu (écriture interrompue)', async () => {
    const kv = new MemoryStore();
    const store = new SaveStore(kv);
    const d = (await store.load()).data;
    d.stats.runs = 3;
    await store.saveNow(d);
    d.stats.runs = 4;
    await store.saveNow(d);
    // Le dernier emplacement écrit est tronqué.
    const [a, b] = ['voidpulse.save.a', 'voidpulse.save.b'].map((k) => kv.map.get(k) ?? '');
    const seqOf = (t: string): number => (JSON.parse(t) as { seq: number }).seq;
    const latest = seqOf(a) > seqOf(b) ? 'voidpulse.save.a' : 'voidpulse.save.b';
    kv.map.set(latest, (kv.map.get(latest) ?? '').slice(0, 40));
    const res = await new SaveStore(kv).load();
    expect(res.recovered).toBe(true);
    expect(res.data.stats.runs).toBe(3);
  });

  it('complète les champs manquants et rejette les types invalides', () => {
    const d = normalize({
      version: 1,
      audio: { music: 0.2, sfx: 'fort' },
      stats: { kills: Number.NaN },
    });
    expect(d.audio.music).toBe(0.2);
    expect(d.audio.sfx).toBe(defaultSave().audio.sfx);
    expect(d.stats.kills).toBe(0);
    expect(d.display.theme).toBe('arcade');
    expect(mergeDefaults({ a: {} }, { a: { x: 1 } }).a).toEqual({ x: 1 });
  });

  it('migre les anciennes versions et refuse les plus récentes', () => {
    expect((migrate({ audio: {} }) as { version: number }).version).toBe(SAVE_VERSION);
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(/plus récente/);
  });

  it('exporte et importe, détecte les altérations', () => {
    const d = defaultSave(1234);
    d.stats.bestTime = 612.5;
    d.display.language = 'en';
    const text = exportSave(d);
    const back = importSave(text);
    expect(back.stats.bestTime).toBe(612.5);
    expect(back.display.language).toBe('en');
    expect(() => importSave('bonjour')).toThrow(ImportError);
    const tampered = text.slice(0, -6) + (text.endsWith('A') ? 'BBBBBB' : 'AAAAAA');
    expect(() => importSave(tampered)).toThrow(ImportError);
  });

  it('somme de contrôle stable', () => {
    expect(checksum('voidpulse')).toBe(checksum('voidpulse'));
    expect(checksum('voidpulse')).not.toBe(checksum('voidpulsf'));
  });
});
