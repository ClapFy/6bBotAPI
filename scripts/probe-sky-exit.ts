import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { leftLobby, sendCommand } from "../src/minecraft/command.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: process.env.KRYNBOT_VERSION ?? "1.21.8",
  brand: "fabric",
  hideErrors: true,
  checkTimeoutInterval: 120_000,
  viewDistance: 8,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("declare_commands", (p: { nodes?: unknown[]; rootIndex?: number }) => {
  const paths = executableCommands(p);
  console.log("EXECUTABLE", paths.filter((x) => /skip|lobby|ski|join|leave|help|spawn|server|play|hub|end/.test(x)).join(" | ") || paths.slice(0, 30).join(" | "));
});

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function executableCommands(packet: { nodes?: unknown[]; rootIndex?: number }): string[] {
  const nodes = (packet.nodes ?? []) as {
    flags?: { command_node_type?: string } | number;
    children?: number[];
    extraNodeData?: { name?: string };
  }[];
  const out: string[] = [];
  const walk = (index: number, prefix: string) => {
    const node = nodes[index];
    if (!node) return;
    const flags = typeof node.flags === "number" ? node.flags : 0;
    const type = typeof node.flags === "object" ? node.flags?.command_node_type : flags & 0x03;
    const executable = typeof node.flags === "number" ? Boolean(flags & 0x04) : false;
    const name = node.extraNodeData?.name;
    let path = prefix;
    if (type === 1 || type === "literal") path = prefix ? `${prefix} ${name}` : `/${name}`;
    if (executable && path) out.push(path);
    for (const child of node.children ?? []) walk(child, path);
  };
  walk(packet.rootIndex ?? 0, "");
  return [...new Set(out)].sort();
}

async function walkWest(seconds: number, start: { x: number; y: number; z: number; dim: string }) {
  const until = Date.now() + seconds * 1000;
  let lastLog = 0;
  while (Date.now() < until) {
    if (leftLobby(bot, start)) {
      console.log("LEFT LOBBY", fmt());
      return true;
    }
    const here = bot.entity.position;
    if (!bot.blockAt(here)) {
      console.log("waiting chunks", fmt());
      await sleep(400);
      continue;
    }
    try {
      await bot.lookAt(new Vec3(here.x - 20, here.y - 3, 427));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.log("west", fmt(), bot.blockAt(here.floored())?.name);
    }
    await sleep(100);
  }
  bot.clearControlStates();
  return false;
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    sendCommand(bot, `login ${password}`);
    const authWait = Date.now() + 15_000;
    while (Date.now() < authWait && bot.entity.position.x > 0) await sleep(200);
    await sleep(2000);
    console.log("end lobby", fmt());
    const untilP1 = Date.now() + 12_000;
    while (Date.now() < untilP1) {
      if (bot.blockAt(bot.entity.position.floored())?.name === "nether_portal") {
        bot.clearControlStates();
        console.log("p1 inside", fmt());
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
    await sleep(4000);
    console.log("sky", fmt());
    const start = {
      x: bot.entity.position.x,
      y: bot.entity.position.y,
      z: bot.entity.position.z,
      dim: String(bot.game.dimension),
    };

    sendCommand(bot, "help");
    await sleep(2000);
    sendCommand(bot, "ski");
    await sleep(2000);
    console.log("inv after ski", bot.inventory.items().map((i) => `${i.name}x${i.count}`));
    sendCommand(bot, "skiplobby");
    await sleep(5000);
    if (leftLobby(bot, start)) {
      console.log("SKIPLOBBY WORKED", fmt());
      return;
    }
    sendCommand(bot, "join");
    await sleep(2000);
    sendCommand(bot, "leave");
    await sleep(2000);
    console.log("after cmds", fmt(), bot.game.gameMode);

    console.log("walking west through wall / slope (not standing in portal)");
    if (await walkWest(40, start)) return;
    console.log("final", fmt(), "inv", bot.inventory.items().map((i) => i.name));
  } catch (error) {
    console.error("probe error", error);
  } finally {
    await sleep(500);
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 300));
