import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { sendCommand } from "../src/minecraft/command.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const recent: string[] = [];

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: "1.21.11",
  brand: "fabric",
  hideErrors: true,
  checkTimeoutInterval: 90_000,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot._client.on("packet", (_data: unknown, meta: { name?: string; state?: string }) => {
  const name = `${meta?.state ?? "?"}:${meta?.name ?? "?"}`;
  recent.push(name);
  if (recent.length > 25) recent.shift();
});
bot._client.on("error", (e: Error) => {
  console.log("CLIENTERR", e.message.slice(0, 220));
  console.log("LASTPACKETS", recent.join(", "));
});
bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 160)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("forcedMove", () => console.log("MOVE", fmt(), bot.game?.gameMode));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("tab_complete", (p: unknown) => console.log("TAB_IN", JSON.stringify(p).slice(0, 250)));
bot._client.on("game_state_change", (p: { reason?: unknown }) => console.log("GSTATE", p.reason, fmt()));

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
    await sleep(1500);
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
    await sleep(800);
    console.log("sky", fmt(), bot.game.gameMode);
    bot._client.write("player_loaded", {});
    sendCommand(bot, "skiplobby");
    sendCommand(bot, "help");
    bot._client.write("tab_complete", { transactionId: 7, text: "/skiplobby" });
    const until = Date.now() + 7000;
    while (Date.now() < until) {
      if (String(bot.game.gameMode) === "survival") {
        console.log("LEFT LOBBY", fmt());
        return;
      }
      await sleep(200);
    }
    console.log("still lobby", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
