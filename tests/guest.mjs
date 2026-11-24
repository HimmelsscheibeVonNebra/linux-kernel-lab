// Boots the lab images in v86 under Node.js and drives the guest shell over
// the serial port -- the same console the web pages attach xterm.js to.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { V86 } from "../build/libv86.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (rel) => path.join(root, rel);

const BOOT_TIMEOUT_MS = 240_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The serial log is kept one byte per character; programs print UTF-8.
const utf8 = (bytes) => Buffer.from(bytes, "latin1").toString("utf8").replace(/\r/g, "");

// labDir: "" for the root shell, or a class directory for the student shell
// (same meaning as data-lab-dir on the pages).
export async function bootGuest(labDir = "") {
  const emulator = new V86({
    wasm_path: p("build/v86.wasm"),
    memory_size: 256 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    bios: { url: p("bios/seabios.bin") },
    vga_bios: { url: p("bios/vgabios.bin") },
    bzimage: { url: p("images/bzImage") },
    initrd: { url: p("images/rootfs.cpio.gz") },
    // Same command line as js/lab.js
    cmdline: "console=ttyS0 rdinit=/init" + (labDir ? " loglevel=4 lab.dir=" + labDir : ""),
    filesystem: {},
    autostart: true,
  });

  let serial = "";
  emulator.add_listener("serial0-output-byte", (byte) => {
    const ch = String.fromCharCode(byte);
    serial += ch;
    if (process.env.VERBOSE) process.stdout.write(ch);
  });

  async function waitFor(needle, timeoutMs, from = 0) {
    const started = Date.now();
    for (;;) {
      const idx = serial.indexOf(needle, from);
      if (idx !== -1) return idx;
      if (Date.now() - started > timeoutMs) {
        const err = new Error(`timeout waiting for ${JSON.stringify(needle)}`);
        err.tail = serial.slice(-1500);
        throw err;
      }
      await sleep(25);
    }
  }

  let seq = 0;
  // Runs one command line in the guest's interactive shell.
  // Returns { out, status }; on timeout sends Ctrl+C and returns timedOut.
  async function sh(cmd, timeoutMs = 30_000) {
    const marker = `__DONE_${++seq}__`;
    const from = serial.length;
    // "prog &; echo" is a syntax error, "prog & echo" is fine.
    const sep = /&\s*$/.test(cmd) ? " " : "; ";
    emulator.serial0_send(`${cmd}${sep}echo ${marker}$?\n`);
    try {
      // The tty echoes the command line (marker followed by "$?"); the real
      // marker is followed by the exit status digit.
      let idx;
      for (let at = from; ; at = idx + 1) {
        idx = await waitFor(marker, timeoutMs, at);
        await waitFor("\n", 5_000, idx);
        if (/\d/.test(serial[idx + marker.length])) break;
      }
      const status = parseInt(serial.slice(idx + marker.length), 10);
      const echoEnd = serial.indexOf("\n", from) + 1;
      return { out: utf8(serial.slice(echoEnd, idx)), status, timedOut: false };
    } catch (err) {
      emulator.serial0_send("\x03");
      await sleep(500);
      emulator.serial0_send("\x03\n");
      await sleep(1000);
      return { out: utf8(serial.slice(from)), status: -1, timedOut: true };
    }
  }

  const t0 = Date.now();
  await waitFor("Lab -- ", BOOT_TIMEOUT_MS);
  await sleep(300);
  const bootSeconds = (Date.now() - t0) / 1000;

  return {
    emulator,
    sh,
    bootSeconds,
    createFile: (name, data) => emulator.create_file(name, data),
    destroy: () => emulator.destroy(),
  };
}
