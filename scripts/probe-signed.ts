import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { leftLobby, sendCommand } from "../src/minecraft/command.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";

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

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("error", (e: Error) => console.log("CLIENTERR", e.message.slice(0, 200)));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function signedCommand(command: string) {
  const acknowledged = Buffer.alloc(3);
  bot._client.write("chat_command_signed", {
    command,
    timestamp: BigInt(Date.now()),
    salt: 1n,
    argumentSignatures: [],
    messageCount: 0,
    acknowledged,
    checksum: 0,
  });
  console.log("SIGNED", command);
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    sendCommand(bot, `login ${password}`);
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
    await sleep(4000);
    console.log("sky", fmt());
    const start = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z, dim: String(bot.game.dimension) };
    signedCommand("skiplobby");
    await sleep(4000);
    if (leftLobby(bot, start)) {
      console.log("SIGNED SKIP WORKED", fmt());
      return;
    }
    signedCommand("ski");
    await sleep(2000);
    console.log("inv", bot.inventory.items().map((i) => i.name));
    sendCommand(bot, "skiplobby");
    await sleep(3000);
    console.log("unsigned still", fmt(), leftLobby(bot, start));
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
