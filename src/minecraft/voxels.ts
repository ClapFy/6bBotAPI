import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { VoxelEntity, VoxelField } from "../api/types.ts";

const AIR = new Set(["air", "cave_air", "void_air", "structure_void", "light"]);
const MAX_CELLS = 14_000;

function nameAt(bot: Bot, x: number, y: number, z: number): string {
  try {
    return bot.blockAt(new Vec3(x, y, z))?.name ?? "air";
  } catch {
    return "air";
  }
}

function isAir(name: string): boolean {
  return AIR.has(name);
}

function occludes(name: string): boolean {
  if (isAir(name)) return false;
  if (name.includes("glass") || name.includes("leaves") || name.includes("pane")) return false;
  if (name.includes("portal") || name.includes("sign") || name.includes("torch")) return false;
  if (name === "fire" || name === "soul_fire" || name === "barrier" || name === "vine") return false;
  if (name === "water" || name === "lava" || name === "bubble_column" || name === "kelp") return false;
  if (name.endsWith("_carpet") || name.endsWith("_pressure_plate") || name.endsWith("_button")) return false;
  return true;
}

export function clampVoxelRadius(raw: unknown, fallback = 20): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(28, Math.max(8, Math.round(n)));
}

export function sampleVoxels(bot: Bot, radius = 20): VoxelField {
  const r = clampVoxelRadius(radius);
  const pos = bot.entity?.position;
  const yDown = Math.max(6, Math.round(r * 0.45));
  const yUp = Math.max(8, Math.round(r * 0.6));
  const ox = pos ? Math.floor(pos.x) - r : 0;
  const oy = pos ? Math.floor(pos.y) - yDown : 0;
  const oz = pos ? Math.floor(pos.z) - r : 0;
  const sx = r * 2 + 1;
  const sy = yDown + yUp + 1;
  const sz = sx;
  const volume = new Array<string>(sx * sy * sz);
  const index = (ix: number, iy: number, iz: number) => ix + iz * sx + iy * sx * sz;

  if (pos) {
    for (let iy = 0; iy < sy; iy++) {
      for (let iz = 0; iz < sz; iz++) {
        for (let ix = 0; ix < sx; ix++) {
          volume[index(ix, iy, iz)] = nameAt(bot, ox + ix, oy + iy, oz + iz);
        }
      }
    }
  }

  const at = (ix: number, iy: number, iz: number): string => {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= sx || iy >= sy || iz >= sz) return "air";
    return volume[index(ix, iy, iz)] ?? "air";
  };

  const palette: string[] = [];
  const palIndex = new Map<string, number>();
  const take = (name: string): number => {
    const existing = palIndex.get(name);
    if (existing !== undefined) return existing;
    const next = palette.length;
    palette.push(name);
    palIndex.set(name, next);
    return next;
  };

  const scored: { cell: [number, number, number, number]; dist: number }[] = [];
  const cx = r;
  const cy = pos ? Math.floor(pos.y) - oy : Math.floor(sy / 2);
  const cz = r;

  if (pos) {
    for (let iy = 0; iy < sy; iy++) {
      for (let iz = 0; iz < sz; iz++) {
        for (let ix = 0; ix < sx; ix++) {
          const name = at(ix, iy, iz);
          if (isAir(name)) continue;
          const n0 = at(ix - 1, iy, iz);
          const n1 = at(ix + 1, iy, iz);
          const n2 = at(ix, iy - 1, iz);
          const n3 = at(ix, iy + 1, iz);
          const n4 = at(ix, iy, iz - 1);
          const n5 = at(ix, iy, iz + 1);
          const neighbors = [n0, n1, n2, n3, n4, n5];
          const buried = neighbors.every((n) => occludes(n) || n === name);
          if (buried && occludes(name)) continue;
          if (buried && (name === "water" || name === "lava")) continue;
          const dx = ix - cx;
          const dy = iy - cy;
          const dz = iz - cz;
          scored.push({
            cell: [ix, iy, iz, take(name)],
            dist: dx * dx + dy * dy + dz * dz,
          });
        }
      }
    }
    scored.sort((a, b) => a.dist - b.dist);
  }

  const kept = scored.slice(0, MAX_CELLS);
  const cells = new Array<number>(kept.length * 4);
  for (let i = 0; i < kept.length; i++) {
    const [lx, ly, lz, pi] = kept[i]!.cell;
    const o = i * 4;
    cells[o] = lx;
    cells[o + 1] = ly;
    cells[o + 2] = lz;
    cells[o + 3] = pi;
  }

  return {
    at: new Date().toISOString(),
    ox,
    oy,
    oz,
    sx,
    sy,
    sz,
    palette,
    cells,
    entities: collectEntities(bot),
  };
}

function collectEntities(bot: Bot): VoxelEntity[] {
  const out: VoxelEntity[] = [];
  const self = bot.entity;
  if (self?.position) {
    out.push({
      name: bot.username,
      kind: "bot",
      x: round(self.position.x),
      y: round(self.position.y),
      z: round(self.position.z),
      yaw: self.yaw,
    });
  }
  const players = Object.values(bot.players)
    .filter((player) => player.username !== bot.username && player.entity?.position)
    .map((player) => {
      const p = player.entity!.position;
      const origin = self?.position;
      return {
        player,
        dist: origin ? origin.distanceTo(p) : 0,
      };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 40);

  for (const { player } of players) {
    const p = player.entity!.position;
    out.push({
      name: player.username,
      kind: "player",
      x: round(p.x),
      y: round(p.y),
      z: round(p.z),
      yaw: player.entity?.yaw,
    });
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
