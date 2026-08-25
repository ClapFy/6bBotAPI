import mineflayer from "mineflayer";
import { Vec3 } from "vec3";
import dotenv from "dotenv";
import { attachAnarchyMod } from "../src/minecraft/anarchyMod.ts";
import { attachVelocityTransfer } from "../src/minecraft/velocityTransfer.ts";

dotenv.config();

const password = process.env.KRYNBOT_PASSWORD ?? "";
const bot = mineflayer.createBot({
  host: "alt3.6b6t.org",
  username: "KrynoBot",
  auth: "offline",
  version: "1.21.11",
  hideErrors: true,
  viewDistance: "far",
});
attachAnarchyMod(bot);
attachVelocityTransfer(bot);

bot.on("messagestr", (m) => console.log("CHAT", String(m).slice(0, 200)));
bot.on("kicked", (r) => console.log("KICK", r));
bot.on("spawn", () => console.log("SPAWN", fmt()));
bot.on("respawn", () => console.log("RESPAWN", fmt()));
bot.on("forcedMove", () => console.log("MOVE", fmt()));

function fmt() {
  const p = bot.entity?.position;
  return `${p?.x.toFixed(1)},${p?.y.toFixed(1)},${p?.z.toFixed(1)} ${bot.game?.dimension} ${bot.game?.gameMode}`;
}

function dump(label: string) {
  const pos = bot.entity.position.floored();
  const portals: string[] = [];
  for (let dx = -48; dx <= 48; dx++) {
    for (let dy = -24; dy <= 20; dy++) {
      for (let dz = -48; dz <= 48; dz++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz));
        if (b && (b.name === "nether_portal" || b.name === "end_gateway" || b.name === "end_portal")) {
          portals.push(`${b.name} ${b.position.x},${b.position.y},${b.position.z}`);
        }
      }
    }
  }
  const lines: string[] = [];
  for (let dz = -20; dz <= 20; dz++) {
    let row = "";
    for (let dx = -20; dx <= 20; dx++) {
      if (dx === 0 && dz === 0) {
        row += "@";
        continue;
      }
      let ch = " ";
      for (let dy = 10; dy >= -6; dy--) {
        const n = bot.blockAt(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz))?.name ?? "air";
        if (n === "nether_portal") {
          ch = "P";
          break;
        }
        if (n === "obsidian") {
          ch = "O";
          break;
        }
        if (n !== "air" && ch === " ") ch = "#";
      }
      row += ch;
    }
    lines.push(row);
  }
  console.log(`\n==== ${label} ${fmt()}`);
  console.log("portals", [...new Set(portals)].slice(0, 30));
  console.log(lines.join("\n"));
}

bot.once("spawn", async () => {
  await sleep(1000);
  bot.chat(`/login ${password}`);
  while (bot.entity.position.x > 0) await sleep(200);
  console.log("on lobby island", fmt());
  await sleep(3000);

  const target = new Vec3(-1000, 101.5, -988);
  const start = bot.entity.position.clone();
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    const here = bot.entity.position;
    const standing = bot.blockAt(here.floored())?.name;
    const eyes = bot.blockAt(here.offset(0, 1, 0).floored())?.name;
    if (standing === "nether_portal" || eyes === "nether_portal") {
      console.log("in portal 1, freezing", fmt());
      bot.clearControlStates();
      bot.physicsEnabled = false;
      break;
    }
    try {
      await bot.lookAt(target);
    } catch {
      // ignore
    }
    bot.setControlState("forward", true);
    await sleep(120);
  }

  const waitUntil = Date.now() + 20000;
  while (Date.now() < waitUntil) {
    await sleep(400);
    const here = bot.entity.position;
    if (bot.game.dimension === "overworld" || here.distanceTo(start) > 50) {
      console.log("transferred", fmt());
      bot.physicsEnabled = true;
      await sleep(4000);
      dump("after-portal-1");
      bot.quit("probe");
      return;
    }
  }
  console.log("no transfer", fmt());
  dump("stuck");
  bot.quit("probe");
});

bot.on("end", () => process.exit(0));
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
