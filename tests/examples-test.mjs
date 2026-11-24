// Runs the steps of every example page exactly as a student would: one boot
// per class as user "student" in /home/student/<class>, each step typed into
// the interactive shell.
//
//   node tests/examples-test.mjs [class ...]     (VERBOSE=1 shows the console)
//
// An example passes when no step hangs, nothing crashes or is missing, and
// its "expect" text (if any) appears in the output.  Examples marked
// "manual" need key presses; for those only the binary's presence is checked.
// Full transcripts go to tests/out/<class>.log.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootGuest } from "./guest.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaDir = path.join(root, "examples-meta");
const outDir = path.join(root, "tests", "out");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const classes = fs
  .readdirSync(metaDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(metaDir, f), "utf8")))
  .filter((c) => c.examples.length > 0 && (only.length === 0 || only.includes(c.class)));

// A missing tool, a shell syntax error, or the shell reporting that a
// foreground program crashed (a bare "Segmentation fault" line; programs
// that demonstrate crashes print it inside a longer line).
const BROKEN = /: not found|syntax error|^(Segmentation fault|Illegal instruction|Bus error)( \(core dumped\))?$/m;

const results = [];

for (const cls of classes) {
  const guest = await bootGuest(cls.class);
  let log = `### ${cls.class} (boot ${guest.bootSeconds.toFixed(1)}s)\n`;

  for (const ex of cls.examples) {
    const result = { class: cls.class, name: ex.name, status: "PASS", why: "" };
    const bin = "./" + ex.source.replace(/\.c$/, "");
    log += `\n===== ${ex.name}${ex.manual ? " (manual)" : ""}\n`;

    const present = await guest.sh(`test -x ${bin}`);
    if (present.status !== 0) {
      result.status = "FAIL";
      result.why = `binary ${bin} missing`;
    } else if (ex.manual) {
      result.status = "MANUAL";
    } else {
      let combined = "";
      for (const step of ex.steps) {
        const r = await guest.sh(step.cmd, 40_000);
        log += `$ ${step.cmd}\n${r.out}[exit ${r.timedOut ? "TIMEOUT" : r.status}]\n`;
        combined += r.out;
        if (r.timedOut) {
          result.status = "FAIL";
          result.why = `step hung: ${step.cmd}`;
          break;
        }
      }
      const broken = combined.match(BROKEN);
      if (result.status === "PASS" && broken) {
        result.status = "FAIL";
        result.why = `output contains "${broken[0]}"`;
      }
      if (result.status === "PASS" && ex.expect && !combined.includes(ex.expect)) {
        result.status = "FAIL";
        result.why = `expected text not found: ${JSON.stringify(ex.expect)}`;
      }
      // Leave nothing running for the next example.
      const jobs = await guest.sh("for p in $(jobs -p); do kill -0 $p 2>/dev/null && echo $p; done | wc -l");
      if (result.status === "PASS" && parseInt(jobs.out, 10) > 0) {
        result.status = "FAIL";
        result.why = "background job still running after the last step";
      }
      await guest.sh("kill -9 $(jobs -p) 2>/dev/null; wait");
    }

    console.log(`${result.status.padEnd(6)} ${cls.class}/${ex.name}${result.why ? "  -- " + result.why : ""}`);
    results.push(result);
  }

  fs.writeFileSync(path.join(outDir, `${cls.class}.log`), log);
  await guest.destroy();
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${results.length} examples: ${count("PASS")} passed, ${count("MANUAL")} manual (not run), ${count("FAIL")} failed`);
process.exit(count("FAIL") ? 1 : 0);
