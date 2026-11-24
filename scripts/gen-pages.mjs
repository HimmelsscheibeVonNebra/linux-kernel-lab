// Generates the static site from examples-meta/*.json and the sources:
//
//   index.html                          hub: kernel lab + every class
//   kernel.html                         kernel module lab (root shell)
//   examples/<class>/index.html         one class: its examples + lecture notes
//                                       (class-notes/<class>.html, if present)
//   examples/<class>/<example>.html     one example: terminal + steps + source
//
//   node scripts/gen-pages.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function write(rel, content) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "service/helloworld.c" -> "service-helloworld"
const slugOf = (ex) => ex.source.replace(/\.c$/, "").replace(/\//g, "-");

// class03-02-text-binary -> "3주차 2차시 · text-binary"
function classLabel(id) {
  const m = id.match(/^class(\d+)-(\d+)(?:-(.+))?$/);
  if (!m) return id;
  return `${Number(m[1])}주차 ${Number(m[2])}차시` + (m[3] ? ` · ${m[3]}` : "");
}

// ---------------------------------------------------------------- templates

function layout({ title, root, labDir, crumbs, body, withLab }) {
  const crumbHtml = crumbs
    .map((c) => (c.href ? `<a href="${esc(c.href)}">${esc(c.text)}</a>` : `<span>${esc(c.text)}</span>`))
    .join('<span class="sep">/</span>');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · Linux Lab</title>
  <link rel="stylesheet" href="${root}css/style.css">
${withLab ? `  <link rel="stylesheet" href="${root}vendor/xterm/xterm.css">
  <script src="${root}vendor/xterm/xterm.js"></script>
  <script src="${root}build/libv86.js"></script>
` : ""}</head>
<body data-root="${root}"${labDir ? ` data-lab-dir="${esc(labDir)}"` : ""}>
  <nav class="crumbs">${crumbHtml}</nav>
${body}
${withLab ? `  <script src="${root}js/lab.js"></script>\n` : ""}</body>
</html>
`;
}

const machine = (hint) => `    <section class="machine">
      <div class="toolbar">
        <button id="reset" type="button">재부팅</button>
        <label class="upload">파일 올리기<input id="upload" type="file" multiple hidden></label>
        <span id="status" role="status">준비 중…</span>
      </div>
      <div class="terminal-wrap"><div id="terminal"></div></div>
      <p class="hint">${hint}</p>
    </section>`;

function stepsHtml(steps) {
  return `<ol class="steps">
${steps
  .map(
    (s) => `        <li>
          <div class="cmd"><button type="button" data-cmd="${esc(s.cmd)}" title="터미널에서 실행" aria-label="실행: ${esc(s.cmd)}">▶</button><code>${esc(s.cmd)}</code></div>
${s.note ? `          <p>${esc(s.note)}</p>\n` : ""}        </li>`
  )
  .join("\n")}
      </ol>`;
}

function sourceHtml(name, text, open) {
  const lines = text.replace(/\n$/, "").split("\n");
  return `    <details class="source"${open ? " open" : ""}>
      <summary>${esc(name)} <span class="muted">${lines.length}줄</span></summary>
      <pre class="code"><code>${lines.map((l) => `<span class="ln">${esc(l) || " "}</span>`).join("\n")}</code></pre>
    </details>`;
}

// Local headers the source includes (#include "x.h"), resolved next to it.
function localHeaders(classId, source) {
  const dir = path.dirname(path.join("sysprog", classId, source));
  const out = [];
  for (const m of read(path.join("sysprog", classId, source)).matchAll(/^\s*#\s*include\s+"([^"]+)"/gm)) {
    const rel = path.join(dir, m[1]);
    if (fs.existsSync(path.join(ROOT, rel))) out.push({ name: m[1], text: read(rel) });
  }
  return out;
}

// ---------------------------------------------------------------- lecture notes

// class-notes/<class>.html is an HTML fragment (the class's slides written
// out as prose) inlined into the class index page.  Because it is inlined
// as-is, check it: allowed tags only, properly nested, links resolve.
const NOTE_TAGS = new Set(
  "h2 h3 p ul ol li pre code table thead tbody tr th td strong em a blockquote br".split(" ")
);

function loadNotes(cls) {
  const rel = `class-notes/${cls.class}.html`;
  if (!fs.existsSync(path.join(ROOT, rel))) return "";
  const html = read(rel).trim();
  const slugs = new Set(cls.examples.map(slugOf));
  const problems = [];
  const stack = [];

  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [, close, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (!NOTE_TAGS.has(tag)) {
      problems.push(`tag <${tag}> not allowed`);
      continue;
    }
    if (tag === "br") continue;
    if (close) {
      const open = stack.pop();
      if (open !== tag) problems.push(`</${tag}> closes <${open ?? "nothing"}>`);
      continue;
    }
    stack.push(tag);
    const attrText = attrs.trim();
    if (tag === "a") {
      const href = attrText.match(/^href="([^"]*)"$/);
      if (!href) problems.push(`<a> must have only href: ${attrText}`);
      else if (!/^https?:\/\//.test(href[1]) && !slugs.has(href[1].replace(/\.html$/, "")))
        problems.push(`link to unknown example page: ${href[1]}`);
    } else if (attrText) {
      problems.push(`<${tag}> has attributes: ${attrText}`);
    }
  }
  if (stack.length) problems.push(`unclosed: ${stack.join(", ")}`);
  // A bare "<" or "&" would swallow or garble the text after it.
  const text = html.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  if (/</.test(text)) problems.push('unescaped "<" in text');
  if (/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)/.test(text)) problems.push('unescaped "&" in text');

  if (problems.length) {
    throw new Error(`${rel}:\n  ${[...new Set(problems)].slice(0, 12).join("\n  ")}`);
  }
  return html;
}

// ---------------------------------------------------------------- examples

const classes = fs
  .readdirSync(path.join(ROOT, "examples-meta"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(read(path.join("examples-meta", f))))
  .filter((c) => c.examples.length > 0);

let pageCount = 0;
let notesCount = 0;

for (const cls of classes) {
  const label = classLabel(cls.class);
  const notes = loadNotes(cls);
  if (notes) notesCount++;

  // class index
  write(
    `examples/${cls.class}/index.html`,
    layout({
      title: `${label} ${cls.title}`,
      root: "../../",
      crumbs: [{ text: "Linux Lab", href: "../../index.html" }, { text: label }],
      body: `  <header>
    <h1>${esc(cls.title)}</h1>
    <p>${esc(cls.summary)}</p>
  </header>
  <main class="list">
    <section>
      <h2>실행해 볼 예제</h2>
      <ul class="cards">
${cls.examples
  .map(
    (ex) => `        <li><a href="${slugOf(ex)}.html"><strong>${esc(ex.name)}</strong><span>${esc(ex.summary)}</span></a></li>`
  )
  .join("\n")}
      </ul>
    </section>
${notes ? `    <article class="notes">\n${notes}\n    </article>\n` : ""}  </main>`,
    })
  );

  cls.examples.forEach((ex, i) => {
    const prev = cls.examples[i - 1];
    const next = cls.examples[i + 1];
    const src = read(path.join("sysprog", cls.class, ex.source));
    const headers = localHeaders(cls.class, ex.source);

    write(
      `examples/${cls.class}/${slugOf(ex)}.html`,
      layout({
        title: `${ex.name} — ${cls.title}`,
        root: "../../",
        labDir: cls.class,
        withLab: true,
        crumbs: [
          { text: "Linux Lab", href: "../../index.html" },
          { text: label, href: "index.html" },
          { text: ex.name },
        ],
        body: `  <header>
    <h1>${esc(ex.name)}</h1>
    <p>${esc(ex.summary)}</p>
  </header>
  <main>
${machine(
  `<code>/home/student/${esc(cls.class)}</code>에서 <code>student</code> 사용자로 시작합니다. 컴파일된 실행 파일과 소스가 이미 들어 있고, 소스를 고쳐 <code>make</code>나 <code>gcc</code>로 다시 빌드할 수 있습니다 (처음 컴파일할 때 컴파일러를 내려받느라 잠시 걸립니다). 편집기는 <code>vi</code>입니다. 새로고침하거나 재부팅하면 처음 상태로 돌아갑니다.`
)}
    <aside class="guide">
      <h2>실행 순서</h2>
      ${stepsHtml(ex.steps)}
${ex.manual ? `      <p class="callout">직접 키를 입력해야 하는 단계가 있습니다. 터미널을 클릭한 뒤 입력하세요 (중단: Ctrl+C).</p>\n` : ""}${ex.notes ? `      <p class="callout">${esc(ex.notes)}</p>\n` : ""}    </aside>
  </main>
  <section class="sources">
    <h2>소스</h2>
${sourceHtml(ex.source, src, true)}
${headers.map((h) => sourceHtml(h.name, h.text, false)).join("\n")}
  </section>
  <nav class="pager">
    ${prev ? `<a href="${slugOf(prev)}.html">← ${esc(prev.name)}</a>` : "<span></span>"}
    ${next ? `<a href="${slugOf(next)}.html">${esc(next.name)} →</a>` : "<span></span>"}
  </nav>`,
      })
    );
    pageCount++;
  });
}

// ---------------------------------------------------------------- kernel lab

const kernelExercises = [
  {
    id: "01-hello-module",
    source: "hello.c",
    title: "01 · 첫 커널 모듈",
    summary: "모듈을 로드·제거하고 커널 로그에서 init/exit 메시지를 확인합니다.",
    steps: [
      { cmd: "uname -a", note: "32비트 x86 실습 커널인지 확인" },
      { cmd: "insmod hello.ko", note: "hello_init() 실행 — Hello from Linux Kernel!" },
      { cmd: "lsmod", note: "로드된 모듈 목록에 hello가 보입니다" },
      { cmd: "rmmod hello", note: "hello_exit() 실행 — Goodbye from Linux Kernel!" },
      { cmd: "dmesg | tail -n 5", note: "커널 로그 버퍼에서 두 메시지를 다시 확인" },
    ],
  },
  {
    id: "02-procfs",
    source: "proc_demo.c",
    title: "02 · procfs",
    summary: "/proc/kernellab 항목을 만들고 읽을 때마다 커널 함수가 호출되는 것을 봅니다.",
    steps: [
      { cmd: "insmod proc_demo.ko", note: "/proc/kernellab 생성" },
      { cmd: "cat /proc/kernellab", note: "읽을 때마다 kernellab_show()가 실행됩니다" },
      { cmd: "cat /proc/kernellab", note: "read_count가 1 증가" },
      { cmd: "rmmod proc_demo", note: "항목 제거" },
    ],
  },
  {
    id: "03-sysfs",
    source: "sysfs_demo.c",
    title: "03 · sysfs",
    summary: "kobject와 속성 파일로 커널 변수 하나를 사용자 공간에 노출합니다.",
    steps: [
      { cmd: "insmod sysfs_demo.ko", note: "/sys/kernel/kernellab/value 생성" },
      { cmd: "cat /sys/kernel/kernellab/value", note: "value_show() — 초기값 0" },
      { cmd: "echo 42 > /sys/kernel/kernellab/value", note: "value_store()가 값을 바꿉니다" },
      { cmd: "cat /sys/kernel/kernellab/value", note: "42" },
      { cmd: "rmmod sysfs_demo", note: "kobject 제거" },
    ],
  },
  {
    id: "04-char-device",
    source: "chardev_demo.c",
    title: "04 · 문자 디바이스",
    summary: "문자 디바이스를 등록하고 /dev/kernellab에 쓴 내용을 다시 읽습니다.",
    steps: [
      { cmd: "insmod chardev_demo.ko", note: "장치 번호 할당, /dev/kernellab 자동 생성" },
      { cmd: "ls -l /dev/kernellab", note: "문자 디바이스(c)와 major/minor 번호" },
      { cmd: "echo hello > /dev/kernellab", note: "lab_write()가 버퍼에 저장" },
      { cmd: "cat /dev/kernellab", note: "lab_read()가 버퍼를 돌려줍니다" },
      { cmd: "rmmod chardev_demo", note: "장치 해제" },
    ],
  },
];

write(
  "kernel.html",
  layout({
    title: "커널 모듈 실습",
    root: "",
    withLab: true,
    crumbs: [{ text: "Linux Lab", href: "index.html" }, { text: "커널 모듈 실습" }],
    body: `  <header>
    <h1>커널 모듈 실습</h1>
    <p>브라우저 안에서 부팅한 Linux 커널에 모듈을 로드·제거하고 로그, /proc, /sys, /dev를 확인합니다.</p>
  </header>
  <main>
${machine(
  `<code>root</code> 셸로 시작합니다. 모듈은 <code>/root/*.ko</code>, 소스는 <code>/root/src</code>에 있습니다. 올린 파일은 <code>/mnt/host</code>에 나타나며, 같은 커널로 빌드한 <code>.ko</code>를 올려 <code>insmod</code> 할 수 있습니다.`
)}
    <aside class="guide">
${kernelExercises
  .map(
    (k, i) => `      <details${i === 0 ? " open" : ""}>
        <summary>${esc(k.title)}</summary>
        <p>${esc(k.summary)}</p>
        ${stepsHtml(k.steps)}
      </details>`
  )
  .join("\n")}
    </aside>
  </main>
  <section class="sources">
    <h2>소스</h2>
${kernelExercises.map((k, i) => sourceHtml(k.source, read(`exercises/${k.id}/${k.source}`), i === 0)).join("\n")}
  </section>`,
  })
);

// ---------------------------------------------------------------- hub

write(
  "index.html",
  layout({
    title: "Linux Lab",
    root: "",
    crumbs: [{ text: "Linux Lab" }],
    body: `  <header>
    <h1>Linux Lab</h1>
    <p>설치 없이 브라우저에서 Linux를 부팅해 시스템 프로그래밍 예제와 커널 모듈을 실행합니다. 각 페이지는 자신의 브라우저 안에서 32비트 x86 Linux를 새로 부팅합니다.</p>
  </header>
  <main class="list">
    <section>
      <h2>커널 모듈 실습</h2>
      <ul class="cards">
        <li><a href="kernel.html"><strong>insmod · rmmod · dmesg</strong><span>hello 모듈, procfs, sysfs, 문자 디바이스 — root 셸에서 모듈을 로드하고 확인합니다.</span></a></li>
      </ul>
    </section>
${classes
  .map(
    (cls) => `    <section>
      <h2><a href="examples/${cls.class}/index.html">${esc(classLabel(cls.class))} — ${esc(cls.title)}</a></h2>
      <p class="muted">${esc(cls.summary)}</p>
      <ul class="chips">
${cls.examples.map((ex) => `        <li><a href="examples/${cls.class}/${slugOf(ex)}.html" title="${esc(ex.summary)}">${esc(ex.name)}</a></li>`).join("\n")}
      </ul>
    </section>`
  )
  .join("\n")}
  </main>`,
  })
);

console.log(
  `generated ${pageCount} example pages in ${classes.length} classes (${notesCount} with lecture notes), plus index.html and kernel.html`
);
