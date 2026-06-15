#!/usr/bin/env bun
/**
 * Release: build, publish to npm (idempotent — skips if the version is already
 * published), then git-tag and push. Run after `npm login`.
 *   bun run release
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as { name: string; version: string };

// `bun run` injects npm_config_* vars that can confuse npm; strip them.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.toLowerCase().startsWith("npm_config_")),
) as NodeJS.ProcessEnv;

function run(cmd: string, cwd: string): void {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env });
}
function onNpm(name: string, version: string): boolean {
  try {
    return execSync(`npm view ${name}@${version} version 2>/dev/null`, { encoding: "utf8" }).trim() === version;
  } catch {
    return false;
  }
}

run("npm install", root);
run("npm run build", root);

if (onNpm(pkg.name, pkg.version)) {
  console.log(`\n${pkg.name}@${pkg.version} is already on npm — nothing to do.`);
  process.exit(0);
}

run(`npm publish ${JSON.stringify(root)} --access public`, tmpdir());

try {
  run(`git tag v${pkg.version}`, root);
  run(`git push origin v${pkg.version}`, root);
} catch {
  console.warn(`\nPublished, but could not push tag v${pkg.version} — tag it manually.`);
}
console.log(`\nReleased ${pkg.name}@${pkg.version}.`);
