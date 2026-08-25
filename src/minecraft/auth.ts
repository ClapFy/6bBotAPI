import type { Bot } from "mineflayer";
import { log } from "../logger.ts";
import { sendCommand } from "./command.ts";

const LOGIN_PROMPT =
  /\/login|please\s+login|log\s+in|type\s+\/login|login\s+with|authenticate|not\s+authenticated/i;
const REGISTER_PROMPT = /\/register|please\s+register|register\s+with|create\s+an?\s+account/i;
const SUCCESS =
  /successfully\s+logged|login\s+successful|you\s+are\s+now\s+logged|logged\s+in|you are now logged in/i;
const WRONG = /wrong\s+password|incorrect\s+password|invalid\s+password|login\s+failed/i;
const ALREADY = /already\s+logged|already\s+authenticated|you\s+are\s+logged/i;

export interface AuthController {
  authenticated: boolean;
  handleText(text: string): void;
  tryLogin(force?: boolean): void;
  destroy(): void;
}

function strip(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "").replace(/\u00a7[0-9a-fk-or]/gi, "").trim();
}

function looksLikePlayerChat(text: string): boolean {
  const t = strip(text);
  if (/^<[^>]+>/.test(t)) return true;
  if (/^\[[^\]]+]\s+\S+[: ]/.test(t)) return true;
  if (/^[A-Za-z0-9_]{3,16}[:>]\s/.test(t)) return true;
  return false;
}

export function attachAuth(bot: Bot, password: string, onAuthenticated: () => void): AuthController {
  let authenticated = false;
  let lastAttempt = 0;
  let attempts = 0;
  const cooldownMs = 4_000;

  const canChat = () => {
    const client = bot._client as { chat?: unknown; state?: string } | undefined;
    return Boolean(bot.entity && client && typeof client.chat === "function" && client.state === "play");
  };

  const tryLogin = (force = false) => {
    if (authenticated && !force) return;
    if (!canChat()) return;
    if (!password) {
      log.warn("No in-game password stored; cannot /login");
      return;
    }
    const now = Date.now();
    if (!force && now - lastAttempt < cooldownMs) return;
    lastAttempt = now;
    attempts += 1;
    log.info(`Sending /login (attempt ${attempts})`);
    sendCommand(bot, `login ${password}`);
  };

  const tryRegister = () => {
    if (!password) return;
    const now = Date.now();
    if (now - lastAttempt < cooldownMs) return;
    lastAttempt = now;
    if (!canChat()) return;
    log.info("Sending /register");
    sendCommand(bot, `register ${password} ${password}`);
  };

  const markAuthenticated = (reason: string) => {
    if (authenticated) return;
    authenticated = true;
    log.info(`Authenticated (${reason})`);
    onAuthenticated();
  };

  const handleText = (text: string) => {
    if (looksLikePlayerChat(text)) return;
    const clean = strip(text);
    if (!clean) return;

    if (WRONG.test(clean)) {
      log.error("Server rejected the stored password");
      return;
    }
    if (SUCCESS.test(clean) || ALREADY.test(clean)) {
      markAuthenticated(clean.slice(0, 80));
      return;
    }
    if (REGISTER_PROMPT.test(clean)) {
      tryRegister();
      return;
    }
    if (LOGIN_PROMPT.test(clean)) {
      tryLogin();
    }
  };

  const onMessage = (jsonMsg: { toString?: () => string } | string) => {
    const text = typeof jsonMsg === "string" ? jsonMsg : jsonMsg?.toString?.() ?? "";
    handleText(text);
  };

  bot.on("messagestr", (msg) => handleText(String(msg)));
  bot.on("message", onMessage);
  bot.on("title", (text) => handleText(String(text)));
  bot.on("actionBar", (text) => handleText(String(text)));

  const spawnTimer = setTimeout(() => {
    if (!authenticated) tryLogin();
  }, 1500);

  const windowHandler = (window: { title?: string }) => {
    const title = strip(String(window.title ?? ""));
    if (/login|password|auth|register/i.test(title)) {
      log.info(`Auth window opened (${title || "untitled"}); sending /login as well`);
      tryLogin(true);
    }
  };
  bot.on("windowOpen", windowHandler);

  return {
    get authenticated() {
      return authenticated;
    },
    set authenticated(value: boolean) {
      authenticated = value;
    },
    handleText,
    tryLogin,
    destroy() {
      clearTimeout(spawnTimer);
      bot.removeListener("messagestr", handleText as never);
      bot.removeListener("message", onMessage as never);
      bot.removeListener("windowOpen", windowHandler as never);
    },
  };
}
