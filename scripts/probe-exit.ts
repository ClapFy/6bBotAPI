import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();
const password = process.env.KRYNBOT_PASSWORD ?? "";
const version = process.env.KRYNBOT_VERSION ?? "1.21.8";

const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version,
  hideErrors: true,
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 220)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("spawn", () => console.log("SPAWN", fmt()));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function transferred(start: Vec3, startDim: string) {
  const here = bot.entity?.position;
  if (!here) return false;
  const dim = String(bot.game?.dimension ?? "");
  const gm = String(bot.game?.gameMode ?? "");
  return here.distanceTo(start) > 40 || dim !== startDim || here.y < 70 || gm === "survival";
}

async function waitTransfer(label: string, start: Vec3, startDim: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await sleep(250);
    if (transferred(start, startDim)) {
      console.log(label, "TRANSFERRED", fmt());
      return true;
    }
  }
  console.log(label, "still", fmt());
  return false;
}

async function walkIntoPortal(tx: number, ty: number, tz: number, label: string) {
  const start = bot.entity.position.clone();
  const startDim = String(bot.game.dimension);
  const until = Date.now() + 12_000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    const standing = bot.blockAt(here.floored())?.name;
    const eyes = bot.blockAt(here.offset(0, 1, 0).floored())?.name;
    if (standing === "nether_portal" || eyes === "nether_portal") {
      bot.clearControlStates();
      console.log(label, "inside", fmt());
      break;
    }
    try {
      await bot.lookAt(new Vec3(tx, ty, tz));
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(80);
  }
  return waitTransfer(label, start, startDim, 8000);
}

function dumpEntities() {
  const origin = bot.entity.position;
  const nearby = Object.values(bot.entities)
    .filter((e) => e.position.distanceTo(origin) < 80)
    .map((e) => {
      const nametag = (e as { username?: string; displayName?: unknown }).username
        ?? (e as { name?: string }).name
        ?? e.type;
      return `${e.type}/${e.name ?? "?"} ${nametag} ${e.position.x.toFixed(1)},${e.position.y.toFixed(1)},${e.position.z.toFixed(1)}`;
    });
  console.log("entities", nearby.slice(0, 40));
}

function dumpFloor() {
  const origin = bot.entity.position.floored();
  const holes: string[] = [];
  const drops: string[] = [];
  for (let dx = -40; dx <= 40; dx += 2) {
    for (let dz = -40; dz <= 40; dz += 2) {
      const feet = origin.offset(dx, 0, dz);
      const ground = bot.blockAt(feet.offset(0, -1, 0));
      const here = bot.blockAt(feet);
      if (!ground || ground.name === "air" || ground.name === "cave_air") {
        holes.push(`${feet.x},${feet.z} stand=${here?.name}`);
      } else if (ground.position.y < origin.y - 2) {
        drops.push(`${feet.x},${ground.position.y},${feet.z} ${ground.name}`);
      }
    }
  }
  console.log("holes", holes.slice(0, 30), "count", holes.length);
  console.log("drops", drops.slice(0, 20), "count", drops.length);
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    bot.chat(`/login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(2000);
    console.log("end-lobby", fmt());
    dumpEntities();
    try {
      const matches = await bot.tabComplete("/skip");
      console.log("tab /skip", matches);
    } catch (error) {
      console.log("tab fail", error instanceof Error ? error.message : error);
    }
    try {
      const matches = await bot.tabComplete("/");
      console.log("tab /", Array.isArray(matches) ? matches.slice(0, 40) : matches);
    } catch (error) {
      console.log("tab / fail", error instanceof Error ? error.message : error);
    }

    const start = bot.entity.position.clone();
    const startDim = String(bot.game.dimension);
    console.log("skiplobby from end lobby");
    bot.chat("/skiplobby");
    if (await waitTransfer("skip-end", start, startDim, 8000)) return;

    await walkIntoPortal(-1000, 102, -988, "p1");
    await sleep(3500);
    console.log("sky lobby", fmt());
    dumpEntities();
    dumpFloor();
    try {
      const matches = await bot.tabComplete("/skip");
      console.log("tab /skip sky", matches);
    } catch (error) {
      console.log("tab sky fail", error instanceof Error ? error.message : error);
    }

    const skyStart = bot.entity.position.clone();
    const skyDim = String(bot.game.dimension);
    console.log("skiplobby from sky spawn");
    bot.chat("/skiplobby");
    if (await waitTransfer("skip-sky", skyStart, skyDim, 10000)) return;

    console.log("trying /spawn and /server");
    bot.chat("/spawn");
    await sleep(2000);
    console.log("after spawn cmd", fmt());
    bot.chat("/server survival");
    await sleep(2000);
    console.log("after server", fmt());
  } catch (error) {
    console.error("probe error", error);
  } finally {
    await sleep(1000);
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
