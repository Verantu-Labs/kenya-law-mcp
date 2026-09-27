import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// A clean output prevents deleted source modules from surviving in package archives.
const repository = new URL("../", import.meta.url);
const output = new URL("dist/", repository);
if (!fileURLToPath(output).startsWith(fileURLToPath(repository))) throw new Error("Build output is outside the repository.");
await rm(output, { recursive: true, force: true });
const compiler = Bun.spawn([process.execPath, "node_modules/typescript/bin/tsc"], {
  cwd: fileURLToPath(repository), stdout: "inherit", stderr: "inherit",
});
process.exit(await compiler.exited);
