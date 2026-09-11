import type { Bot } from "mineflayer";
import { log } from "../logger.ts";

/**
 * Vanilla 1.21.2+ sends `tick_end` every client tick and 1.21.4+ sends
 * `player_loaded` after the play login + terrain. Mineflayer 4.x does not.
 * 6b6t's sky-lobby backend ignores commands and portal logic until then.
 */
export function attachProtocolCompat(bot: Bot): void {
  const raw = bot._client as unknown as {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    write: (name: string, params: unknown) => void;
    state?: string;
  };

  let lastLoadedAt = 0;
  let pendingLoaded: NodeJS.Timeout | null = null;
  let waitingForChunks = false;

  const sendLoaded = (reason: string, force = false) => {
    try {
      if (!bot.supportFeature("sendsPlayerLoadedPacket")) return;
      if (raw.state && raw.state !== "play") return;
      const now = Date.now();
      if (!force && now - lastLoadedAt < 800) return;
      lastLoadedAt = now;
      waitingForChunks = false;
      raw.write("player_loaded", {});
      log.info(`Sent player_loaded (${reason})`);
    } catch (error) {
      log.warn(`player_loaded failed (${reason})`, error instanceof Error ? error.message : error);
    }
  };

  const scheduleLoaded = (reason: string, delayMs: number) => {
    if (pendingLoaded) clearTimeout(pendingLoaded);
    pendingLoaded = setTimeout(() => sendLoaded(reason, true), delayMs);
  };

  const resetChatSession = () => {
    const client = bot._client as {
      _lastSeenMessages?: { pending?: number; offset?: number; length: number };
      _lastChatSignature?: unknown;
      _lastRejectedMessage?: unknown;
    };
    const seen = client._lastSeenMessages;
    if (seen) {
      seen.pending = 0;
      seen.offset = 0;
      seen.length = 0;
    }
    client._lastChatSignature = null;
    client._lastRejectedMessage = null;
  };

  const sendSettings = (reason: string) => {
    try {
      if (raw.state && raw.state !== "play") return;
      raw.write("settings", {
        locale: "en_US",
        viewDistance: 8,
        chatFlags: 0,
        chatColors: true,
        skinParts: 127,
        mainHand: 1,
        enableTextFiltering: false,
        enableServerListing: true,
        particleStatus: "all",
      });
      log.info(`Sent client settings (${reason})`);
    } catch (error) {
      log.warn(`settings failed (${reason})`, error instanceof Error ? error.message : error);
    }
  };

  raw.on("login", () => {
    resetChatSession();
    sendSettings("play-login");
    scheduleLoaded("play-login", 250);
  });
  bot.on("spawn", () => scheduleLoaded("spawn", 400));
  bot.on("respawn", () => scheduleLoaded("respawn", 400));
  raw.on("finish_configuration", () => {
    resetChatSession();
    setTimeout(() => sendSettings("reconfigure"), 120);
    scheduleLoaded("reconfigure", 900);
  });
  raw.on("game_state_change", (...args: unknown[]) => {
    const packet = args[0] as { reason?: string | number } | undefined;
    const reason = String(packet?.reason ?? "");
    if (reason === "level_chunks_load_start" || reason === "13") {
      waitingForChunks = true;
      scheduleLoaded("chunks-load-start", 450);
    }
  });
  raw.on("chunk_batch_finished", () => {
    if (waitingForChunks) sendLoaded("chunk-batch", true);
  });

  bot.on("physicsTick", () => {
    try {
      if (raw.state && raw.state !== "play") return;
      if (bot.supportFeature("sendsClientTickEndPacket")) {
        raw.write("tick_end", {});
      }
      if (bot.supportFeature("newPlayerInputPacket")) {
        const c = bot.controlState ?? {};
        raw.write("player_input", {
          inputs: {
            forward: Boolean(c.forward),
            backward: Boolean(c.back),
            left: Boolean(c.left),
            right: Boolean(c.right),
            jump: Boolean(c.jump),
            shift: Boolean(c.sneak),
            sprint: Boolean(c.sprint),
          },
        });
      }
    } catch {}
  });
}
