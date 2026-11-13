#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import {
  parse,
  compile,
  verify,
  execute,
  interpret,
  disassemble,
  EmberError,
  optimize,
} from "../src/index.js";

const usage =
  "ember run|check|profile|disasm SOURCE [--opt] [--limit N]\nember build SOURCE [--opt] -o FILE\nember exec|verify|dump FILE [--limit N]";
const [command, file, ...rest] = process.argv.slice(2);
let source;
try {
  if (command === "--help" || command === "-h") {
    console.log(usage);
  } else {
    if (
      ![
        "run",
        "check",
        "profile",
        "disasm",
        "build",
        "exec",
        "verify",
        "dump",
      ].includes(command) ||
      !file
    )
      throw Error(usage);
    let optimized = false,
      out,
      limit = 5_000_000;
    for (let i = 0; i < rest.length; i++) {
      if (
        rest[i] === "--opt" &&
        ["run", "build", "check", "profile", "disasm"].includes(command)
      ) {
        optimized = true;
        continue;
      }
      if (rest[i] === "-o" && command === "build" && rest[i + 1])
        out = rest[++i];
      else if (
        rest[i] === "--limit" &&
        ["run", "check", "profile", "exec"].includes(command)
      ) {
        limit = Number(rest[++i]);
        if (!Number.isSafeInteger(limit) || limit < 1)
          throw Error("invalid instruction limit");
      } else throw Error("invalid option " + rest[i]);
    }
    let program, image;
    if (["exec", "verify", "dump"].includes(command)) {
      image = JSON.parse(readFileSync(file, "utf8"));
      verify(image);
    } else {
      source = readFileSync(file, "utf8");
      program = parse(source);
      image = compile(program);
      if (optimized) image = optimize(image);
    }
    if (command === "build") {
      if (!out || resolve(file) === resolve(out))
        throw Error("specify a distinct output path using -o");
      const temp = mkdtempSync(join(dirname(out), ".ember-"));
      try {
        const path = join(temp, "image");
        writeFileSync(path, JSON.stringify(image, null, 2) + "\n");
        renameSync(path, out);
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    } else if (command === "verify")
      console.log(JSON.stringify(verify(image), null, 2));
    else if (command === "dump" || command === "disasm")
      console.log(disassemble(image));
    else {
      const result = execute(image, { limit });
      if (command === "check") {
        const ref = interpret(program, { limit });
        if (JSON.stringify(result.output) !== JSON.stringify(ref.output))
          throw Error("engine disagreement");
        console.error(
          "Both engines agree on " + result.output.length + " output lines.",
        );
      }
      for (const line of result.output) console.log(line);
      if (command === "profile")
        console.error(JSON.stringify(result.profile, null, 2));
    }
  }
} catch (err) {
  console.error(
    err instanceof EmberError ? err.format(source, file) : err.message,
  );
  process.exitCode = 1;
}
