import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const env = { ...process.env };
const cargoBin = join(homedir(), ".cargo", "bin");
// Windows exposes this variable as `Path`, while Unix uses `PATH`. Creating a
// second differently-cased key on Windows can replace the runner's original
// search path and hide npm from Tauri's beforeBuildCommand.
const pathKey = Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
const currentPath = env[pathKey] ?? "";
const pathEntries = currentPath.split(delimiter);

// rustup keeps Cargo here. Some terminals opened before rustup was installed do
// not source ~/.cargo/env until they are restarted.
if (existsSync(cargoBin) && !pathEntries.includes(cargoBin)) {
  env[pathKey] = `${cargoBin}${delimiter}${currentPath}`;
}

// Snap-packaged VS Code exports GTK/GIO paths from its core20 runtime. Native
// Tauri binaries must use the host GTK stack or they can load an incompatible
// libpthread and fail immediately after a successful compilation.
if (process.platform === "linux") {
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
