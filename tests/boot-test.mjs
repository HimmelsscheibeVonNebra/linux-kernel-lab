// Headless end-to-end test of the kernel module lab (root shell).
//
//   node tests/boot-test.mjs          (VERBOSE=1 shows the guest console)
//
// Exits 0 when every exercise module loads, behaves, and unloads.

import { bootGuest } from "./guest.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    if (detail) console.log(detail.trim().split("\n").map((l) => "      " + l).join("\n"));
  }
}

let guest;
try {
  guest = await bootGuest();
  const { sh } = guest;
  console.log(`booted to shell in ${guest.bootSeconds.toFixed(1)}s`);

  let r = await sh("uname -srm; id -u");
  // Kernel messages share the console and can land between output lines,
  // so match lines individually rather than as one block.
  check("root shell on the 32-bit lab kernel", /Linux \S+-kernellab i686/.test(r.out) && /^0$/m.test(r.out), r.out);

  // 01 hello
  r = await sh("insmod /root/hello.ko && dmesg | tail -n 3");
  check("01 hello: insmod logs greeting", r.status === 0 && r.out.includes("Hello from Linux Kernel!"), r.out);
  r = await sh("lsmod");
  check("01 hello: listed by lsmod", /^hello\b/m.test(r.out), r.out);
  r = await sh("rmmod hello && dmesg | tail -n 3");
  check("01 hello: rmmod logs farewell", r.status === 0 && r.out.includes("Goodbye from Linux Kernel!"), r.out);

  // 02 procfs
  r = await sh("insmod /root/proc_demo.ko && cat /proc/kernellab && cat /proc/kernellab");
  check("02 procfs: /proc/kernellab readable, counter increments",
    r.status === 0 && r.out.includes("read_count: 1") && r.out.includes("read_count: 2"), r.out);
  r = await sh("rmmod proc_demo; test ! -e /proc/kernellab");
  check("02 procfs: entry removed on rmmod", r.status === 0, r.out);

  // 03 sysfs
  r = await sh("insmod /root/sysfs_demo.ko && cat /sys/kernel/kernellab/value && echo 42 > /sys/kernel/kernellab/value && cat /sys/kernel/kernellab/value");
  check("03 sysfs: value reads 0 then 42", r.status === 0 && /^0$/m.test(r.out) && /^42$/m.test(r.out), r.out);
  r = await sh("rmmod sysfs_demo; test ! -e /sys/kernel/kernellab");
  check("03 sysfs: kobject removed on rmmod", r.status === 0, r.out);

  // 04 char device
  r = await sh("insmod /root/chardev_demo.ko && test -c /dev/kernellab && echo hello-chardev > /dev/kernellab && cat /dev/kernellab");
  check("04 chardev: write then read back", r.status === 0 && r.out.includes("hello-chardev"), r.out);
  r = await sh("rmmod chardev_demo; test ! -e /dev/kernellab");
  check("04 chardev: device node removed on rmmod", r.status === 0, r.out);

  // 9p file exchange (the "파일 올리기" button uses the same API)
  await guest.createFile("/host/from-host.txt", new TextEncoder().encode("exchanged over 9p\n"));
  r = await sh("cat /mnt/host/from-host.txt");
  check("9p: file created on host side is visible in guest", r.out.includes("exchanged over 9p"), r.out);

  r = await sh("date +%Y");
  check("clock: guest has real wall-clock time", parseInt(r.out, 10) >= 2026, r.out);
} catch (err) {
  failures++;
  console.error("ERROR", err.message);
  if (err.tail) console.error("--- serial tail ---\n" + err.tail);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
if (guest) await guest.destroy();
process.exit(failures ? 1 : 0);
