import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { WorldKind } from "../../api/types.ts";

export interface WorldContext {
  authenticated: boolean;
  serverPortalsEntered: number;
  requiredServerPortals: number;
}

export interface IslandScan {
  solid: number;
  water: number;
  airish: number;
  looksLikeIsland: boolean;
}

function nameAt(bot: Bot, x: number, y: number, z: number): string {
  try {
    return bot.blockAt(new Vec3(x, y, z))?.name ?? "air";
  } catch {
    return "air";
  }
}

export function scanIsland(bot: Bot, pos: { x: number; y: number; z: number }, radius = 28): IslandScan {
  const ox = Math.floor(pos.x);
  const oy = Math.floor(pos.y);
  const oz = Math.floor(pos.z);
  let solid = 0;
  let water = 0;
  let airish = 0;

  for (let dx = -radius; dx <= radius; dx += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      const ground = nameAt(bot, ox + dx, oy - 1, oz + dz);
      const feet = nameAt(bot, ox + dx, oy, oz + dz);
      const sample = ground === "air" ? feet : ground;
      if (sample.includes("water") || sample === "kelp" || sample === "seagrass") water += 1;
      else if (sample === "air" || sample === "cave_air" || sample === "void_air") airish += 1;
      else solid += 1;
    }
  }

  const total = solid + water + airish || 1;
  const waterIsland = water / total > 0.28 && solid < 350 && solid > 8;
  const voidIsland = airish / total > 0.45 && solid < 280 && solid > 4;
  return { solid, water, airish, looksLikeIsland: waterIsland || voidIsland };
}

export function classifyWorld(bot: Bot, ctx: WorldContext): WorldKind {
  const dimension = String(bot.game?.dimension ?? "").toLowerCase();
  const pos = bot.entity?.position;
  const island = pos ? scanIsland(bot, pos) : undefined;
  const inEnd = dimension.includes("the_end") || dimension.endsWith(":the_end");
  const inNether = dimension.includes("nether");
  const gameMode = String(bot.game?.gameMode ?? "").toLowerCase();
  const adventure = gameMode === "adventure" || gameMode === "1";

  if (inNether) {
    if (ctx.serverPortalsEntered < ctx.requiredServerPortals && (island?.looksLikeIsland || adventure)) return "lobby";
    return "nether";
  }

  if (inEnd) {
    if (!ctx.authenticated) return "auth";
    if (pos && Math.abs(pos.x - 1000) < 40 && Math.abs(pos.z - 1000) < 40) return "auth";
    if (adventure) return "lobby";
    return "end";
  }

  if (!ctx.authenticated) return "auth";
  if (!adventure) return "overworld";

  if (adventure && pos && pos.y > 90) return "lobby";
  if (ctx.serverPortalsEntered < ctx.requiredServerPortals && (island?.looksLikeIsland || (adventure && pos && pos.y > 80))) {
    return "lobby";
  }

  if (ctx.serverPortalsEntered >= ctx.requiredServerPortals && !adventure) return "overworld";
  if (!adventure && pos && pos.y < 90) return "overworld";

  if (island?.looksLikeIsland) return "lobby";

  const game = bot.game as { worldBorder?: { diameter?: number; size?: number } } | undefined;
  const border = game?.worldBorder?.diameter ?? game?.worldBorder?.size;
  if (typeof border === "number" && border > 2_000 && !adventure) return "overworld";

  return ctx.serverPortalsEntered > 0 && !adventure ? "overworld" : "lobby";
}

export function isMainWorld(kind: WorldKind): boolean {
  return kind === "overworld" || kind === "nether" || kind === "end";
}

export function isLobbyLike(kind: WorldKind): boolean {
  return kind === "auth" || kind === "lobby";
}
