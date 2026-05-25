import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");
const expectedVersion = "1.52.0";
const expectedImage = `mcr.microsoft.com/playwright:v${expectedVersion}-jammy`;

async function readJson(relativePath: string) {
  const content = await readFile(path.join(workspaceRoot, relativePath), "utf8");
  return JSON.parse(content) as Record<string, unknown>;
}

describe("Playwright 版本固定", () => {
  it("package.json、package-lock.json 与 Dockerfile 保持 1.52.0 一致", async () => {
    const packageJson = (await readJson("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const packageLock = (await readJson("package-lock.json")) as {
      packages?: Record<string, { dependencies?: Record<string, string>; version?: string }>;
    };
    const dockerfile = await readFile(path.join(workspaceRoot, "Dockerfile"), "utf8");

    assert.equal(packageJson.dependencies?.playwright, expectedVersion);
    assert.equal(packageLock.packages?.[""]?.dependencies?.playwright, expectedVersion);
    assert.equal(packageLock.packages?.["node_modules/playwright"]?.version, expectedVersion);
    assert.match(dockerfile, new RegExp(`^FROM ${expectedImage}$`, "m"));
  });
});
