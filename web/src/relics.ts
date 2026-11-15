// The thirty relics shown on the landing page. Names match server/src/seed.ts.
export const RELICS = [
  "Helm", "Crimson Plume", "Bronze Visor", "Neck Guard", "Left Pauldron", "Right Pauldron",
  "Breastplate", "Voyager Cape", "Belt of Ithaca", "Left Gauntlet", "Right Gauntlet", "Left Greave",
  "Right Greave", "Sandals", "Spear", "Round Shield", "Sword Sheath", "Quiver",
  "Hunting Bow", "Trident", "Wine Flask", "Siren Charm", "Lotus Pendant", "Cyclops Eye",
  "Horse Token", "Sail Banner", "Oar", "Compass", "Ithaca Mantle", "Odyssey Crest",
];

export const relicRarity = (position: number) => (position >= 28 ? "legendary" : position >= 23 ? "epic" : position >= 12 ? "rare" : "common");
