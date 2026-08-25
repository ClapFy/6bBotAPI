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

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 200)));
bot.on("kicked", (r) => console.log("KICK", JSON.stringify(r).slice(0, 400)));
bot.on("spawn", () => console.log("SPAWN", fmt()));
bot.on("forcedMove", () => console.log("MOVE", fmt()));
bot._client.on("start_configuration", () => console.log("CONFIG start", fmt()));

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
  return here.distanceTo(start) > 25 || dim !== startDim || here.y < 80 || gm === "survival";
}

async function walkIntoPortal(tx: number, ty: number, tz: number, label: string, freeze: boolean) {
  const start = bot.entity.position.clone();
  const startDim = String(bot.game.dimension);
  console.log(label, "walk to portal from", fmt());
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    const standing = bot.blockAt(here.floored())?.name;
    const eyes = bot.blockAt(here.offset(0, 1, 0).floored())?.name;
    if (standing === "nether_portal" || eyes === "nether_portal") {
      bot.clearControlStates();
      console.log(label, "INSIDE portal", fmt(), standing, eyes);
      if (freeze) bot.physicsEnabled = false;
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

  const waitUntil = Date.now() + 12_000;
  while (Date.now() < waitUntil) {
    await sleep(250);
    if (transferred(start, startDim)) {
      bot.physicsEnabled = true;
      console.log(label, "TRANSFERRED", fmt());
      return true;
    }
    const here = bot.entity?.position;
    if (here) {
      const standing = bot.blockAt(here.floored())?.name;
      console.log(label, "waiting", fmt(), standing);
    }
  }
  bot.physicsEnabled = true;
  console.log(label, "no transfer", fmt());
  return false;
}

function dumpInteractables() {
  const origin = bot.entity.position.floored();
  const signs: string[] = [];
  const buttons: string[] = [];
  const plates: string[] = [];
  const portals: { x: number; y: number; z: number }[] = [];
  const odd: string[] = [];

  for (let dx = -60; dx <= 60; dx++) {
    for (let dy = -20; dy <= 12; dy++) {
      for (let dz = -60; dz <= 60; dz++) {
        const b = bot.blockAt(origin.offset(dx, dy, dz));
        if (!b || b.name === "air") continue;
        const loc = `${b.name} ${b.position.x},${b.position.y},${b.position.z}`;
        if (b.name.includes("sign")) {
          const text = (b as { signText?: string | string[] }).signText;
          signs.push(`${loc} text=${JSON.stringify(text)}`);
        } else if (b.name.includes("button")) {
          buttons.push(loc);
        } else if (b.name.includes("pressure_plate") || b.name.includes("plate")) {
          plates.push(loc);
        } else if (b.name === "nether_portal") {
          portals.push({ x: b.position.x, y: b.position.y, z: b.position.z });
        } else if (/gateway|end_portal|lever|tripwire|carpet|beacon|sculk|light/.test(b.name)) {
          odd.push(loc);
        }
      }
    }
  }

  const xs = portals.map((p) => p.x);
  const ys = portals.map((p) => p.y);
  const zs = portals.map((p) => p.z);
  console.log("sign count", signs.length);
  for (const s of signs.slice(0, 40)) console.log("SIGN", s);
  console.log("buttons", buttons.slice(0, 40));
  console.log("plates", plates.slice(0, 40));
  console.log("odd", odd.slice(0, 40));
  console.log("portal aabb", {
    count: portals.length,
    x: xs.length ? [Math.min(...xs), Math.max(...xs)] : [],
    y: ys.length ? [Math.min(...ys), Math.max(...ys)] : [],
    z: zs.length ? [Math.min(...zs), Math.max(...zs)] : [],
  });
  return { signs, buttons, plates, portals };
}

bot.once("spawn", async () => {
  try {
    await sleep(800);
    bot.chat(`/login ${password}`);
    while (bot.entity.position.x > 0) await sleep(200);
    await sleep(2500);
    await walkIntoPortal(-1000, 102, -988, "p1", true);
    await sleep(4000);
    console.log("after p1", fmt());
    const stuff = dumpInteractables();

    const start = bot.entity.position.clone();
    const startDim = String(bot.game.dimension);
    const ok = await walkIntoPortal(311, 163.5, 427, "p2-stand", false);
    if (!ok) {
      console.log("trying nearest button");
      const btn = stuff.buttons[0];
      if (btn) {
        const parts = btn.split(" ");
        const [x, y, z] = parts[1].split(",").map(Number);
        const block = bot.blockAt(new Vec3(x, y, z));
        if (block) {
          try {
            await bot.activateBlock(block);
            console.log("activated", btn);
          } catch (error) {
            console.log("activate failed", error);
          }
        }
      }
      await sleep(4000);
      console.log("after button", fmt());
    }
    if (!transferred(start, startDim)) {
      console.log("trying /skiplobby");
      bot.chat("/skiplobby");
      const until = Date.now() + 12_000;
      while (Date.now() < until) {
        await sleep(300);
        if (transferred(start, startDim)) {
          console.log("SKIPLOBBY TRANSFERRED", fmt());
          break;
        }
      }
      console.log("after skiplobby", fmt());
    }
  } catch (error) {
    console.error("probe error", error);
  } finally {
    await sleep(1500);
    bot.quit("probe");
  }
});

bot.on("end", () => setTimeout(() => process.exit(0), 200));
