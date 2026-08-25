import mineflayer from "mineflayer";

const host = process.env.KRYNBOT_HOST ?? "alt3.6b6t.org";
const versions = process.argv.slice(2);
const toTry = versions.length ? versions : ["1.21.1", "1.21.4", "1.21.8", "1.21.11"];

function kickText(reason: unknown): string {
  if (reason && typeof reason === "object") {
    const value = reason as { toString?: () => string };
    const text = value.toString?.();
    if (text && text !== "[object Object]") return text;
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }
  return String(reason);
}

async function tryVersion(version: string): Promise<void> {
  console.log(`\n=== trying ${version} ===`);
  await new Promise<void>((resolve) => {
    const bot = mineflayer.createBot({
      host,
      port: 25565,
      username: "KrynoBot",
      auth: "offline",
      version,
      hideErrors: false,
    });
    const timer = setTimeout(() => {
      console.log("timeout");
      try {
        bot.end("timeout");
      } catch {
        // ignore
      }
      resolve();
    }, 12_000);
    bot.on("error", (err) => console.log("error", err.message));
    bot.on("kicked", (reason, loggedIn) => {
      console.log("kicked loggedIn=", loggedIn, kickText(reason));
    });
    bot.on("login", () => console.log("login, version=", bot.version, "protocol=", bot.protocolVersion));
    bot.on("spawn", () => {
      console.log("SPAWN", bot.entity?.position, bot.game?.dimension);
      bot.quit("probe");
    });
    bot.on("end", (reason) => {
      console.log("end", reason);
      clearTimeout(timer);
      resolve();
    });
  });
}

for (const version of toTry) {
  await tryVersion(version);
}
