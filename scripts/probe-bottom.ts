import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const version = process.env.KRYNBOT_VERSION ?? "1.21.8";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version,
  brand: "fabric",
  hideErrors: true,
  viewDistance: 12,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 200)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot.on("chunkColumnLoad", (v: { x: number; z: number }) => {
  if (Math.abs(v.x - bot.entity?.position.x) < 40) console.log("CHUNK", v.x, v.z, fmt());
});

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitChunk() {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    if (bot.blockAt(bot.entity.position)) return true;
    await sleep(200);
  }
  return false;
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
    const wait = Date.now() + 10_000;
    while (Date.now() < wait && String(bot.game.dimension).includes("end")) await sleep(200);
    await sleep(2500);
    console.log("sky", fmt());
    bot.chat("/ski");
    await sleep(1500);
    console.log("inv", bot.inventory.items().map((i) => `${i.name}x${i.count}`));

    const until = Date.now() + 50_000;
    let lastLog = 0;
    while (Date.now() < until) {
      const here = bot.entity.position;
      if (String(bot.game.gameMode) === "survival" || here.y < 30) {
        console.log("LEFT LOBBY", fmt());
        break;
      }
      if (!bot.blockAt(here)) {
        console.log("waiting chunks", fmt());
        await waitChunk();
      }
      try {
        await bot.lookAt(new Vec3(here.x - 25, here.y - 6, 427));
      } catch {
        // ignore
      }
      bot.setControlState("forward", true);
      bot.setControlState("sprint", true);
      if (Date.now() - lastLog > 2000) {
        lastLog = Date.now();
        const ground = bot.blockAt(here.offset(0, -1, 0).floored())?.name;
        console.log("slope", fmt(), "ground", ground, "inv", bot.inventory.items().length);
      }
      await sleep(120);
    }
    const pos = bot.entity.position.floored();
    const special: string[] = [];
    for (let dx = -20; dx <= 20; dx++) {
      for (let dy = -10; dy <= 8; dy++) {
        for (let dz = -20; dz <= 20; dz++) {
          const b = bot.blockAt(pos.offset(dx, dy, dz));
          if (b && /portal|water|lava|barrier|sign|pressure|gold|beacon/.test(b.name)) {
            special.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
          }
        }
      }
    }
    console.log("bottom special", special.slice(0, 30));
    console.log("final", fmt());
  } catch (error) {
    console.error("probe error", error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
