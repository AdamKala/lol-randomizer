import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const env = { ...process.env };
const cargoBin = join(homedir(), ".cargo", "bin");
const pathEntries = (env.PATH ?? "").split(delimiter);

// rustup keeps Cargo here. Some terminals opened before rustup was installed do
// not source ~/.cargo/env until they are restarted.
if (existsSync(cargoBin) && !pathEntries.includes(cargoBin)) {
  env.PATH = `${cargoBin}${delimiter}${env.PATH ?? ""}`;
}

// Snap-packaged VS Code exports GTK/GIO paths from its core20 runtime. Native
// Tauri binaries must use the host GTK stack or they can load an incompatible
// libpthread and fail immediately after a successful compilation.
if (process.platform === "linux" && env.SNAP) {
  for (const name of [
    "GIO_MODULE_DIR",
    "GTK_EXE_PREFIX",
    "GTK_IM_MODULE_FILE",
    "GTK_MODULES",
    "GTK_PATH",
  ]) {
    delete env[name];
  }
}

const cliPath = join(
  process.cwd(),
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);

if (!existsSync(cliPath)) {
  console.error("Tauri CLI chybí. Nejdřív spusť `npm install`.");
  process.exit(1);
}

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Tauri se nepodařilo spustit: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
