"use strict";

// Shared by every lab page.  The page tells us where the site root is and
// which example directory to start in:
//
//   <body data-root="../../" data-lab-dir="class03-01">
//
// data-lab-dir empty  -> root shell (kernel module lab)
// data-lab-dir set    -> user "student" in /home/student/<dir>
(function () {
  const root = document.body.dataset.root || "";
  const labDir = document.body.dataset.labDir || "";

  const statusEl = document.getElementById("status");
  const termEl = document.getElementById("terminal");
  const runButtons = Array.from(document.querySelectorAll("button[data-cmd]"));

  function setStatus(text) {
    statusEl.textContent = text;
  }

  // The guest shell is on the serial port; xterm.js is its terminal.
  // Size must match "stty rows 30 cols 100" in the guest's /etc/profile.d/lab.sh.
  const term = new Terminal({
    cols: 100,
    rows: 30,
    fontSize: 14,
    fontFamily: '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "D2Coding", monospace',
    cursorBlink: true,
    scrollback: 5000,
    theme: { background: "#0e1116", foreground: "#d6dbe4" },
  });
  term.open(termEl);

  const emulator = new V86({
    wasm_path: root + "build/v86.wasm",
    memory_size: 256 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    bios: { url: root + "bios/seabios.bin" },
    vga_bios: { url: root + "bios/vgabios.bin" },
    bzimage: { url: root + "images/bzImage" },
    initrd: { url: root + "images/rootfs.cpio.gz" },
    // Example pages keep kernel chatter (boot log, segfault reports) off the
    // terminal; the kernel lab shows everything.
    cmdline: "console=ttyS0 rdinit=/init" + (labDir ? " loglevel=4 lab.dir=" + labDir : ""),
    // Empty 9p filesystem; uploaded files appear in the guest at /mnt/host
    filesystem: {},
    // Input goes through xterm.js only; keep v86 from grabbing page keys.
    disable_keyboard: true,
    disable_mouse: true,
    autostart: true,
  });

  // Guest -> terminal (batched per frame; raw bytes so UTF-8 decodes correctly)
  let pending = [];
  let tail = "";
  let ready = false;

  function markReady() {
    ready = true;
    runButtons.forEach((b) => { b.disabled = false; });
    setStatus("준비됨 — 터미널에 입력하거나 ▶ 버튼을 누르세요");
  }

  emulator.add_listener("serial0-output-byte", (byte) => {
    if (pending.length === 0) {
      requestAnimationFrame(() => {
        term.write(new Uint8Array(pending));
        pending = [];
      });
    }
    pending.push(byte);

    if (!ready) {
      // The login banner printed by lab.sh ends the boot.
      tail = (tail + String.fromCharCode(byte)).slice(-32);
      if (tail.includes("Lab -- ")) markReady();
    }
  });

  // Terminal -> guest
  const encoder = new TextEncoder();
  function sendToGuest(text) {
    emulator.serial_send_bytes(0, encoder.encode(text));
  }
  term.onData(sendToGuest);

  runButtons.forEach((button) => {
    button.disabled = true;
    button.addEventListener("click", () => {
      sendToGuest(button.dataset.cmd + "\n");
      term.focus();
    });
  });

  emulator.add_listener("download-progress", (e) => {
    const name = (e.file_name || "").split("/").pop();
    if (e.total) {
      setStatus(`내려받는 중: ${name} ${Math.floor((e.loaded / e.total) * 100)}%`);
    } else {
      setStatus(`내려받는 중: ${name}`);
    }
  });
  emulator.add_listener("download-error", (e) => {
    setStatus(`파일을 내려받지 못했습니다: ${e.file_name}`);
  });
  emulator.add_listener("emulator-started", () => {
    if (!ready) setStatus("부팅 중… (10~30초)");
  });

  document.getElementById("reset").addEventListener("click", () => {
    ready = false;
    tail = "";
    runButtons.forEach((b) => { b.disabled = true; });
    term.reset();
    setStatus("부팅 중… (10~30초)");
    emulator.restart();
    term.focus();
  });

  document.getElementById("upload").addEventListener("change", async (ev) => {
    const files = Array.from(ev.target.files);
    ev.target.value = "";
    try {
      for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        await emulator.create_file("/" + file.name, data);
      }
      setStatus(`올림: ${files.map((f) => "/mnt/host/" + f.name).join(", ")}`);
    } catch (err) {
      setStatus(`파일을 올리지 못했습니다: ${err.message || err}`);
    }
  });
})();
