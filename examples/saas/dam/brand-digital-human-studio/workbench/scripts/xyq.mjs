import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import { cliPath } from "../server/xiaoyunque.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      cwd: root,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`命令退出：${code}`)),
    );
  });
}
try {
  if (action === "install") {
    if (!process.env.npm_execpath)
      throw new Error("请使用 npm run xyq:install。");
    await run(process.execPath, [
      process.env.npm_execpath,
      "install",
      "--prefix",
      path.join(root, "work/xyq-cli"),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "@pippit-dev/cli@1.0.38",
    ]);
    await run(process.execPath, [
      path.join(
        root,
        "work/xyq-cli/node_modules/@pippit-dev/cli/scripts/install-cli.js",
      ),
    ]);
  } else if (["login", "status", "logout"].includes(action)) {
    const binary = cliPath(root, process.env);
    await access(binary);
    await run(binary, [action]);
  } else throw new Error("支持 install / login / status / logout。");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
