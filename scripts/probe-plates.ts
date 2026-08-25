import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { leftLobby, sendCommand } from "../src/minecraft/command.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const version = process.argv.includes("12111") ? "1.21.11" : (process.env.KRYNBOT_VERSION ?? "1.21.8");
console.log("version", version);

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version,
  brand: "fabric",
  hideErrors: true,
  checkTimeoutInterval: 90_000,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("message", (json) => {
  const raw = JSON.stringify(json).slice(0, 400);
  if (/click|extra|dismiss|portal|enter|lobby/i.test(raw)) console.log("MSGJSON", raw);
});
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 300)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("login", (p: Record<string, unknown>) => {
  console.log("LOGIN", {
    enforcesSecureChat: p.enforcesSecureChat,
    hardcore: p.isHardcore ?? p.hardcore,
    gameMode: (p.worldState as { gamemode?: unknown } | undefined)?.gamemode ?? p.gameMode ?? p.gamemode,
    dimension: (p.worldState as { dimension?: unknown } | undefined)?.dimension ?? p.dimension,
  });
});
bot._client.on("declare_commands", (p: { nodes?: { flags?: unknown; extraNodeData?: { name?: string } }[] }) => {
  const sample = (p.nodes ?? []).slice(0, 8).map((n) => ({ flags: n.flags, name: n.extraNodeData?.name }));
  const names = (p.nodes ?? []).map((n) => n.extraNodeData?.name).filter(Boolean);
  console.log("CMDFLAGS", JSON.stringify(sample));
  console.log("CMDNAMES", names.filter((n) => n && /skip|ski|join|leave|help|dismiss|portal|hub|play/.test(n)).join(","));
});

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function goTo(x: number, z: number) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    if (Math.hypot(here.x - x, here.z - z) < 0.7) break;
    try {
      await bot.lookAt(new Vec3(x, here.y + 1.1, z));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(80);
  }
  bot.clearControlStates();
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
    await sleep(3500);
    console.log("sky", fmt());
    const start = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z, dim: String(bot.game.dimension) };

    sendCommand(bot, "dismiss");
    await sleep(1500);
    console.log("stand on pressure plate 319,427");
    await goTo(319.5, 427.5);
    console.log("on plate", fmt(), bot.blockAt(bot.entity.position.floored())?.name);
    const plateUntil = Date.now() + 8000;
    while (Date.now() < plateUntil) {
      if (leftLobby(bot, start)) {
        console.log("PLATE TRANSFER", fmt());
        return;
      }
      await sleep(250);
    }
    const btn = bot.blockAt(new Vec3(318, 163, 427));
    if (btn) {
      try {
        await bot.activateBlock(btn);
        console.log("clicked", btn.name, btn.position);
      } catch (error) {
        console.log("click fail", error);
      }
      await sleep(3000);
    }
    sendCommand(bot, "skiplobby");
    await sleep(4000);
    console.log("final", fmt(), leftLobby(bot, start));
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
