/**
 * Démultiplexeur Ogg Opus minimal (RFC 3533 + RFC 7845) : pages → paquets, en-tête OpusHead,
 * durée de chaque paquet, longueur exacte du flux décodé (pré-skip et rognage de fin).
 * Sans dépendance au DOM : utilisé par le worker de décodage et testé sous Node.
 */

export interface OpusHead {
  channels: number;
  /** Échantillons (48 kHz) à jeter au début du décodage. */
  preSkip: number;
  inputSampleRate: number;
  /** Gain de sortie en dB (Q7.8). */
  outputGainDb: number;
  mappingFamily: number;
}

export interface OpusStream {
  head: OpusHead;
  /** Paquet OpusHead brut (description WebCodecs). */
  headPacket: Uint8Array;
  /** Paquets audio, vues sur le tampon d'origine (aucune copie). */
  packets: Uint8Array[];
  /** Durée de chaque paquet, en échantillons à 48 kHz. */
  durations: Int32Array;
  /** Nombre d'échantillons utiles après pré-skip et rognage de fin (48 kHz). */
  length: number;
}

const OGGS = 0x5367674f; // "OggS" lu en little-endian

/** Durée d'une trame Opus selon la configuration du TOC (échantillons à 48 kHz). */
function frameSamples(config: number): number {
  if (config < 12) return [480, 960, 1920, 2880][config & 3];
  if (config < 16) return (config & 1) === 0 ? 480 : 960;
  return [120, 240, 480, 960][config & 3];
}

/** Durée d'un paquet Opus (RFC 6716 §3.1), 0 si le paquet est vide ou invalide. */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0];
  const per = frameSamples(toc >> 3);
  const code = toc & 3;
  if (code === 0) return per;
  if (code === 1 || code === 2) return per * 2;
  if (packet.length < 2) return 0;
  return per * (packet[1] & 0x3f);
}

function readHead(p: Uint8Array): OpusHead {
  const magic = String.fromCharCode(...p.subarray(0, 8));
  if (magic !== 'OpusHead') throw new Error('Flux Ogg sans en-tête OpusHead');
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    channels: p[9],
    preSkip: view.getUint16(10, true),
    inputSampleRate: view.getUint32(12, true),
    outputGainDb: view.getInt16(16, true) / 256,
    mappingFamily: p[18],
  };
}

/**
 * Découpe un fichier Ogg Opus (premier flux logique uniquement). Lève une erreur si le
 * fichier n'est pas un Ogg Opus valide.
 */
export function demuxOggOpus(bytes: Uint8Array): OpusStream {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  const pageOfPacket: number[] = [];
  const pageGranules: number[] = [];
  let serial = -1;
  let pending: Uint8Array[] = [];
  let pos = 0;
  let page = 0;
  while (pos + 27 <= bytes.length) {
    if (view.getUint32(pos, true) !== OGGS) throw new Error(`Page Ogg invalide à l'octet ${pos}`);
    const headerType = bytes[pos + 5];
    const granuleLo = view.getUint32(pos + 6, true);
    const granuleHi = view.getInt32(pos + 10, true);
    const pageSerial = view.getUint32(pos + 14, true);
    const segments = bytes[pos + 26];
    const tableStart = pos + 27;
    let dataPos = tableStart + segments;
    if (serial === -1) serial = pageSerial;
    if (pageSerial !== serial) {
      // Autre flux logique multiplexé : ignoré.
      let skip = 0;
      for (let i = 0; i < segments; i++) skip += bytes[tableStart + i];
      pos = dataPos + skip;
      continue;
    }
    if ((headerType & 1) === 0 && pending.length > 0) pending = []; // continuation perdue
    let start = dataPos;
    for (let i = 0; i < segments; i++) {
      const lace = bytes[tableStart + i];
      dataPos += lace;
      if (lace < 255) {
        const part = bytes.subarray(start, dataPos);
        if (pending.length > 0) {
          pending.push(part);
          const total = pending.reduce((s, c) => s + c.length, 0);
          const joined = new Uint8Array(total);
          let o = 0;
          for (const c of pending) {
            joined.set(c, o);
            o += c.length;
          }
          packets.push(joined);
          pending = [];
        } else packets.push(part);
        pageOfPacket.push(page);
        start = dataPos;
      }
    }
    if (start < dataPos) pending.push(bytes.subarray(start, dataPos));
    // Granule −1 : aucune fin de paquet sur cette page.
    pageGranules.push(
      granuleHi === -1 && granuleLo === 0xffffffff ? -1 : granuleHi * 2 ** 32 + granuleLo,
    );
    pos = dataPos;
    page++;
  }
  if (packets.length < 2) throw new Error('Flux Ogg Opus incomplet');
  const headPacket = packets[0];
  const head = readHead(headPacket);
  const audio = packets.slice(2);
  const audioPages = pageOfPacket.slice(2);
  const durations = Int32Array.from(audio, opusPacketSamples);

  // Granule initial : granule de la première page audio moins la durée des paquets qui s'y terminent.
  let initial = 0;
  let lastGranule = 0;
  if (audio.length > 0) {
    const firstPage = audioPages[0];
    let before = 0;
    for (let i = 0; i < audio.length && audioPages[i] === firstPage; i++) before += durations[i];
    const g = pageGranules[firstPage];
    initial = g >= 0 ? Math.max(0, g - before) : 0;
    for (let p = pageGranules.length - 1; p >= 0; p--) {
      if (pageGranules[p] >= 0) {
        lastGranule = pageGranules[p];
        break;
      }
    }
  }
  const decoded = durations.reduce((s, d) => s + d, 0);
  const byGranule = lastGranule - initial - head.preSkip;
  const length = Math.max(0, Math.min(decoded - head.preSkip, byGranule > 0 ? byGranule : decoded));
  return { head, headPacket, packets: audio, durations, length };
}
