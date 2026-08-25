import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { createRequire } from "node:module";

dotenv.config();
const require = createRequire(import.meta.url);
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");

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

bot.loadPlugin(pathfinder);
attachAnarchyMod(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", m));
bot.on("kicked", (r) => {
  const text =
    r && typeof r === "object" && "value" in r
      ? JSON.stringify(r)
      : String((r as { toString?: () => string }).toString?.() ?? r);
  console.log("KICK", text);
});
bot._client.on("start_configuration", () => console.log("PACKET start_configuration"));
bot._client.on("finish_configuration", () => console.log("PACKET finish_configuration"));
bot._client.on("transfer", (d) => console.log("PACKET transfer", d));
bot.on("spawn", () => console.log("SPAWN", bot.entity?.position, bot.game?.dimension, bot.game?.gameMode));
bot.on("respawn", () => console.log("RESPAWN", bot.entity?.position, bot.game?.dimension));

bot.once("spawn", async () => {
  await sleep(1200);
  bot.chat(`/login ${password}`);
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    if (bot.entity.position.x < -100) break;
  }
  await sleep(1500);
  console.log("lobby pos", bot.entity.position);

  const target = new Vec3(-1000, 101.5, -988);
  const movements = new Movements(bot);
  movements.canDig = false;
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalNear(target.x, 100, target.z, 0.8));

  const start = bot.entity.position.clone();
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const here = bot.entity.position;
    const standing = bot.blockAt(here.floored())?.name;
    const eyes = bot.blockAt(here.offset(0, 1, 0).floored())?.name;
    console.log("at", here, standing, eyes, bot.game.dimension, bot._client.state);
    if (standing === "nether_portal" || eyes === "nether_portal") {
      console.log("IN PORTAL — freeze");
      bot.clearControlStates();
      bot.pathfinder.setGoal(null);
      bot.physicsEnabled = false;
      break;
    }
    try {
      await bot.lookAt(target);
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(200);
  }

  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const here = bot.entity?.position;
    console.log(
      `wait ${i}`,
      here,
      bot.game?.dimension,
      bot.game?.gameMode,
      bot._client.state,
    );
    if (here && (here.distanceTo(start) > 30 || !String(bot.game.dimension).includes("end"))) {
      console.log("TRANSFERRED");
      await sleep(3000);
      console.log("final", bot.entity.position, bot.game.dimension, bot.game.gameMode);
      bot.quit("probe");
      return;
    }
  }
  console.log("no transfer");
  bot.quit("probe");
});

bot.on("end", (r) => {
  console.log("end", r);
  process.exit(0);
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
