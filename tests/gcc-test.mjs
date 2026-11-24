// Checks the in-guest toolchain served over 9p: gcc runs as user "student",
// builds and links against the guest's glibc, and every class's own Makefile
// builds its examples from source.
//
//   node tests/gcc-test.mjs [class ...]     (VERBOSE=1 shows the console)
//
// Transcript: tests/out/gcc.log

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootGuest } from "./guest.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tests", "out");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const classes = fs
  .readdirSync(path.join(root, "sysprog"))
  .filter((d) => fs.existsSync(path.join(root, "sysprog", d, "Makefile")))
  .filter((d) => only.length === 0 || only.includes(d))
  .sort();

let failures = 0;
let log = "";
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    if (detail) console.log(detail.trim().split("\n").slice(-12).map((l) => "      " + l).join("\n"));
  }
}

const guest = await bootGuest("class03-01");
const { sh } = guest;
const timed = async (cmd, timeoutMs) => {
  const t0 = Date.now();
  const r = await sh(cmd, timeoutMs);
  r.seconds = (Date.now() - t0) / 1000;
  log += `$ ${cmd}\n${r.out}[exit ${r.timedOut ? "TIMEOUT" : r.status}, ${r.seconds.toFixed(1)}s]\n`;
  return r;
};

try {
  // BusyBox "command -v" reports only its first argument
  let r = await timed("id -un; for c in gcc cc make; do command -v $c; done", 10_000);
  check("student shell finds gcc, cc and make",
    /student/.test(r.out) && /\/opt\/gcc\/bin\/gcc$/m.test(r.out) && /\/opt\/gcc\/bin\/cc$/m.test(r.out) && /\/make$/m.test(r.out), r.out);

  r = await timed("gcc --version | head -n 1", 120_000);
  check(`gcc --version (first use, files fetched over 9p: ${r.seconds.toFixed(1)}s)`, r.status === 0 && /gcc .*15\./.test(r.out), r.out);

  r = await timed(
    // "%s" keeps the shell's printf away from the C format string
    "cd /tmp && printf '%s\\n' '#include <stdio.h>' 'int main(void){ printf(\"hello %zu\\n\", sizeof(long)); return 0; }' > hello.c && gcc -Wall -Werror -O2 -o hello hello.c && ./hello",
    180_000
  );
  check(`compile + link + run hello.c (cold: ${r.seconds.toFixed(1)}s)`, r.status === 0 && r.out.includes("hello 4"), r.out);

  r = await timed("cd /tmp && gcc -Wall -O2 -o hello hello.c && ./hello", 120_000);
  check(`same again, files cached (${r.seconds.toFixed(1)}s)`, r.status === 0 && r.out.includes("hello 4"), r.out);

  r = await timed("cd /tmp && gcc -static -o hello-static hello.c && ./hello-static && gcc -pthread -lrt -o hello-thr hello.c && ./hello-thr", 180_000);
  check("-static, -pthread and -lrt link", r.status === 0 && (r.out.match(/hello 4/g) || []).length === 2, r.out);

  for (const cls of classes) {
    r = await timed(`rm -rf /tmp/mk && cp -r ~/${cls} /tmp/mk && cd /tmp/mk && make clean > /dev/null 2>&1; make 2>&1 | tail -n 15; echo "make-status=$?"`, 600_000);
    // "make 2>&1 | tail" hides make's status; ask make again (nothing to do = 0)
    const again = await timed("cd /tmp/mk && make > /dev/null 2>&1; echo $?", 120_000);
    check(`${cls}: make builds from source (${r.seconds.toFixed(0)}s)`, !r.timedOut && again.out.trim().endsWith("0"), r.out);
  }
} catch (err) {
  failures++;
  console.error("ERROR", err.message);
  if (err.tail) console.error("--- serial tail ---\n" + err.tail);
}

fs.writeFileSync(path.join(outDir, "gcc.log"), log);
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
await guest.destroy();
process.exit(failures ? 1 : 0);
