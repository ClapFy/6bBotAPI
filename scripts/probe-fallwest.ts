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

    bot.setControlState("sneak", false);
    bot.setControlState("sprint", true);
    bot.setControlState("forward", true);
    bot.setControlState("jump", false);
    const until = Date.now() + 35_000;
    let last = 0;
    while (Date.now() < until) {
      const gm = String(bot.game.gameMode);
      if (gm === "survival") {
        console.log("LEFT LOBBY", fmt());
        return;
      }
      const here = bot.entity.position;
      const ground = bot.blockAt(here.offset(0, -0.2, 0).floored());
      if (!ground || ground.name === "air") {
        bot.entity.onGround = false;
        bot.entity.velocity.y = Math.min(bot.entity.velocity.y, -0.55);
      }
      try {
        await bot.look(Math.PI / 2, 0.35, true);
      } catch {
        // ignore
      }
      bot.setControlState("forward", true);
      bot.setControlState("sprint", true);
      if (Date.now() - last > 1500) {
        last = Date.now();
        console.log("pos", fmt(), "ground", ground?.name ?? "unloaded", "vy", bot.entity.velocity.y.toFixed(2));
      }
      await sleep(80);
    }
    console.log("final", fmt(), "health", bot.health);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
