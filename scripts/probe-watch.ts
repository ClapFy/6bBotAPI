import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { sendCommand } from "../src/minecraft/command.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: "1.21.8",
  brand: "fabric",
  hideErrors: true,
  checkTimeoutInterval: 90_000,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 160)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("forcedMove", () => console.log("MOVE", fmt(), bot.game?.gameMode));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("player_remove", (p: unknown) => console.log("PREMOVE", JSON.stringify(p).slice(0, 200)));

function commandTree(p: { nodes?: unknown[] }) {
  const nodes = (p.nodes ?? []) as {
    flags?: { has_command?: number; command_node_type?: number };
    extraNodeData?: { name?: string };
    children?: number[];
    name?: string;
  }[];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const name = n.extraNodeData?.name ?? n.name;
    if (!name) continue;
    if (!/skip|lobby|join|leave|spawn|server|world|play|portal|warp/i.test(name)) continue;
    const childNames = (n.children ?? [])
      .map((idx) => nodes[idx]?.extraNodeData?.name ?? nodes[idx]?.name)
      .filter(Boolean);
    console.log("CMDNODE", name, "exec", n.flags?.has_command, "children", childNames);
  }
}

bot._client.on("declare_commands", (p: { nodes?: unknown[] }) => {
  commandTree(p);
});

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function realPlayers() {
  return Object.values(bot.entities).filter((e) => {
    if (e.type !== "player" || e === bot.entity) return false;
    const name = String((e as { username?: string }).username ?? "");
    if (!name || name === "KrynoBot" || name.includes("§")) return false;
    return true;
  });
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    sendCommand(bot, `login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(1200);
    const untilP1 = Date.now() + 12_000;
    while (Date.now() < untilP1) {
      if (bot.blockAt(bot.entity.position.floored())?.name === "nether_portal") {
        bot.clearControlStates();
        break;
      }
      try {
        await bot.lookAt(new Vec3(-1000, 102, -988));
      } catch {
        // ignore
      }
      bot.setControlState("forward", true);
      await sleep(80);
    }
    const wait = Date.now() + 12_000;
    while (Date.now() < wait && String(bot.game.dimension).includes("end")) await sleep(200);
    await sleep(2000);
    console.log("sky", fmt(), bot.game.gameMode);
    sendCommand(bot, "skiplobby confirm");
    sendCommand(bot, "player join");
    await sleep(1500);
    const seen = new Map<string, string>();
    const until = Date.now() + 22_000;
    while (Date.now() < until) {
      if (String(bot.game.gameMode) === "survival") {
        console.log("LEFT", fmt());
        return;
      }
      for (const p of realPlayers()) {
        const name = String((p as { username?: string }).username);
        const loc = `${p.position.x.toFixed(1)},${p.position.y.toFixed(1)},${p.position.z.toFixed(1)}`;
        const prev = seen.get(name);
        if (prev !== loc) {
          seen.set(name, loc);
          console.log("P", name, loc, "dx", (p.position.x - 324.5).toFixed(1));
        }
      }
      for (const name of [...seen.keys()]) {
        if (!realPlayers().some((p) => (p as { username?: string }).username === name)) {
          console.log("GONE", name, "last", seen.get(name));
          seen.delete(name);
        }
      }
      await sleep(400);
    }
    console.log("final", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
