import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { PortalKind, PortalTarget, WorldKind } from "../../api/types.ts";
import { isLobbyLike } from "./worldKind.ts";

const PORTAL_BLOCKS = new Set([
  "nether_portal",
  "end_portal",
  "end_gateway",
  "end_portal_frame",
]);

function idOf(bot: Bot, name: string): number | undefined {
  return bot.registry?.blocksByName?.[name]?.id;
}

function kindForBlock(name: string, worldKind: WorldKind, treatAsServer: boolean): PortalKind {
  if (treatAsServer) return "server";
  if (name === "end_portal" || name === "end_gateway" || name === "end_portal_frame") return "end";
  if (name === "nether_portal") return "nether";
  return "unknown";
}

export function findPortalBlocks(bot: Bot, maxDistance = 48): PortalTarget[] {
  const pos = bot.entity?.position;
  if (!pos) return [];

  const matchingIds = [...PORTAL_BLOCKS]
    .map((name) => idOf(bot, name))
    .filter((id): id is number => typeof id === "number");

  let positions: Vec3[] = [];
  try {
    if (matchingIds.length > 0) {
      positions = bot.findBlocks({
        matching: matchingIds,
        maxDistance,
        count: 64,
      }) as unknown as Vec3[];
    }
  } catch {
    positions = [];
  }

  if (positions.length === 0) {
    const origin = pos.floored();
    for (let dx = -maxDistance; dx <= maxDistance; dx++) {
      for (let dy = -8; dy <= 12; dy++) {
        for (let dz = -maxDistance; dz <= maxDistance; dz++) {
          const block = bot.blockAt(origin.offset(dx, dy, dz));
          if (block && PORTAL_BLOCKS.has(block.name)) {
            positions.push(block.position.clone());
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  const targets: PortalTarget[] = [];
  for (const p of positions) {
    const key = `${p.x},${p.y},${p.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = bot.blockAt(p);
    const name = block?.name ?? "nether_portal";
    const distance = pos.distanceTo(p.offset(0.5, 0.5, 0.5));
    targets.push({
      kind: "unknown",
      position: { x: p.x, y: p.y, z: p.z },
      distance,
      blockName: name,
    });
  }

  targets.sort((a, b) => a.distance - b.distance);
  return targets;
}

export function classifyPortals(
  portals: PortalTarget[],
  worldKind: WorldKind,
  allowServerPortals: boolean,
): PortalTarget[] {
  const treatAsServer = allowServerPortals && (isLobbyLike(worldKind) || worldKind === "unknown");
  return portals.map((portal) => ({
    ...portal,
    kind: kindForBlock(portal.blockName, worldKind, treatAsServer),
  }));
}

export function pickServerPortal(
  portals: PortalTarget[],
  worldKind: WorldKind,
  allowServerPortals: boolean,
): PortalTarget | null {
  const classified = classifyPortals(portals, worldKind, allowServerPortals);
  const servers = classified.filter((p) => p.kind === "server");
  if (servers.length === 0) return null;

  const clusters = cluster(servers, 3);
  clusters.sort((a, b) => a[0].distance - b[0].distance);
  const clusterPortals = clusters[0];
  if (!clusterPortals?.length) return null;

  const cx = average(clusterPortals.map((p) => p.position.x + 0.5));
  const cy = average(clusterPortals.map((p) => p.position.y + 0.5));
  const cz = average(clusterPortals.map((p) => p.position.z + 0.5));
  const representative = clusterPortals[0];
  return {
    ...representative,
    position: { x: cx, y: cy, z: cz },
    distance: representative.distance,
  };
}

function cluster(portals: PortalTarget[], radius: number): PortalTarget[][] {
  const groups: PortalTarget[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < portals.length; i++) {
    if (used.has(i)) continue;
    const group = [portals[i]];
    used.add(i);
    for (let j = i + 1; j < portals.length; j++) {
      if (used.has(j)) continue;
      const dx = portals[i].position.x - portals[j].position.x;
      const dy = portals[i].position.y - portals[j].position.y;
      const dz = portals[i].position.z - portals[j].position.z;
      if (Math.hypot(dx, dy, dz) <= radius) {
        group.push(portals[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function looksLikePortalFrame(bot: Bot, pos: Vec3): boolean {
  const names = [
    bot.blockAt(pos)?.name,
    bot.blockAt(pos.offset(1, 0, 0))?.name,
    bot.blockAt(pos.offset(-1, 0, 0))?.name,
    bot.blockAt(pos.offset(0, 0, 1))?.name,
    bot.blockAt(pos.offset(0, 0, -1))?.name,
  ];
  return names.some((n) => n === "obsidian" || n === "crying_obsidian" || n === "nether_portal");
}
