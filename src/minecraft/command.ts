import type { Bot } from "mineflayer";
import { log } from "../logger.ts";

/**
 * 1.20.5+ splits unsigned commands onto `chat_command` (command string only)
 * and signed ones onto `chat_command_signed`. Mineflayer's bot.chat() still
 * stuffs signed-session fields into `chat_command`, which some 6b6t backends
 * drop after a Velocity transfer. Write the unsigned packet directly.
 */
export function sendCommand(bot: Bot, command: string): void {
  const text = command.startsWith("/") ? command.slice(1) : command;
  const client = bot._client as { state?: string; chat?: (msg: string) => void; write: (name: string, params: unknown) => void };
  if (client.state && client.state !== "play") {
    log.warn(`Cannot send /${text}; client state is ${client.state}`);
    return;
  }
  const safe = /^(login|register|changepassword|l)\b/i.test(text) ? text.split(/\s+/)[0] + " ***" : text;
  try {
    client.write("chat_command", { command: text });
    log.info(`Command /${safe}`);
  } catch (error) {
    log.warn(`chat_command write failed for /${safe}`, error instanceof Error ? error.message : error);
    if (/^(login|register|changepassword|l)\b/i.test(text)) return;
    try {
      bot.chat(`/${text}`);
    } catch {
      // ignore
    }
  }
}

export function leftLobby(bot: Bot, start: { x: number; y: number; z: number; dim: string }): boolean {
  const pos = bot.entity?.position;
  if (!pos) return false;
  const gm = String(bot.game?.gameMode ?? "").toLowerCase();
  const dim = String(bot.game?.dimension ?? "");
  if (gm === "survival" || gm === "0") return true;
  if (dim && start.dim && dim !== start.dim && !dim.includes("end") && gm !== "adventure" && gm !== "1") {
    return true;
  }
  return false;
}
