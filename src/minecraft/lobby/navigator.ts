import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { goals, Movements } from "../pathfinder.ts";
import type { PortalTarget, WorldKind } from "../../api/types.ts";
import { log } from "../../logger.ts";
import { pickServerPortal, findPortalBlocks } from "./portals.ts";
import { isLobbyLike } from "./worldKind.ts";

export interface NavigatorHooks {
  onFound(portal: PortalTarget): void;
  onEntered(portal: PortalTarget): void;
  onMiss(reason: string): void;
  getWorldKind(): WorldKind;
  allowServerPortals(): boolean;
}

export interface PortalNavigator {
  start(): void;
  stop(): void;
  huntOnce(): Promise<boolean>;
  get hunting(): boolean;
}

const KNOWN_SERVER_PORTALS = [
  { x: -1000, y: 102, z: -988 },
  { x: 311, y: 163.5, z: 427 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inPortalBlock(bot: Bot): boolean {
  const pos = bot.entity?.position;
  if (!pos) return false;
  const names = [
    bot.blockAt(pos.floored())?.name,
    bot.blockAt(pos.offset(0, 1, 0).floored())?.name,
    bot.blockAt(pos.offset(0, 0.5, 0).floored())?.name,
  ];
  return names.some((name) => name === "nether_portal" || name === "end_gateway" || name === "end_portal");
}

function portalExit(bot: Bot): Vec3 | undefined {
  const pos = bot.entity.position;
  const origin = pos.floored();
  const candidates: Vec3[] = [];
  const clearAt = (point: Vec3, allowPortal: boolean): boolean => {
    const ground = bot.blockAt(point.offset(0, -1, 0).floored());
    if (ground?.boundingBox !== "block" || /magma|campfire|cactus/.test(ground.name)) return false;
    for (const dx of [-0.3, 0.3]) {
      for (const dz of [-0.3, 0.3]) {
        for (const dy of [0, 1]) {
          const block = bot.blockAt(point.offset(dx, dy, dz).floored());
          if (!block || block.boundingBox !== "empty") return false;
          if (/water|lava|fire|powder_snow/.test(block.name)) return false;
          if (!allowPortal && /portal|gateway/.test(block.name)) return false;
        }
      }
    }
    return true;
  };

  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const target = origin.offset(dx + 0.5, 0, dz + 0.5);
      const distance = pos.distanceTo(target);
      if (distance < 2 || distance > 4 || !clearAt(target, false)) continue;
      const steps = Math.ceil(distance / 0.25);
      const delta = target.minus(pos).scaled(1 / steps);
      if (Array.from({ length: steps }, (_, i) => pos.plus(delta.scaled(i + 1)))
        .every((point) => clearAt(point, true))) candidates.push(target);
    }
  }
  return candidates.sort((a, b) => pos.distanceTo(a) - pos.distanceTo(b))[0];
}

export function createPortalNavigator(bot: Bot, retryMs: number, hooks: NavigatorHooks): PortalNavigator {
  let hunting = false;
  let stopped = false;
  let lastPos = bot.entity?.position?.clone();
  let portalEntryTimedOut = false;

  const stopMovement = () => {
    try {
      bot.clearControlStates();
    } catch {}
    try {
      bot.pathfinder?.setGoal(null);
    } catch {
      // pathfinder may not be loaded yet
    }
  };

  const waitForTransfer = async (portal: PortalTarget, start: Vec3): Promise<boolean> => {
    stopMovement();
    const startDim = String(bot.game?.dimension ?? "");
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !stopped) {
      if (!bot.entity) return false;
      const here = bot.entity.position;
      const dim = String(bot.game?.dimension ?? "");
      const gm = String(bot.game?.gameMode ?? "").toLowerCase();
      if (gm === "survival" || gm === "0" || dim !== startDim) {
        portalEntryTimedOut = false;
        hooks.onEntered(portal);
        return true;
      }
      await sleep(200);
    }
    if (!stopped) portalEntryTimedOut = true;
    return false;
  };

  const huntOnce = async (): Promise<boolean> => {
    if (!bot.entity) return false;
    const worldKind = hooks.getWorldKind();
    if (!hooks.allowServerPortals() || (!isLobbyLike(worldKind) && worldKind !== "unknown")) {
      return false;
    }

    // A join-cooldown rejection only triggers again after leaving the portal.
    // Give an entry its normal transfer window, then step outside on retry.
    if (portalEntryTimedOut && inPortalBlock(bot)) {
      const exit = portalExit(bot);
      if (!exit) {
        hooks.onMiss("no safe place to step out of portal");
        return false;
      }
      log.info("Already inside server portal; stepping out before retrying");
      stopMovement();
      const dimension = String(bot.game?.dimension ?? "");
      const deadline = Date.now() + 5_000;
      while (!stopped && bot.entity && Date.now() < deadline) {
        if (!hooks.allowServerPortals() || String(bot.game?.dimension ?? "") !== dimension) {
          stopMovement();
          return false;
        }
        if (!inPortalBlock(bot) && bot.entity.position.distanceTo(exit) < 0.5) break;
        await bot.lookAt(exit.offset(0, 1.2, 0), true);
        if (stopped) return false;
        bot.setControlState("forward", true);
        bot.setControlState("sprint", false);
        await sleep(150);
      }
      stopMovement();
      if (stopped || !bot.entity || inPortalBlock(bot) || bot.entity.position.distanceTo(exit) >= 0.5) {
        hooks.onMiss("could not step out of portal");
        return false;
      }
      await sleep(1_500);
      if (stopped || !hooks.allowServerPortals() || String(bot.game?.dimension ?? "") !== dimension) return false;
    }
    portalEntryTimedOut = false;

    const pos = bot.entity.position;
    const dim = String(bot.game?.dimension ?? "").toLowerCase();
    const gm = String(bot.game?.gameMode ?? "").toLowerCase();

    if (dim.includes("overworld") && (gm === "adventure" || gm === "1") && pos.y < 40) {
      log.info("Post-portal staging; waiting for main-world transfer");
      stopMovement();
      const until = Date.now() + 12_000;
      while (Date.now() < until && !stopped) {
        if (!bot.entity) return false;
        const nowGm = String(bot.game?.gameMode ?? "").toLowerCase();
        if (nowGm === "survival" || nowGm === "0") {
          const here = bot.entity.position;
          hooks.onEntered({
            kind: "server",
            position: { x: here.x, y: here.y, z: here.z },
            distance: 0,
            blockName: "staging-transfer",
          });
          return true;
        }
        await sleep(200);
      }
    }

    if (dim.includes("overworld") && pos.y > 90) {
      try {
        const client = bot._client as { write: (name: string, params: unknown) => void; state?: string };
        if (!client.state || client.state === "play") {
          client.write("player_loaded", {});
          log.info("Sky lobby: resent player_loaded before the second portal");
        }
      } catch {
        // client may already be closing
      }
      await sleep(400);
    }

    const raw = findPortalBlocks(bot, 64, 2048);
    const groundLobby = worldKind === "lobby" && dim.includes("overworld") &&
      gm === "adventure" && pos.y >= 40 && pos.y <= 90;
    let portal = pickServerPortal(raw, worldKind, true, groundLobby);
    if (!portal && raw.length > 0) {
      log.info("Nearby portal blocks are not a normal 2×3 vanilla portal; skipping decorative portal wall");
    }
    if (!portal) {
      const known = KNOWN_SERVER_PORTALS
        .map((spot) => ({ spot, distance: pos.distanceTo(new Vec3(spot.x, spot.y, spot.z)) }))
        .filter((entry) => entry.distance < 80)
        .sort((a, b) => a.distance - b.distance)[0];
      if (known) {
        portal = {
          kind: "server",
          position: known.spot,
          distance: known.distance,
          blockName: "nether_portal",
        };
      }
    }
    if (!portal) {
      hooks.onMiss(raw.length > 0 ? "no vanilla-sized server portal in range" : "no server portal in range");
      return false;
    }

    hooks.onFound(portal);
    log.info(
      `Walking into ${portal.kind} portal at ${portal.position.x.toFixed(1)},${portal.position.y.toFixed(1)},${portal.position.z.toFixed(1)} (${portal.blockName}, ${portal.distance.toFixed(1)}m)`,
    );

    const start = bot.entity.position.clone();
    lastPos = start;
    const toward = new Vec3(portal.position.x, portal.position.y, portal.position.z);
    const target = new Vec3(toward.x, start.y, toward.z);

    try {
      const movements = new Movements(bot);
      movements.canDig = false;
      movements.allow1by1towers = false;
      bot.pathfinder.setMovements(movements);
      bot.pathfinder.setGoal(new goals.GoalNear(target.x, start.y, target.z, 0.6));
    } catch (error) {
      log.warn("Pathfinder unavailable, walking forward instead", error instanceof Error ? error.message : error);
    }

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !stopped) {
      if (!bot.entity) break;
      const here = bot.entity.position;
      if (lastPos && here.distanceTo(lastPos) > 18) {
        stopMovement();
        hooks.onEntered(portal);
        return true;
      }
      if (inPortalBlock(bot)) {
        log.info("Inside server portal; standing with physics on until transfer");
        stopMovement();
        return waitForTransfer(portal, start);
      }

      try {
        await bot.lookAt(new Vec3(target.x, here.y + 1.2, target.z), true);
      } catch {
        // look can fail mid-teleport
      }
      bot.setControlState("forward", true);
      bot.setControlState("sprint", here.distanceTo(target) > 3);
      lastPos = here.clone();
      await sleep(150);
    }

    stopMovement();
    hooks.onMiss("timed out walking into portal");
    return false;
  };

  const runLoop = async () => {
    while (hunting && !stopped) {
      const worldKind = hooks.getWorldKind();
      if (!hooks.allowServerPortals()) {
        hunting = false;
        break;
      }
      if (!isLobbyLike(worldKind) && worldKind !== "unknown") {
        hunting = false;
        break;
      }
      const ok = await huntOnce();
      if (ok) {
        await sleep(3500);
        continue;
      }
      log.info(`Portal not found or not entered. Retrying in ${Math.round(retryMs / 1000)}s`);
      const waitUntil = Date.now() + retryMs;
      while (hunting && !stopped && Date.now() < waitUntil) {
        await sleep(500);
      }
    }
    stopMovement();
  };

  return {
    start() {
      if (hunting) return;
      stopped = false;
      hunting = true;
      void runLoop();
    },
    stop() {
      hunting = false;
      stopped = true;
      stopMovement();
    },
    huntOnce,
    get hunting() {
      return hunting;
    },
  };
}
