import type { Bot } from "mineflayer";
import { log } from "../logger.ts";

const PLAY_PACKETS = new Set([
  "position",
  "position_look",
  "look",
  "steer_vehicle",
  "vehicle_move",
  "player_command",
  "arm_animation",
  "use_entity",
  "block_dig",
  "block_place",
  "flying",
]);

/**
 * 6b6t's lobby portal is a Velocity backend transfer. During that
 * configuration phase, any movement packet gets you kicked with
 * "An internal error occurred in your connection."
 */
export function attachVelocityTransfer(bot: Bot): void {
  let inConfig = false;

  const enter = (reason: string) => {
    if (inConfig) return;
    inConfig = true;
    bot.physicsEnabled = false;
    try {
      bot.clearControlStates();
    } catch {
      // ignore
    }
    try {
      bot.pathfinder?.setGoal(null);
    } catch {
      // ignore
    }
    log.info(`Entered configuration phase (${reason}); physics paused`);
  };

  const leave = (reason: string) => {
    if (!inConfig) {
      bot.physicsEnabled = true;
      return;
    }
    inConfig = false;
    bot.physicsEnabled = true;
    log.info(`Left configuration phase (${reason}); physics resumed`);
  };

  const raw = bot._client as unknown as {
    write: (name: string, params: unknown) => void;
    state?: string;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  };
  const originalWrite = raw.write.bind(raw);
  raw.write = (name: string, params: unknown) => {
    const blocked = inConfig || raw.state === "configuration";
    if (blocked && PLAY_PACKETS.has(name)) return;
    return originalWrite(name, params);
  };

  raw.on("start_configuration", () => enter("start_configuration"));
  raw.on("finish_configuration", () => {
    setTimeout(() => leave("finish_configuration"), 50);
  });
  raw.on("select_known_packs", () => enter("select_known_packs"));
  raw.on("transfer", (...args: unknown[]) => {
    const data = args[0] as { host?: string; port?: number } | undefined;
    log.info(`Transfer packet to ${data?.host}:${data?.port}`);
    enter("transfer");
  });

  bot.on("resourcePack", (packUrl) => {
    try {
      bot.acceptResourcePack();
      log.info(`Accepted resource pack (no download) ${String(packUrl ?? "").slice(0, 120)}`);
    } catch (error) {
      log.warn("Could not accept resource pack", error instanceof Error ? error.message : error);
    }
  });

  bot.on("spawn", () => leave("spawn"));
}
