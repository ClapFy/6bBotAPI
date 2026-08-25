import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

const password = process.env.KRYNBOT_PASSWORD ?? "";
const bot = mineflayer.createBot({
  host: process.env.KRYNBOT_HOST ?? "alt3.6b6t.org",
  port: 25565,
  username: process.env.KRYNBOT_USERNAME ?? "KrynoBot",
  auth: "offline",
  version: "1.21.11",
  hideErrors: false,
  viewDistance: "far",
});

function textOf(msg: unknown): string {
  if (msg && typeof msg === "object" && "toString" in msg) {
    const text = (msg as { toString: () => string }).toString();
    if (text && text !== "[object Object]") return text;
  }
  return String(msg);
}

bot.on("messagestr", (m) => console.log("CHAT", m));
bot.on("kicked", (r) => console.log("KICK", textOf(r)));
bot.on("error", (e) => console.log("ERR", e.message));
bot.on("respawn", () => console.log("RESPAWN", bot.entity?.position, bot.game?.dimension));
bot.on("forcedMove", () => console.log("MOVE", bot.entity?.position, bot.game?.dimension));

function dump(label: string) {
  const pos = bot.entity.position;
  const origin = pos.floored();
  const portals: string[] = [];
  const counts: Record<string, number> = {};
  for (let dx = -48; dx <= 48; dx++) {
    for (let dy = -16; dy <= 20; dy++) {
      for (let dz = -48; dz <= 48; dz++) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b) continue;
        counts[b.name] = (counts[b.name] ?? 0) + 1;
        if (
          b.name.includes("portal") ||
          b.name.includes("gateway") ||
          b.name === "obsidian" ||
          b.name === "crying_obsidian" ||
          b.name === "nether_portal"
        ) {
          portals.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
        }
      }
    }
  }
  const y = origin.y;
  const lines: string[] = [];
  for (let dz = -28; dz <= 28; dz++) {
    let row = "";
    for (let dx = -28; dx <= 28; dx++) {
      if (dx === 0 && dz === 0) {
        row += "@";
        continue;
      }
      let ch = " ";
      for (let dy = 8; dy >= -6; dy--) {
        const n = bot.blockAt(new Vec3(origin.x + dx, y + dy, origin.z + dz))?.name ?? "air";
        if (n === "nether_portal") {
          ch = "P";
          break;
        }
        if (n === "end_gateway" || n === "end_portal") {
          ch = "E";
          break;
        }
        if (n === "obsidian" || n === "crying_obsidian") {
          ch = "O";
          break;
        }
        if (n.includes("water")) {
          ch = "~";
          break;
        }
        if (n === "end_stone") {
          ch = ".";
          break;
        }
        if (n !== "air" && n !== "cave_air" && ch === " ") ch = "#";
      }
      row += ch;
    }
    lines.push(row);
  }
  const summary = {
    label,
    pos,
    dimension: bot.game.dimension,
    gm: bot.game.gameMode,
    yaw: bot.entity.yaw,
    pitch: bot.entity.pitch,
    top: Object.entries(counts)
      .filter(([n]) => n !== "air")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25),
    portals: portals.slice(0, 120),
    map: lines.join("\n"),
  };
  console.log(`\n===== ${label} =====`);
  console.log("pos", pos, "dim", bot.game.dimension, "gm", bot.game.gameMode, "yaw", bot.entity.yaw.toFixed(2));
  console.log("top", summary.top);
  console.log("portals", summary.portals);
  console.log(summary.map);
  fs.mkdirSync("logs", { recursive: true });
  fs.writeFileSync(`logs/probe-${label}.json`, JSON.stringify(summary, null, 2));
}

bot.once("spawn", async () => {
  console.log("spawn", bot.entity.position, bot.game.dimension);
  await sleep(2500);
  dump("pre-login");
  console.log("sending login");
  bot.chat(`/login ${password}`);
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const p = bot.entity?.position;
    console.log(`t+${i + 1}s`, p, bot.game.dimension);
    if (p && (Math.abs(p.x - 1000.5) > 3 || Math.abs(p.z - 1000.5) > 3 || bot.game.dimension !== "the_end")) {
      await sleep(2500);
      dump("post-login");
      bot.quit("probe");
      return;
    }
  }
  dump("still-auth");
  bot.quit("probe");
});

bot.on("end", (r) => {
  console.log("end", r);
  process.exit(0);
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
