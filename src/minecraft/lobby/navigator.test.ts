import assert from "node:assert/strict";
import test from "node:test";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import type { PortalTarget } from "../../api/types.ts";
import { createPortalNavigator } from "./navigator.ts";

function vanillaBlocks(origin: Vec3, axis: "x" | "z"): Vec3[] {
  const blocks: Vec3[] = [];
  for (let dy = 0; dy < 3; dy++) {
    for (let width = 0; width < 2; width++) {
      blocks.push(axis === "x" ? origin.offset(width, dy, 0) : origin.offset(0, dy, width));
    }
  }
  return blocks;
}

function wallBlocks(origin: Vec3): Vec3[] {
  const blocks: Vec3[] = [];
  for (let y = 0; y < 8; y++) {
    for (let z = 0; z < 12; z++) {
      blocks.push(origin.offset(0, y, z));
    }
  }
  return blocks;
}

function createMockBot(start: Vec3, dimension: string) {
  const writes: string[] = [];
  const scans: Array<{ maxDistance?: number; count?: number }> = [];
  const game = { dimension, gameMode: "adventure" };
  const state: { blocks: Vec3[] } = { blocks: [] };
  const entity = { position: start };
  const bot = {
    entity,
    game,
    registry: {
      blocksByName: {
        nether_portal: { id: 1 },
        end_portal: { id: 2 },
        end_gateway: { id: 3 },
        end_portal_frame: { id: 4 },
      },
    },
    _client: {
      state: "play",
      write(name: string) {
        writes.push(name);
      },
    },
    findBlocks(options: { maxDistance?: number; count?: number }) {
      scans.push(options);
      return state.blocks;
    },
    blockAt() {
      return { name: "nether_portal" };
    },
    clearControlStates() {
      game.gameMode = "survival";
    },
    setControlState() {},
    async lookAt() {},
    pathfinder: {
      setMovements() {},
      setGoal() {},
    },
  };
  return { bot: bot as unknown as Bot, writes, scans, game, entity, state };
}

async function settle<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`hunt timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

test("walks a vanilla end portal and then the sky portal without /skiplobby", async () => {
  const mock = createMockBot(new Vec3(0, 64, 0), "minecraft:the_end");
  mock.state.blocks = [...wallBlocks(new Vec3(1, 60, 0)), ...vanillaBlocks(new Vec3(10, 64, 0), "x")];
  const found: PortalTarget[] = [];
  const entered: string[] = [];
  const navigator = createPortalNavigator(mock.bot, 60_000, {
    onFound: (portal) => found.push(portal),
    onEntered: (portal) => entered.push(`${portal.position.x},${portal.position.y},${portal.position.z}`),
    onMiss: () => {},
    getWorldKind: () => "lobby",
    allowServerPortals: () => true,
  });

  assert.equal(await settle(navigator.huntOnce(), 2_000), true);
  assert.equal(found[0]?.position.x, 11);
  assert.equal(found[0]?.position.y, 65.5);
  assert.equal(found[0]?.position.z, 0.5);

  mock.game.dimension = "minecraft:overworld";
  mock.game.gameMode = "adventure";
  mock.entity.position = new Vec3(0, 110, 0);
  mock.state.blocks = [...wallBlocks(new Vec3(1, 106, 0)), ...vanillaBlocks(new Vec3(20, 108, 4), "z")];

  assert.equal(await settle(navigator.huntOnce(), 3_000), true);
  assert.equal(found[1]?.position.x, 20.5);
  assert.equal(found[1]?.position.y, 109.5);
  assert.equal(found[1]?.position.z, 5);
  assert.deepEqual(entered, ["11,65.5,0.5", "20.5,109.5,5"]);
  assert.equal(mock.scans.every((scan) => scan.count === 2048 && scan.maxDistance === 64), true);
  assert.ok(mock.writes.includes("player_loaded"));
  assert.equal(mock.writes.includes("chat_command"), false);
});

test("does not walk into a decorative sky-lobby portal wall", async () => {
  const mock = createMockBot(new Vec3(0, 120, 0), "minecraft:overworld");
  mock.state.blocks = wallBlocks(new Vec3(2, 116, 0));
  const misses: string[] = [];
  const navigator = createPortalNavigator(mock.bot, 60_000, {
    onFound: () => {
      throw new Error("decorative wall was selected");
    },
    onEntered: () => {
      throw new Error("decorative wall was entered");
    },
    onMiss: (reason) => misses.push(reason),
    getWorldKind: () => "lobby",
    allowServerPortals: () => true,
  });

  assert.equal(await settle(navigator.huntOnce(), 3_000), false);
  assert.deepEqual(misses, ["no vanilla-sized server portal in range"]);
  assert.equal(mock.writes.includes("chat_command"), false);
});

test("enters the large portal in the ground-level overworld lobby", async () => {
  const mock = createMockBot(new Vec3(247.5, 62, 228.5), "minecraft:overworld");
  mock.state.blocks = [];
  for (let x = 240; x <= 254; x++) {
    for (let y = 62; y < 70; y++) mock.state.blocks.push(new Vec3(x, y, 220));
  }
  const found: PortalTarget[] = [];
  const entered: PortalTarget[] = [];
  const misses: string[] = [];
  const navigator = createPortalNavigator(mock.bot, 60_000, {
    onFound: (portal) => found.push(portal),
    onEntered: (portal) => entered.push(portal),
    onMiss: (reason) => misses.push(reason),
    getWorldKind: () => "lobby",
    allowServerPortals: () => true,
  });

  assert.equal(await settle(navigator.huntOnce(), 2_000), true);
  assert.equal(found[0]?.position.x, 247.5);
  assert.equal(found[0]?.position.z, 220.5);
  assert.equal(entered.length, 1);
  assert.deepEqual(misses, []);
});

test("leaves and reenters a portal rejected by the join cooldown", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const mock = createMockBot(new Vec3(0.5, 64, 3.5), "minecraft:the_end");
  mock.state.blocks = vanillaBlocks(new Vec3(0, 64, 0), "x");
  const entered: PortalTarget[] = [];
  const misses: string[] = [];
  let target = mock.entity.position.clone();
  let rejected = false;
  let leftPortal = false;
  let cooldownUntil = 0;
  const inside = () => Math.floor(mock.entity.position.z) === 0;
  mock.bot.blockAt = ((pos: Vec3) => {
    if (pos.y < 64) return { name: "stone", boundingBox: "block" };
    const portal = mock.state.blocks.some((p) => p.equals(pos.floored()));
    return { name: portal ? "nether_portal" : "air", boundingBox: "empty" };
  }) as Bot["blockAt"];
  mock.bot.clearControlStates = () => {};
  mock.bot.lookAt = async (pos: Vec3) => { target = pos; };
  mock.bot.setControlState = (key, value) => {
    if (key !== "forward" || !value) return;
    const wasInside = inside();
    const delta = target.minus(mock.entity.position);
    delta.y = 0;
    const distance = delta.norm();
    if (distance > 0) mock.entity.position = mock.entity.position.plus(delta.scaled(Math.min(0.4 / distance, 1)));
    if (wasInside && !inside()) leftPortal = true;
    if (!wasInside && inside()) {
      if (!rejected) {
        rejected = true;
        cooldownUntil = Date.now() + 1000;
      } else if (leftPortal && Date.now() >= cooldownUntil) {
        mock.game.dimension = "minecraft:overworld";
        mock.game.gameMode = "survival";
      }
    }
  };
  const navigator = createPortalNavigator(mock.bot, 60_000, {
    onFound: () => {},
    onEntered: (portal) => entered.push(portal),
    onMiss: (reason) => misses.push(reason),
    getWorldKind: () => "lobby",
    allowServerPortals: () => true,
  });
  const runHunt = async () => {
    let result: boolean | undefined;
    const work = navigator.huntOnce().then((value) => { result = value; });
    for (let elapsed = 0; elapsed < 35_000 && result === undefined; elapsed += 100) {
      t.mock.timers.tick(100);
      for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    }
    assert.notEqual(result, undefined, "hunt must finish within its movement/transfer deadlines");
    await work;
    return result;
  };

  try {
    assert.equal(await runHunt(), false, "first entry is rejected during cooldown");
    assert.equal(inside(), true);
    assert.equal(entered.length, 0);

    const blockAt = mock.bot.blockAt;
    const rejectedPosition = mock.entity.position.clone();
    mock.bot.blockAt = ((pos: Vec3) => pos.y < 64 ? null : blockAt(pos)) as Bot["blockAt"];
    assert.equal(await runHunt(), false, "retry must not walk over an unloaded floor or void");
    assert.ok(mock.entity.position.equals(rejectedPosition));
    assert.deepEqual(misses, ["no safe place to step out of portal"]);
    mock.bot.blockAt = blockAt;

    assert.equal(await runHunt(), true, "retry must leave the portal before entering again");
    assert.equal(leftPortal, true);
    assert.equal(entered.length, 1);
    assert.equal(mock.game.gameMode, "survival");
  } finally {
    navigator.stop();
  }
});
