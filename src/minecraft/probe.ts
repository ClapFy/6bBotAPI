import fs from "node:fs";
import path from "node:path";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { PortalTarget, Vec3Like, WorldDump, WorldKind } from "../api/types.ts";
import { classifyWorld, scanIsland } from "./lobby/worldKind.ts";
import { findPortalBlocks } from "./lobby/portals.ts";

const MAP_PALETTE: Record<string, string> = {
  nether_portal: "P",
  end_portal: "E",
  end_gateway: "G",
  obsidian: "O",
  crying_obsidian: "C",
  water: "~",
  lava: "L",
  grass_block: ",",
  dirt: ".",
  sand: "s",
  sandstone: "S",
  oak_planks: "=",
  oak_log: "T",
  stone: "#",
  cobblestone: "%",
  netherrack: "n",
  air: " ",
};

function blockName(bot: Bot, x: number, y: number, z: number): string {
  try {
    const block = bot.blockAt(new Vec3(x, y, z));
    return block?.name ?? "air";
  } catch {
    return "air";
  }
}

function vec(v: { x: number; y: number; z: number }): Vec3Like {
  return { x: round(v.x), y: round(v.y), z: round(v.z) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function worldBorderDiameter(bot: Bot): number | null {
  const game = bot.game as { worldBorder?: { diameter?: number; size?: number } } | undefined;
  const border = game?.worldBorder;
  const size = border?.diameter ?? border?.size;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

export function dumpWorld(
  bot: Bot,
  worldKind: WorldKind,
  options: { mapRadius?: number } = {},
): WorldDump {
  const pos = bot.entity?.position;
  const radius = options.mapRadius ?? 24;
  const nearbyCounts: Record<string, number> = {};
  if (pos) {
    const origin = pos.floored();
    for (let dx = -16; dx <= 16; dx++) {
      for (let dy = -6; dy <= 8; dy++) {
        for (let dz = -16; dz <= 16; dz++) {
          const name = blockName(bot, origin.x + dx, origin.y + dy, origin.z + dz);
          nearbyCounts[name] = (nearbyCounts[name] ?? 0) + 1;
        }
      }
    }
  }

  const portals = pos ? findPortalBlocks(bot, 48).map((p) => ({ ...p })) : [];
  const island = pos ? scanIsland(bot, pos, 28) : undefined;

  return {
    at: new Date().toISOString(),
    dimension: bot.game?.dimension,
    worldKind,
    gameMode: bot.game?.gameMode,
    position: pos ? vec(pos) : undefined,
    yaw: bot.entity?.yaw,
    pitch: bot.entity?.pitch,
    worldBorderDiameter: worldBorderDiameter(bot),
    nearbyCounts,
    portals,
    island,
    asciiMap: pos ? renderAsciiMap(bot, pos, radius) : "",
  };
}

export function renderAsciiMap(bot: Bot, pos: { x: number; y: number; z: number }, radius: number): string {
  const origin = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
  const lines: string[] = [
    `map y=${origin.y} radius=${radius} (N is up). bot=@ portal=P water=~ obsidian=O`,
  ];
  for (let dz = -radius; dz <= radius; dz++) {
    let row = "";
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dz === 0) {
        row += "@";
        continue;
      }
      const column = sampleColumn(bot, origin.x + dx, origin.y, origin.z + dz);
      row += column;
    }
    lines.push(row);
  }
  return lines.join("\n");
}

function sampleColumn(bot: Bot, x: number, y: number, z: number): string {
  for (let dy = 4; dy >= -3; dy--) {
    const name = blockName(bot, x, y + dy, z);
    if (name === "nether_portal") return "P";
    if (name === "end_portal" || name === "end_portal_frame") return "E";
    if (name === "end_gateway") return "G";
  }
  const feet = blockName(bot, x, y, z);
  const below = blockName(bot, x, y - 1, z);
  const pick = feet === "air" ? below : feet;
  if (MAP_PALETTE[pick]) return MAP_PALETTE[pick];
  if (pick.includes("water")) return "~";
  if (pick.includes("leaves")) return "*";
  if (pick.includes("log") || pick.includes("wood")) return "T";
  if (pick.includes("plank")) return "=";
  if (pick === "air") return " ";
  return "#";
}

export function topBlockCounts(counts: Record<string, number>, n = 12): string {
  return Object.entries(counts)
    .filter(([name]) => name !== "air")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");
}

export function persistDump(rootDir: string, dump: WorldDump): string {
  const dir = path.join(rootDir, "logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `probe-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));
  const keep = 5;
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("probe-") && name.endsWith(".json"))
    .sort();
  for (const extra of files.slice(0, Math.max(0, files.length - keep))) {
    try {
      fs.unlinkSync(path.join(dir, extra));
    } catch {}
  }
  return file;
}

export function classifyWithDump(bot: Bot, ctx: Parameters<typeof classifyWorld>[1]): {
  kind: WorldKind;
  dump: WorldDump;
} {
  const kind = classifyWorld(bot, ctx);
  return { kind, dump: dumpWorld(bot, kind) };
}

export type { PortalTarget };
