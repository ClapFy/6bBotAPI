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
  checkTimeoutInterval: 120_000,
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 160)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("forcedMove", () => console.log("MOVE", fmt(), bot.game?.gameMode));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot.on("death", () => console.log("DEATH", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function left() {
  const gm = String(bot.game?.gameMode ?? "");
  return gm === "survival" || gm === "0";
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
    console.log("sky", fmt());

    const gold = bot.blockAt(bot.entity.position.offset(0, -1, 0).floored());
    console.log("stand on", gold?.name);
    if (gold) {
      try {
        await bot.activateBlock(gold);
        console.log("clicked gold");
      } catch (error) {
        console.log("gold click fail", error instanceof Error ? error.message : error);
      }
    }
    bot.setControlState("sneak", true);
    await sleep(1500);
    if (left()) {
      console.log("LEFT sneak gold", fmt());
      return;
    }

    const portal = bot.blockAt(new Vec3(311, 163, 427));
    if (portal) {
      try {
        await bot.activateBlock(portal);
        console.log("clicked portal block");
      } catch {
        // ignore
      }
    }

    console.log("sneak-walk west, no chunk wait");
    bot.setControlState("sneak", true);
    bot.setControlState("forward", true);
    bot.setControlState("sprint", false);
    const until = Date.now() + 28_000;
    let last = 0;
    while (Date.now() < until && !left()) {
      const here = bot.entity.position;
      try {
        await bot.lookAt(new Vec3(here.x - 20, here.y - 4, 427.5));
      } catch {
        // ignore
      }
      bot.setControlState("sneak", true);
      bot.setControlState("forward", true);
      if (Date.now() - last > 2000) {
        last = Date.now();
        const feet = bot.blockAt(here.floored())?.name ?? "none";
        const ground = bot.blockAt(here.offset(0, -1, 0).floored())?.name ?? "none";
        console.log("pos", fmt(), "feet", feet, "ground", ground);
      }
      await sleep(100);
    }
    console.log("final", fmt(), "health", bot.health);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
