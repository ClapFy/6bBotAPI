import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function envFileCandidates(): string[] {
  const cwdEnv = path.resolve(process.cwd(), ".env");
  const packageEnv = path.resolve(root, ".env");
  return cwdEnv === packageEnv ? [packageEnv] : [cwdEnv, packageEnv];
}

for (const envPath of envFileCandidates()) {
  dotenv.config({ path: envPath });
}

function envString(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type AuthMode = "offline" | "microsoft";

export interface KrynConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  auth: AuthMode;
  version: string;
  viewDistance: number;
  controlHost: string;
  controlPort: number;
  controlToken: string;
  requiredServerPortals: number;
  portalRetryMs: number;
  reconnectMs: number;
  rootDir: string;
}

export function loadConfig(overrides: Partial<KrynConfig> = {}): KrynConfig {
  const authRaw = envString("KRYNBOT_AUTH", "offline").toLowerCase();
  const config: KrynConfig = {
    host: envString("KRYNBOT_HOST", "alt3.6b6t.org"),
    port: envNumber("KRYNBOT_PORT", 25565),
    username: envString("KRYNBOT_USERNAME"),
    password: envString("KRYNBOT_PASSWORD"),
    auth: authRaw === "microsoft" ? "microsoft" : "offline",
    version: envString("KRYNBOT_VERSION", "1.21.11"),
    viewDistance: envNumber("KRYNBOT_VIEW_DISTANCE", 6),
    controlHost: envString("KRYNBOT_CONTROL_HOST", "127.0.0.1"),
    controlPort: envNumber("KRYNBOT_CONTROL_PORT", 37637),
    controlToken: envString("KRYNBOT_CONTROL_TOKEN"),
    requiredServerPortals: envNumber("KRYNBOT_SERVER_PORTALS", 2),
    portalRetryMs: envNumber("KRYNBOT_PORTAL_RETRY_MS", 60_000),
    reconnectMs: envNumber("KRYNBOT_RECONNECT_MS", 8_000),
    rootDir: root,
  };
  const cleaned = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<KrynConfig>;
  return { ...config, ...cleaned };
}

export function assertJoinConfig(config: KrynConfig): void {
  if (!config.username) {
    throw new Error("Missing username. Set KRYNBOT_USERNAME in .env");
  }
  if (config.auth === "offline" && !config.password) {
    throw new Error("Missing in-game password. Set KRYNBOT_PASSWORD in .env");
  }
}

export function credentialsExist(config: KrynConfig): boolean {
  return Boolean(config.username && (config.auth !== "offline" || config.password));
}

export function configPath(): string {
  for (const envPath of envFileCandidates()) {
    if (fs.existsSync(envPath)) return envPath;
  }
  return path.join(process.cwd(), ".env");
}

export function upsertEnvVar(key: string, value: string): void {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error("invalid env key");
  if (/[\r\n]/.test(value)) throw new Error("invalid env value");
  const envPath = configPath();
  const line = `${key}=${value}`;
  let text = "";
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, "utf8");
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
    fs.writeFileSync(envPath, text, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    return;
  }
  fs.writeFileSync(envPath, `${line}\n`, { mode: 0o600 });
}
