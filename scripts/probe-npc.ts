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
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 180)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("title", (t) => console.log("TITLE", String(t).slice(0, 200)));
bot.on("actionBar", (t) => console.log("ABAR", String(t).slice(0, 200)));
bot._client.on("show_dialog", (p: unknown) => console.log("DIALOG", JSON.stringify(p).slice(0, 800)));
bot._client.on("clear_dialog", () => console.log("CLEAR_DIALOG"));
bot._client.on("boss_bar", (p: unknown) => console.log("BOSS", JSON.stringify(p).slice(0, 250)));
bot._client.on("playerlist_header", (p: unknown) => console.log("TAB", JSON.stringify(p).slice(0, 300)));
bot._client.on("tracked_waypoint", (p: unknown) => console.log("WP", JSON.stringify(p).slice(0, 400)));
bot._client.on("custom_payload", (p: { channel?: string; data?: Buffer }) => {
  const data = p.data ? p.data.toString("utf8").replace(/\0/g, "|").slice(0, 180) : "";
  console.log("PAYLOAD", p.channel, data);
});
bot.on("forcedMove", () => {
  const p = bot.entity?.position;
  console.log("MOVE", fmt(), bot.game?.gameMode);
  if (p && p.y < 40 && p.x < 80 && String(bot.game?.dimension).includes("overworld")) {
    console.log("STAGING skip");
    sendCommand(bot, "skiplobby");
  }
});
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function left() {
  return String(bot.game?.gameMode) === "survival";
}

async function walkTo(x: number, z: number, seconds: number) {
  const target = new Vec3(x, bot.entity.position.y, z);
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until && !left()) {
    const here = bot.entity.position;
    if (here.xzDistanceTo(target) < 1.4) break;
    try {
      await bot.lookAt(new Vec3(x, here.y + 1.2, z));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    bot.setControlState("sprint", here.xzDistanceTo(target) > 4);
    await sleep(80);
  }
  bot.clearControlStates();
  console.log("at", fmt());
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
    while (Date.now() < wait && String(bot.game.dimension).includes("end")) await sleep(150);
    await sleep(2000);
    if (left()) {
      console.log("LEFT after staging", fmt());
      return;
    }
    console.log("sky", fmt(), bot.game.gameMode);
    console.log("tablist", String(bot.tablist?.header ?? "").slice(0, 200), "|", String(bot.tablist?.footer ?? "").slice(0, 200));

    try {
      bot._client.write("chat_message", {
        message: "/skiplobby",
        timestamp: BigInt(Date.now()),
        salt: 1n,
        signature: undefined,
        offset: 0,
        acknowledged: Buffer.alloc(3),
        checksum: 0,
      });
      console.log("sent chat_message /skiplobby");
    } catch (error) {
      console.log("chat_message fail", error instanceof Error ? error.message : error);
    }
    await sleep(1500);
    if (left()) {
      console.log("LEFT after chat_message", fmt());
      return;
    }

    console.log("walk npc ring");
    await walkTo(350, 448, 12);
    const ents = Object.values(bot.entities)
      .filter((e) => e !== bot.entity)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
    for (const e of ents.slice(0, 20)) {
      const name = String((e as { username?: string }).username ?? e.name ?? e.type);
      const d = e.position.distanceTo(bot.entity.position);
      console.log("ENT", e.type, name, `${e.position.x.toFixed(1)},${e.position.y.toFixed(1)},${e.position.z.toFixed(1)} d=${d.toFixed(1)}`);
      if (d < 6) {
        try {
          await bot.lookAt(e.position.offset(0, 1, 0));
          await bot.activateEntity(e);
          console.log("clicked", name);
        } catch (error) {
          console.log("click fail", name, error instanceof Error ? error.message : error);
        }
        await sleep(400);
        if (left()) {
          console.log("LEFT after npc", fmt(), name);
          return;
        }
      }
    }
    await walkTo(362, 443, 8);
    for (const e of Object.values(bot.entities)) {
      if (e === bot.entity) continue;
      if (e.position.distanceTo(bot.entity.position) > 5) continue;
      const name = String((e as { username?: string }).username ?? e.name ?? e.type);
      try {
        await bot.activateEntity(e);
        console.log("clicked2", name, e.type);
      } catch {
        // ignore
      }
      await sleep(300);
      if (left()) {
        console.log("LEFT after npc2", fmt());
        return;
      }
    }
    console.log("final", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
