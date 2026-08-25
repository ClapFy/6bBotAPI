import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const version = "1.21.11";

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

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 180)));
bot.on("kicked", (r) => console.log("KICK", r));
bot.on("spawn", () => console.log("SPAWN", fmt()));
bot.on("forcedMove", () => console.log("MOVE", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

async function walkThrough(tx: number, ty: number, tz: number, label: string) {
  const start = bot.entity.position.clone();
  const startDim = String(bot.game.dimension);
  const from = start;
  const dx = tx - from.x;
  const dz = tz - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const target = new Vec3(tx + (dx / len) * 4, ty, tz + (dz / len) * 4);
  console.log(label, "walk through toward", target, "from", fmt());
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    const standing = bot.blockAt(here.floored())?.name;
    const eyes = bot.blockAt(here.offset(0, 1, 0).floored())?.name;
    if (standing === "nether_portal" || eyes === "nether_portal") {
      bot.setControlState("forward", true);
      await sleep(400);
      bot.clearControlStates();
      bot.physicsEnabled = false;
      console.log(label, "in portal, freeze", fmt());
      break;
    }
    try {
      await bot.lookAt(target);
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(120);
  }
  const waitUntil = Date.now() + 18000;
  while (Date.now() < waitUntil) {
    await sleep(300);
    const here = bot.entity.position;
    if (here.distanceTo(start) > 25 || String(bot.game.dimension) !== startDim) {
      bot.physicsEnabled = true;
      console.log(label, "TRANSFERRED", fmt());
      return true;
    }
  }
  bot.physicsEnabled = true;
  console.log(label, "no transfer", fmt());
  return false;
}

bot.once("spawn", async () => {
  await sleep(800);
  bot.chat(`/login ${password}`);
  while (bot.entity.position.x > 0) await sleep(200);
  await sleep(2500);
  await walkThrough(-1000, 102, -988, "p1");
  await sleep(4000);
  console.log("after p1", fmt());
  const pos = bot.entity.position.floored();
  const interesting: Record<string, number> = {};
  for (let dx = -50; dx <= 50; dx++) {
    for (let dy = -30; dy <= 15; dy++) {
      for (let dz = -50; dz <= 50; dz++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz));
        if (!b || b.name === "air") continue;
        interesting[b.name] = (interesting[b.name] ?? 0) + 1;
      }
    }
  }
  console.log(
    "lobby2 blocks",
    Object.entries(interesting)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
  );
  const special = Object.keys(interesting).filter((n) =>
    /portal|gateway|button|pressure|carpet|plate|sign|beacon|end_rod|nether|obsidian/.test(n),
  );
  console.log("special", special);

  console.log("trying stand in p2 with physics for 8s");
  const target = new Vec3(311, 163.5, 427);
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    try {
      await bot.lookAt(target);
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(150);
    console.log("p2", fmt(), bot.blockAt(bot.entity.position.floored())?.name);
    if (bot.game.gameMode !== "adventure" || bot.entity.position.y < 80) {
      console.log("left lobby2", fmt());
      break;
    }
  }
  bot.clearControlStates();
  await sleep(3000);
  console.log("final", fmt());
  bot.quit("probe");
});

bot.on("end", () => process.exit(0));
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
