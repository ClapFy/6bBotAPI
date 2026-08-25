import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: "1.21.11",
  brand: "fabric",
  hideErrors: true,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

const seen = new Set<string>();
bot._client.on("packet", (data: unknown, meta: { name: string }) => {
  if (seen.has(meta.name)) return;
  seen.add(meta.name);
  if (/command|chat|transfer|game|login|respawn|position|config|bundle/.test(meta.name)) {
    console.log("PKT", meta.name);
  }
});

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 180)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => {
  console.log("CONFIG", fmt());
  seen.clear();
});
bot._client.on("declare_commands", () => console.log("DECLARE_COMMANDS"));
bot._client.on("commands", () => console.log("COMMANDS"));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    bot.chat(`/login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(2000);
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
    await sleep(4000);
    console.log("sky packets", [...seen].sort().join(","));
    console.log("sky", fmt());
    bot.chat("/skiplobby");
    const start = bot.entity.position.clone();
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      await sleep(250);
      if (bot.entity.position.distanceTo(start) > 40 || String(bot.game.gameMode) === "survival" || bot.entity.position.y < 70) {
        console.log("SKIP OK", fmt());
        break;
      }
    }
    const untilWalk = Date.now() + 10000;
    while (Date.now() < untilWalk) {
      if (bot.blockAt(bot.entity.position.floored())?.name === "nether_portal") {
        bot.clearControlStates();
        console.log("p2", fmt());
        break;
      }
      try {
        await bot.lookAt(new Vec3(311, 163.5, 427));
      } catch {
        // ignore
      }
      bot.setControlState("forward", true);
      await sleep(80);
    }
    await sleep(8000);
    console.log("final", fmt());
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
