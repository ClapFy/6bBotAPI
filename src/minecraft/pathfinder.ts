import { createRequire } from "node:module";
import type { Bot } from "mineflayer";
import type { goals as GoalsNS, Movements as MovementsClass } from "mineflayer-pathfinder";

const require = createRequire(import.meta.url);
const loaded = require("mineflayer-pathfinder") as {
  pathfinder: (bot: Bot) => void;
  goals: typeof GoalsNS;
  Movements: typeof MovementsClass;
};

export const pathfinder = loaded.pathfinder;
export const goals = loaded.goals;
export const Movements = loaded.Movements;
