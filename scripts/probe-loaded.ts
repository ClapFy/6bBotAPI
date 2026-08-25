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
    await sleep(3000);
    console.log(
      "sky",
      fmt(),
      "tick_end",
      bot.supportFeature("sendsClientTickEndPacket"),
      "loaded",
      bot.supportFeature("sendsPlayerLoadedPacket"),
    );
    const start = bot.entity.position.clone();
    const startDim = String(bot.game.dimension);
    const untilWalk = Date.now() + 12_000;
    while (Date.now() < untilWalk) {
      const here = bot.entity.position;
      if (
        bot.blockAt(here.floored())?.name === "nether_portal" ||
        bot.blockAt(here.offset(0, 1, 0).floored())?.name === "nether_portal"
      ) {
        bot.clearControlStates();
        console.log("p2 inside", fmt());
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
    const until = Date.now() + 12_000;
    while (Date.now() < until) {
      await sleep(250);
      const here = bot.entity.position;
      const gm = String(bot.game.gameMode);
      if (here.distanceTo(start) > 40 || String(bot.game.dimension) !== startDim || here.y < 80 || gm === "survival") {
        console.log("P2 TRANSFERRED", fmt());
        break;
      }
    }
    console.log("final", fmt());
  } catch (error) {
    console.error("probe error", error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
