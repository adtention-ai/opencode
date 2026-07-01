import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

test("package exposes the OpenCode TUI plugin source", () => {
  assert.equal(pkg.name, "@adtention/opencode")
  assert.equal(pkg.type, "module")
  assert.equal(pkg.exports["./tui"], "./src/tui.tsx")
})

test("published package only includes source files", () => {
  assert.deepEqual(pkg.files, ["src"])
})
