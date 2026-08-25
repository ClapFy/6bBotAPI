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
bot._client.on("game_state_change", (p: { reason?: unknown; gameMode?: unknown }) => {
  console.log("GSTATE", p.reason, p.gameMode, fmt());
});

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension}`;
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
    console.log("sky", fmt(), bot.game.gameMode);
    sendCommand(bot, "skiplobby on");
    await sleep(1500);
    if (String(bot.game.gameMode) === "survival") {
      console.log("LEFT via skiplobby on", fmt());
      return;
    }

    const target = new Vec3(311.3, 163, 426.6);
    const walkUntil = Date.now() + 8000;
    while (Date.now() < walkUntil) {
      const here = bot.entity.position;
      if (here.xzDistanceTo(target) < 0.45) break;
      if (bot.blockAt(here.floored())?.name === "nether_portal" && here.x < 312.2) break;
      try {
        await bot.lookAt(target.offset(0, 1.2, 0));
      } catch {
        // ignore
      }
      bot.setControlState("forward", true);
      bot.setControlState("sprint", here.xzDistanceTo(target) > 3);
      await sleep(60);
    }
    bot.clearControlStates();
    console.log("standing", fmt(), "block", bot.blockAt(bot.entity.position.floored())?.name);
    const standUntil = Date.now() + 6000;
    while (Date.now() < standUntil) {
      if (String(bot.game.gameMode) === "survival") {
        console.log("LEFT standing in portal", fmt());
        return;
      }
      bot.clearControlStates();
      await sleep(200);
    }
    console.log("still lobby after stand", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
