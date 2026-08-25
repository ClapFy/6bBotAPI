import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachProtocolCompat } from "../src/minecraft/protocolCompat.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";
import { sendCommand } from "../src/minecraft/command.ts";

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
  checkTimeoutInterval: 90_000,
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachProtocolCompat(bot);
attachVelocityTransfer(bot);

const inbound: Record<string, number> = {};
bot._client.on("packet", (data: unknown, meta: { name?: string }) => {
  const name = meta?.name ?? "?";
  inbound[name] = (inbound[name] ?? 0) + 1;
});

bot._client.on("tab_complete", (p: unknown) => console.log("TAB_IN", JSON.stringify(p).slice(0, 400)));
bot._client.on("system_chat", (p: { content?: unknown }) => {
  console.log("SYS", JSON.stringify(p.content).slice(0, 250));
});
bot._client.on("custom_payload", (p: { channel?: string }) => console.log("PAYLOAD", p.channel));
bot._client.on("game_state_change", (p: unknown) => console.log("GSTATE", JSON.stringify(p).slice(0, 200)));
bot._client.on("death_combat_event", () => console.log("DEATH", fmt()));
bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("forcedMove", () => console.log("MOVE", fmt(), "gm", bot.game?.gameMode));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));
bot._client.on("error", (e: Error) => console.log("CLIENTERR", e.message.slice(0, 180)));
bot.on("death", () => console.log("BOTDEATH", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function dumpEntities(label: string) {
  const origin = bot.entity.position;
  const rows: string[] = [];
  for (const e of Object.values(bot.entities)) {
    if (e === bot.entity) continue;
    const name = String((e as { username?: string }).username ?? e.name ?? e.displayName ?? e.type);
    const d = e.position.distanceTo(origin);
    if (d > 48) continue;
    rows.push(`${e.type}/${name} ${e.position.x.toFixed(1)},${e.position.y.toFixed(1)},${e.position.z.toFixed(1)} d=${d.toFixed(1)}`);
  }
  console.log(label, "entities", rows.length);
  for (const row of rows.slice(0, 40)) console.log("  ENT", row);
}

function dumpSigns() {
  const origin = bot.entity.position.floored();
  for (let dx = -20; dx <= 20; dx++) {
    for (let dy = -6; dy <= 8; dy++) {
      for (let dz = -20; dz <= 20; dz++) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b || !b.name.includes("sign")) continue;
        let text = "";
        try {
          text = JSON.stringify((b as { getSignText?: () => unknown }).getSignText?.() ?? b.getProperties());
        } catch {
          text = String(b.getProperties());
        }
        console.log("SIGN", b.position.x, b.position.y, b.position.z, text.slice(0, 220));
      }
    }
  }
}

function dumpSpecial(radius = 28) {
  const origin = bot.entity.position.floored();
  const hits: string[] = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -12; dy <= 14; dy++) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b) continue;
        if (/portal|gateway|barrier|command|structure|jigsaw|pressure|button|lectern|frame|chest|barrel|shulker|beacon|end_rod|nether|water|lava|tripwire|plate|gold_block/.test(b.name)) {
          hits.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
        }
      }
    }
  }
  console.log("special", hits.slice(0, 60), "count", hits.length);
}

async function walkSeconds(dx: number, dy: number, dz: number, seconds: number) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    if (String(bot.game.gameMode) === "survival" || here.y < 20) {
      console.log("LEFT?", fmt());
      return true;
    }
    try {
      await bot.lookAt(here.offset(dx, dy, dz));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    await sleep(80);
  }
  bot.clearControlStates();
  return false;
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
    while (Date.now() < wait && String(bot.game.dimension).includes("end")) {
      const p = bot.entity.position;
      if (!String(bot.game.dimension).includes("end")) break;
      if (p.x > -200 && p.x < 200 && p.y < 40) {
        console.log("STAGING", fmt());
        sendCommand(bot, "skiplobby");
        await sleep(1500);
        console.log("after staging skiplobby", fmt());
      }
      await sleep(100);
    }
    await sleep(3500);
    console.log("sky", fmt());
    console.log("inbound", Object.entries(inbound).sort((a, b) => b[1] - a[1]).slice(0, 20));

    dumpEntities("sky");
    dumpSigns();
    dumpSpecial(18);
    console.log("inv", bot.inventory.items().map((i) => `${i.slot}:${i.name}x${i.count}`));

    try {
      const matches = await bot.tabComplete("/ski");
      console.log("tab /ski", matches);
    } catch (error) {
      console.log("tab fail", error instanceof Error ? error.message : error);
    }
    try {
      const matches = await bot.tabComplete("/help");
      console.log("tab /help", matches);
    } catch (error) {
      console.log("tab help fail", error instanceof Error ? error.message : error);
    }

    sendCommand(bot, "help");
    await sleep(1200);
    sendCommand(bot, "discord");
    await sleep(1200);
    sendCommand(bot, "skiplobby");
    await sleep(1200);
    sendCommand(bot, "kill");
    await sleep(1500);
    console.log("after cmds", fmt(), "health", bot.health);

    const nearby = Object.values(bot.entities)
      .filter((e) => e !== bot.entity && e.position.distanceTo(bot.entity.position) < 8)
      .slice(0, 12);
    for (const e of nearby) {
      console.log("click", e.type, e.name, e.position);
      try {
        await bot.activateEntity(e);
      } catch (error) {
        console.log("click fail", error instanceof Error ? error.message : error);
      }
      await sleep(400);
      if (String(bot.game.gameMode) === "survival" || bot.entity.position.y < 80) {
        console.log("LEFT after click", fmt());
        return;
      }
    }

    console.log("walk south red slope");
    if (await walkSeconds(0, -1, -18, 8)) return;
    console.log("south", fmt());
    dumpEntities("south");
    dumpSpecial(16);

    console.log("walk east npc");
    if (await walkSeconds(20, 0, 0, 10)) return;
    console.log("east", fmt());
    dumpEntities("east");
    const npc = Object.values(bot.entities)
      .filter((e) => e !== bot.entity && e.position.distanceTo(bot.entity.position) < 10)
      .slice(0, 15);
    for (const e of npc) {
      try {
        await bot.lookAt(e.position.offset(0, 1, 0));
        await bot.activateEntity(e);
        console.log("npc click", e.type, e.name);
      } catch {
        // ignore
      }
      await sleep(300);
      if (String(bot.game.gameMode) === "survival") {
        console.log("LEFT after npc", fmt());
        return;
      }
    }

    console.log("walk west toward void");
    if (await walkSeconds(-40, -8, 0, 18)) return;
    console.log("west", fmt(), "block", bot.blockAt(bot.entity.position.floored())?.name);
    dumpSpecial(16);
    console.log("final", fmt(), "gm", bot.game.gameMode, "health", bot.health);
  } catch (error) {
    console.error("probe error", error);
  } finally {
    await sleep(800);
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 300));
