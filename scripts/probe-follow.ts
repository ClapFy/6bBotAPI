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
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function realPlayers() {
  return Object.values(bot.entities).filter((e) => {
    if (e.type !== "player") return false;
    const name = String((e as { username?: string }).username ?? "");
    if (!name || name === "KrynoBot") return false;
    if (name.includes("§")) return false;
    return true;
  });
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    bot.chat(`/login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(2000);
    const untilP1 = Date.now() + 12_000;
    while (Date.now() < untilP1) {
      const here = bot.entity.position;
      if (bot.blockAt(here.floored())?.name === "nether_portal") {
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
    try {
      bot._client.write("player_loaded", {});
      console.log("resent player_loaded");
    } catch (error) {
      console.log("player_loaded err", error);
    }

    const until = Date.now() + 25_000;
    while (Date.now() < until) {
      if (!String(bot.game.dimension).includes("overworld") || bot.game.gameMode === "survival" || bot.entity.position.y < 80) {
        console.log("LEFT LOBBY", fmt());
        break;
      }
      const players = realPlayers();
      for (const p of players) {
        console.log(
          "P",
          (p as { username?: string }).username,
          `${p.position.x.toFixed(1)},${p.position.y.toFixed(1)},${p.position.z.toFixed(1)}`,
        );
      }
      const target = players.sort((a, b) => a.position.x - b.position.x)[0];
      if (target && target.position.x < bot.entity.position.x - 0.4) {
        try {
          await bot.lookAt(target.position.offset(0, 1.4, 0));
        } catch {
          // ignore
        }
        bot.setControlState("forward", true);
        try {
          bot._client.write("player_input", {
            inputs: { forward: true, backward: false, left: false, right: false, jump: false, shift: false, sprint: true },
          });
        } catch {
          // ignore
        }
      } else if (bot.blockAt(bot.entity.position.floored())?.name === "nether_portal") {
        bot.clearControlStates();
        try {
          bot._client.write("player_input", {
            inputs: { forward: false, backward: false, left: false, right: false, jump: false, shift: false, sprint: false },
          });
        } catch {
          // ignore
        }
        console.log("in portal", fmt());
      } else {
        try {
          await bot.lookAt(new Vec3(311, 163.5, 427));
        } catch {
          // ignore
        }
        bot.setControlState("forward", true);
      }
      await sleep(400);
    }
    console.log("final", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error("probe error", error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
