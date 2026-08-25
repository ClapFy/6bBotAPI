import type { Bot } from "mineflayer";
import { log } from "../logger.ts";

const CHANNEL = "anarchymod:join";

/**
 * AnarchyMod does two things on a vanilla client:
 *  1. Skip Mojang's blocked-server list (vanilla-only; mineflayer never checks it)
 *  2. Send an empty custom payload on `anarchymod:join` after login
 *
 * We replicate (2) so the 6b6t proxy sees the same join notification.
 */
export function attachAnarchyMod(bot: Bot): void {
  const send = (reason: string) => {
    try {
      const client = bot._client as {
        registerChannel?: (name: string, type: unknown, custom?: boolean) => void;
        writeChannel?: (name: string, params: unknown) => void;
        write: (name: string, params: unknown) => void;
      };

      try {
        client.registerChannel?.(CHANNEL, ["void", []], true);
      } catch {
        // Channel may already exist or this protocol may not support it.
      }

      if (typeof client.writeChannel === "function") {
        client.writeChannel(CHANNEL, {});
      }

      client.write("custom_payload", {
        channel: CHANNEL,
        data: Buffer.alloc(0),
      });
      log.debug(`Sent AnarchyMod join payload (${reason})`);
    } catch (error) {
      log.warn(`AnarchyMod join payload failed (${reason})`, error instanceof Error ? error.message : error);
    }
  };

  bot.once("login", () => send("login"));
  bot.on("spawn", () => send("spawn"));
  const raw = bot._client as unknown as { on: (event: string, listener: () => void) => void };
  raw.on("finish_configuration", () => setTimeout(() => send("reconfigure"), 100));
}
