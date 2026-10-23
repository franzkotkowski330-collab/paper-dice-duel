export const CONFIG = {
  width: 1536, height: 864,
  sweep: 1.8, lock: .35, greenWidth: .18, yellowWidth: .05,
  shieldDuration: 2.5, enemyWindup: 1, minSpeed: .75, maxSpeed: 2,
  comboSpeed: .04, maxComboSpeed: .4,
  initialHp: 6, maxHp: 8, xp: [4, 6, 8, 10], maxLevel: 5,
  familiarDuration: 8, familiarMaxDuration: 12, familiarAttackInterval: 2,
  threatDuration: 6,
} as const;

export const ENEMIES = [
  { id: 'skeleton', name: 'THE HOLLOW KNIGHT', subtitle: 'I · The broken arch', hp: 6, interval: 3.4 },
  { id: 'ape', name: 'THE MOSSKEEPER', subtitle: 'II · The overgrown court', hp: 10, interval: 3 },
  { id: 'shadow', name: 'THE PAPER ECLIPSE', subtitle: 'III · The last light', hp: 14, interval: 2.6 },
] as const;

export type ActionKind = 'attack' | 'guard' | 'heal' | 'fast' | 'slow' | 'summon' | 'hazard';
export type UpgradeKind = 'upgrade_summon' | 'upgrade_health' | 'upgrade_attack' | 'upgrade_window';
export type TileKind = ActionKind | UpgradeKind;
export const LABELS: Record<TileKind, string> = {
  attack: 'STRIKE', guard: 'GUARD', heal: 'MEND', fast: 'QUICKEN', slow: 'STEADY',
  summon: 'SUMMON', hazard: 'DANGER', upgrade_summon: 'AWAKEN FAMILIAR',
  upgrade_health: 'HEART + ½', upgrade_attack: 'STRIKE + ½', upgrade_window: 'WIDER PERFECT',
};
export const ICONS: Record<TileKind, number> = {
  attack: 0, guard: 1, heal: 2, fast: 3, slow: 4, hazard: 5, summon: 6,
  upgrade_summon: 6, upgrade_health: 7, upgrade_attack: 8, upgrade_window: 9,
};
