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
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 180)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("error", (e: Error) => console.log("ERR", e.message));
bot.on("forcedMove", () => console.log("MOVE", fmt(), bot.game?.gameMode));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot.on("login", () => console.log("LOGIN packet"));
bot.on("end", (r) => console.log("END", r));

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
    const loginWait = Date.now() + 10_000;
    while (Date.now() < loginWait && bot.entity.position.x > 0) await sleep(200);
    await sleep(1000);
    const untilP1 = Date.now() + 12_000;
    while (Date.now() < untilP1 && String(bot.game.dimension).includes("end")) {
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
    const wait = Date.now() + 20_000;
    while (Date.now() < wait) {
      const gm = String(bot.game.gameMode);
      if (gm === "survival") {
        console.log("IN MAIN WORLD", fmt(), gm);
        return;
      }
      await sleep(250);
    }
    console.log("timeout", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 400));
