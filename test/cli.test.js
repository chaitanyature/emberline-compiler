import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/ember.js", import.meta.url));
const invoke = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
test("public CLI builds, verifies and reloads an artifact outside the source tree", (t) => {
  const d = mkdtempSync(join(tmpdir(), "ember-cli-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const path = join(d, "program.em"),
    out = join(d, "program.embc");
  writeFileSync(path, "fn triple(n){return n*3;}print triple(14);");
  assert.equal(invoke("build", path, "-o", out).status, 0);
  const before = readFileSync(out);
  assert.equal(invoke("verify", out).status, 0);
  assert.equal(invoke("exec", out).stdout, "42\n");
  assert.match(invoke("dump", out).stdout, /fn #1 triple/);
  writeFileSync(path, "let x=;");
  assert.notEqual(invoke("build", path, "-o", out).status, 0);
  assert.deepEqual(readFileSync(out), before);
  writeFileSync(out, "{}");
  assert.match(invoke("exec", out).stderr, /invalid bytecode header/);
});
test("runtime diagnostic exposes the offending source span and function stack", (t) => {
  const d = mkdtempSync(join(tmpdir(), "ember-error-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const path = join(d, "err.em");
  writeFileSync(path, "fn ratio(n){\n  return 1 / n;\n}\nprint ratio(0);");
  const p = invoke("run", path);
  assert.equal(p.status, 1);
  assert.match(p.stderr, /err\.em:2:12: runtime: division by zero/);
  assert.match(p.stderr, /ratio <- <main>/);
});
