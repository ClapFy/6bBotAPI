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
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 200)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} y=${p?.y.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function walkTo(tx: number, tz: number, seconds = 10) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    if (Math.hypot(here.x - tx, here.z - tz) < 1.3) break;
    try {
      await bot.lookAt(new Vec3(tx, here.y + 1.2, tz));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    await sleep(80);
  }
  bot.clearControlStates();
  console.log("at", fmt(), bot.blockAt(bot.entity.position.floored())?.name);
}

function dump(label: string, radius = 18) {
  const origin = bot.entity.position.floored();
  const counts: Record<string, number> = {};
  const special: string[] = [];
  const holes: string[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -25; dy <= 8; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b) continue;
        if (b.name === "air" || b.name === "cave_air") {
          if (dy === -1) holes.push(`${b.position.x},${b.position.z}`);
          continue;
        }
        counts[b.name] = (counts[b.name] ?? 0) + 1;
        if (/portal|gateway|barrier|water|lava|carpet|sign|pressure|button|nether|obsidian|end_/.test(b.name)) {
          special.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
        }
      }
    }
  }
  console.log(
    label,
    "pos",
    fmt(),
    "top",
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );
  console.log(label, "special", special.slice(0, 25), "holes-underfoot", holes.slice(0, 15), "holecount", holes.length);
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
    await sleep(3000);
    console.log("sky", fmt());
    await walkTo(305, 427, 10);
    dump("west-of-portal", 20);
    await walkTo(290, 427, 8);
    dump("further-west", 16);
    await walkTo(305, 400, 8);
    dump("west-south", 12);
    await walkTo(305, 455, 10);
    dump("west-north", 12);
    await walkTo(280, 427, 8);
    dump("edge", 12);
  } catch (error) {
    console.error("probe error", error);
  } finally {
    console.log("final", fmt());
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
