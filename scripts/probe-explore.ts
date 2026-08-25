import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const version = process.env.KRYNBOT_VERSION ?? "1.21.8";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version,
  hideErrors: true,
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("spawn", () => console.log("SPAWN", fmt()));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));

function fmt() {
  const p = bot.entity?.position;
  const yaw = bot.entity?.yaw;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} yaw=${yaw?.toFixed(2)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function walkTo(tx: number, tz: number, seconds = 8) {
  const target = new Vec3(tx, bot.entity.position.y, tz);
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    if (here.xzDistanceTo(target) < 1.2) break;
    try {
      await bot.lookAt(target.offset(0, 1.2, 0));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    bot.setControlState("sprint", here.xzDistanceTo(target) > 4);
    await sleep(80);
  }
  bot.clearControlStates();
  console.log("at", fmt(), "block", bot.blockAt(bot.entity.position.floored())?.name);
}

function dumpAround(label: string, radius = 12) {
  const origin = bot.entity.position.floored();
  const counts: Record<string, number> = {};
  const special: string[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -8; dy <= 10; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b || b.name === "air") continue;
        counts[b.name] = (counts[b.name] ?? 0) + 1;
        if (/portal|gateway|barrier|structure|light|water|lava|carpet|sign|pressure|button|plate|beacon|end_rod/.test(b.name)) {
          special.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
        }
      }
    }
  }
  console.log(
    label,
    "top",
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
  );
  console.log(label, "special", special.slice(0, 40));
}

function dumpPlayers() {
  const origin = bot.entity.position;
  for (const e of Object.values(bot.entities)) {
    if (e.type !== "player") continue;
    const name = (e as { username?: string }).username ?? e.name;
    const d = e.position.distanceTo(origin).toFixed(1);
    console.log("PLAYER", name, `${e.position.x.toFixed(1)},${e.position.y.toFixed(1)},${e.position.z.toFixed(1)} d=${d}`);
  }
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    bot.chat(`/login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(2000);

    const until = Date.now() + 12_000;
    while (Date.now() < until) {
      const here = bot.entity.position;
      const standing = bot.blockAt(here.floored())?.name;
      if (standing === "nether_portal") {
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
    await sleep(3500);
    console.log("sky", fmt());
    dumpPlayers();
    dumpAround("spawn", 16);

    console.log("watching players 12s");
    const untilWatch = Date.now() + 12_000;
    while (Date.now() < untilWatch) {
      dumpPlayers();
      await sleep(3000);
    }

    console.log("walk east to NPC ring ~362,443");
    await walkTo(362, 443, 12);
    dumpAround("npc-ring", 14);
    dumpPlayers();

    console.log("walk further east 390,427");
    await walkTo(390, 427, 10);
    dumpAround("east", 12);

    console.log("walk south red slope 323,402");
    await walkTo(323, 402, 12);
    dumpAround("south", 12);

    console.log("walk north 324,470");
    await walkTo(324, 470, 12);
    dumpAround("north", 12);
  } catch (error) {
    console.error("probe error", error);
  } finally {
    console.log("final", fmt());
    await sleep(500);
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
