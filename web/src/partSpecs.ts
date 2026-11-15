// Procedural stand-ins for the 30 Odyssey parts, keyed by part position (1 to 30).
// When real art exists, load the .glb at parts.glb_key instead and keep these as the ghost proxies.

export type Shape = "box" | "sphere" | "cylinder" | "cone" | "torus";
export interface PartSpec {
  shape: Shape;
  pos: [number, number, number];
  size: [number, number, number]; // box: w,h,d  sphere: r  cylinder: r,h  cone: r,h  torus: r,tube
  rot?: [number, number, number];
}

export const PART_SPECS: Record<number, PartSpec> = {
  1: { shape: "sphere", pos: [0, 1.88, 0], size: [0.27, 0, 0] },
  2: { shape: "cone", pos: [0, 2.2, 0], size: [0.09, 0.42, 0] },
  3: { shape: "box", pos: [0, 1.82, 0.22], size: [0.36, 0.08, 0.08] },
  4: { shape: "cylinder", pos: [0, 1.6, 0], size: [0.17, 0.12, 0] },
  5: { shape: "sphere", pos: [-0.46, 1.45, 0], size: [0.16, 0, 0] },
  6: { shape: "sphere", pos: [0.46, 1.45, 0], size: [0.16, 0, 0] },
  7: { shape: "box", pos: [0, 1.2, 0.04], size: [0.6, 0.6, 0.3] },
  8: { shape: "box", pos: [0, 1.05, -0.22], size: [0.62, 1.0, 0.04] },
  9: { shape: "box", pos: [0, 0.84, 0], size: [0.58, 0.08, 0.32] },
  10: { shape: "cylinder", pos: [-0.64, 0.85, 0], size: [0.09, 0.22, 0] },
  11: { shape: "cylinder", pos: [0.64, 0.85, 0], size: [0.09, 0.22, 0] },
  12: { shape: "cylinder", pos: [-0.16, 0.34, 0], size: [0.1, 0.36, 0] },
  13: { shape: "cylinder", pos: [0.16, 0.34, 0], size: [0.1, 0.36, 0] },
  14: { shape: "box", pos: [0, 0.05, 0.08], size: [0.52, 0.08, 0.3] },
  15: { shape: "cylinder", pos: [0.85, 1.1, 0], size: [0.025, 2.2, 0] },
  16: { shape: "cylinder", pos: [-0.8, 1.1, 0.12], size: [0.36, 0.05, 0], rot: [Math.PI / 2, 0, 0] },
  17: { shape: "box", pos: [0.34, 0.74, -0.1], size: [0.06, 0.7, 0.06], rot: [0, 0, 0.6] },
  18: { shape: "cylinder", pos: [-0.16, 1.3, -0.3], size: [0.07, 0.5, 0], rot: [0, 0, 0.2] },
  19: { shape: "torus", pos: [0.58, 1.2, -0.2], size: [0.3, 0.02, 0] },
  20: { shape: "cone", pos: [-1.0, 2.05, 0], size: [0.12, 0.4, 0] },
  21: { shape: "sphere", pos: [0.36, 0.7, 0.2], size: [0.09, 0, 0] },
  22: { shape: "torus", pos: [0, 1.46, 0.18], size: [0.2, 0.015, 0], rot: [Math.PI / 2, 0, 0] },
  23: { shape: "sphere", pos: [0, 1.36, 0.22], size: [0.05, 0, 0] },
  24: { shape: "sphere", pos: [0, 1.2, 0.2], size: [0.08, 0, 0] },
  25: { shape: "box", pos: [1.1, 0.25, 0.1], size: [0.18, 0.18, 0.18] },
  26: { shape: "box", pos: [-1.1, 1.7, 0], size: [0.02, 0.5, 0.4] },
  27: { shape: "cylinder", pos: [1.3, 0.95, -0.1], size: [0.025, 1.6, 0], rot: [0, 0, 0.3] },
  28: { shape: "torus", pos: [-0.5, 0.75, 0.25], size: [0.08, 0.02, 0] },
  29: { shape: "box", pos: [0, 1.5, -0.1], size: [0.95, 0.1, 0.4] },
  30: { shape: "cone", pos: [0, 2.7, 0], size: [0.16, 0.32, 0], rot: [Math.PI, 0, 0] },
};
