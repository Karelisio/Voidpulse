/** Pastille de relique : hexagone à la couleur de la rareté, icône de la statistique signature. */
import { rarityOf, relicBase } from '../../meta/relics';
import { statLabel } from '../../meta/stats';
import type { RelicItem } from '../../save/schema';
import { iconUrl } from '../portraits';

const HEX = '50,4 92,27 92,73 50,96 8,73 8,27';

export function RelicBadge({ item, size = 48 }: { item: RelicItem; size?: number }) {
  const color = rarityOf(item).color;
  const sig = relicBase(item.base)?.signature.stat ?? 'damage';
  return (
    <span
      className="meta-badge-relic"
      style={{ width: size, height: size, filter: `drop-shadow(0 0 5px ${color}88)` }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <polygon
          points={HEX}
          fill="#120a24"
          stroke={color}
          strokeWidth={5}
          strokeLinejoin="round"
        />
        <polygon points={HEX} fill={color} opacity={0.14} />
      </svg>
      <img src={iconUrl(statLabel(sig).icon)} alt="" width={size * 0.56} height={size * 0.56} />
    </span>
  );
}
