import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: process.env.KRYNBOT_VERSION ?? "1.21.8",
  brand: "fabric",
  hideErrors: true,
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 180)));
bot.on("forcedMove", () => console.log("MOVE", fmt()));

function commandNames(p: { nodes?: unknown[] }): string[] {
  const names: string[] = [];
  for (const node of p.nodes ?? []) {
    const n = node as { extraNodeData?: { name?: string }; name?: string };
    const name = n.extraNodeData?.name ?? n.name;
    if (name) names.push(name);
  }
  return [...new Set(names)].sort();
}

bot._client.on("declare_commands", (p: { nodes?: unknown[] }) => {
  console.log("CMDS", commandNames(p).join(", "));
});

const orig = bot._client.write.bind(bot._client);
bot._client.write = (name: string, params: unknown) => {
  if (name.includes("chat") || name.includes("command")) {
    const rec = params as { command?: string; message?: string };
    console.log("OUT", name, rec.command ?? rec.message ?? typeof params);
  }
  return orig(name, params);
};

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
    await sleep(4000);
    console.log("sky", fmt());
    bot.chat("/skiplobby");
    await sleep(2500);
    bot.chat("/join");
    await sleep(2500);
    console.log("final", fmt(), bot.game.gameMode);
  } catch (error) {
    console.error(error);
  } finally {
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
