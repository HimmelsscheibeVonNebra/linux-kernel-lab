# Linux Lab

웹브라우저에서 32비트 x86 Linux를 부팅해 시스템 프로그래밍 예제와 커널 모듈을 실행하는 교육용 실습 환경입니다.
[v86](https://github.com/copy/v86) 에뮬레이터 위에서 [Buildroot](https://buildroot.org/)로 만든 커널과 initramfs를 실행하며, 정적 파일만으로 동작하므로 GitHub Pages에 그대로 배포됩니다.

- **시스템 프로그래밍 예제** — [2026_SystemProgramming](https://github.com/HimmelsscheibeVonNebra/2026_SystemProgramming) 강의의 C 예제마다 페이지가 하나씩 있습니다. 페이지를 열면 그 수업 디렉터리에서 `student` 사용자 셸이 뜨고, 컴파일된 실행 파일과 소스가 들어 있습니다. 실행 순서의 ▶ 버튼을 누르면 명령이 터미널에 입력됩니다.
- **강의 내용** — 수업별 페이지(`examples/<수업>/index.html`)에 그 수업 슬라이드를 풀어 쓴 글이 예제 목록과 함께 실려 있습니다. `class-notes/<수업>.html`을 고치고 `node scripts/gen-pages.mjs`를 실행하면 반영됩니다. 생성기가 허용 태그(`h2 h3 p ul ol li pre code table … a`)와 예제 링크를 검사합니다.
- **커널 모듈 실습** — `kernel.html`. root 셸에서 `insmod` / `rmmod` / `dmesg`, procfs, sysfs, 문자 디바이스를 실습합니다.

## 구성

```text
index.html, kernel.html, examples/   생성된 페이지 (scripts/gen-pages.mjs 출력)
css/, js/lab.js                      스타일과 공용 스크립트 (v86 + xterm.js 연결)
build/, bios/, vendor/xterm/         v86, SeaBIOS/VGA BIOS, xterm.js
images/                              bzImage, rootfs.cpio.gz (빌드 결과물)

sysprog/                             강의 예제 소스 (.c, .h, Makefile) 사본
examples-meta/                       예제별 설명과 실행 순서 (수업당 JSON 하나)
class-notes/                         수업별 강의 내용 (슬라이드를 풀어 쓴 HTML 조각, 수업 페이지에 삽입)
exercises/                           커널 모듈 소스 (01~04)
buildroot-external/                  Buildroot 설정: 커널 설정, rootfs overlay, 패키지
docker/, scripts/                    이미지 빌드 환경, 빌드·페이지 생성 스크립트
tests/                               Node.js 헤드리스 테스트
```

## 로컬 실행

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

`file://`로 직접 열면 WASM과 이미지를 불러오지 못하므로 반드시 HTTP 서버로 엽니다.

## 게스트 환경

| 항목 | 값 |
|---|---|
| 커널 | Linux 6.12 (i686, 단일 CPU), 메모리 256 MB |
| 사용자 공간 | glibc, BusyBox, strace |
| 예제 페이지 | 사용자 `student` (uid 1000), `/home/student/<수업>/` |
| 커널 실습 페이지 | `root`, 모듈 `/root/*.ko`, 소스 `/root/src` |
| 파일 올리기 | 페이지에서 올린 파일이 `/mnt/host` (9p)에 나타남 |

예제는 이미지 빌드 때 각 수업의 `Makefile`로 미리 컴파일되어 있고, 게스트 안에서 `gcc`(15.3, binutils 2.45)와 `make`로 다시 빌드할 수도 있습니다.

### 게스트의 gcc

컴파일러는 기본 이미지(`rootfs.cpio.gz`)에 넣지 않고 별도의 9p 파일시스템(`images/9p/`)으로 제공합니다. 페이지는 부팅할 때 파일 목록(`fs.json`)만 받고, 각 파일의 내용은 게스트가 처음 열 때 HTTP로 내려받습니다. 그래서 컴파일하지 않는 페이지는 추가로 받는 것이 없고, 처음 컴파일할 때만 `cc1` 등 필요한 파일을 받아 옵니다. 첫 컴파일에 약 17 MB(zstd 압축, 전체 9p 트리는 38 MB)를 받으며, 이후로는 새로고침 전까지 다시 받지 않습니다. `make`는 기본 이미지에 들어 있습니다.

| 게스트 경로 | 9p 경로 | 내용 |
|---|---|---|
| `/opt/gcc` | `/gcc` | gcc, binutils, glibc 헤더·라이브러리(`/opt/gcc/sysroot`) |
| `/mnt/host` | `/host` | 페이지에서 올린 파일 |

gcc는 Buildroot의 크로스 툴체인으로 같은 소스·버전을 i686용으로 다시 빌드한 것입니다(`buildroot-external/package/native-toolchain/`). 9p 변환에는 v86의 `fs2json.py`, `copy-to-sha256.py`(`scripts/v86/`)를 씁니다.

## 예제 추가·수정

1. 강의 저장소의 소스를 `sysprog/`로 다시 가져옵니다.

   ```bash
   rsync -a --prune-empty-dirs --exclude '*.dSYM/' --exclude 'student/' \
     --include '*/' --include '*.c' --include '*.h' --include 'Makefile' --exclude '*' \
     ../2026_SystemProgramming/Codes/ sysprog/
   ```

2. `examples-meta/<수업>.json`에 예제의 설명과 실행 순서를 적습니다.

   ```json
   {
     "name": "file_create",
     "source": "file_create.c",
     "summary": "예제가 보여 주는 것",
     "steps": [{ "cmd": "./file_create hello.txt", "note": "관찰할 것" }],
     "manual": false,
     "expect": "출력에 반드시 나와야 하는 문자열 (테스트용, 선택)",
     "notes": "주의 사항 (선택)"
   }
   ```

   `manual: true`는 키 입력이 필요한 예제로, 자동 테스트에서 실행하지 않습니다.

3. 이미지와 페이지를 다시 만들고 테스트합니다.

   ```bash
   scripts/build-images.sh modules
   node scripts/gen-pages.mjs
   node tests/examples-test.mjs
   ```

## 이미지 빌드

Docker가 있는 Linux에서 실행합니다. 호스트에 다른 패키지를 설치할 필요는 없습니다.

```bash
scripts/build-images.sh            # 전체 빌드 (처음 한 번: 툴체인 + 커널)
scripts/build-images.sh modules    # exercises/, sysprog/ 수정 후 해당 부분과 rootfs만
```

- Buildroot 체크아웃과 빌드 산출물은 `../linux-kernel-lab-build-glibc/`에 생깁니다 (`WORK_DIR`로 변경 가능).
- 커널 모듈은 커널과 버전·설정이 정확히 일치해야 로드되므로, 이 디렉터리를 유지한 채 `modules`로 다시 빌드합니다.
- 커널 설정은 `buildroot-external/board/kernellab/linux.config`, Buildroot 설정은 `buildroot-external/configs/kernellab_defconfig`입니다.
- 예제는 64비트 Ubuntu를 기준으로 작성되어 있어, 32비트에서 생기는 경고가 빌드를 막지 않도록 `-Werror`만 무력화하고 나머지는 각 수업의 `Makefile` 그대로 빌드합니다.

## 테스트

```bash
node tests/boot-test.mjs               # 커널 모듈 4종, 9p, 시계
node tests/examples-test.mjs           # 모든 예제의 실행 순서
node tests/examples-test.mjs class12-01   # 한 수업만
node tests/gcc-test.mjs                # 게스트 gcc: hello, -static, 수업별 make
```

브라우저 없이 v86으로 이미지를 부팅해, 페이지와 같은 직렬 콘솔 셸에 명령을 입력합니다. `VERBOSE=1`을 주면 게스트 콘솔 출력이 보이고, 예제 테스트의 전체 기록은 `tests/out/<수업>.log`에 남습니다.

## GitHub Pages 배포

저장소 **Settings → Pages → Deploy from a branch → `main` / `(root)`**. 모든 경로가 상대 경로이므로 저장소 이름과 무관하게 동작합니다. `.nojekyll`이 있어 파일이 그대로 제공됩니다.

## 제약

- v86은 32비트 단일 코어 에뮬레이터입니다. `long`과 `size_t`가 4바이트이고, CPU가 하나라 데이터 경쟁이 실제 장비보다 드물게 나타납니다. 예제별 차이는 각 페이지의 주의 사항에 적혀 있습니다.
- systemd, gdb, 네트워크가 없습니다. 해당 실습(서비스 등록, 디버깅)은 실제 Linux에서 진행합니다.
- 에뮬레이터 안의 컴파일은 실제 PC보다 훨씬 느립니다. 수업 하나를 `make`로 전부 다시 빌드하는 데 수십 초에서 몇 분이 걸릴 수 있습니다.
- 게스트 상태는 브라우저 메모리에만 있으며 새로고침하면 초기화됩니다.
- GitHub Pages는 정적 호스팅이라 서버 측 빌드, 제출, 채점 기능은 없습니다.

## 라이선스 및 소스 제공

배포되는 `images/`에는 Linux 커널(GPL-2.0), BusyBox(GPL-2.0), glibc(LGPL-2.1), strace(LGPL-2.1), GNU make(GPL-3.0), 그리고 `images/9p/`에 gcc·binutils(GPL-3.0)와 gmp·mpfr·mpc(LGPL-3.0)가 들어 있습니다. 바이너리를 공개 배포할 때는 대응 소스를 제공해야 하며, 이 저장소의 Buildroot 설정과 `scripts/build-images.sh`로 동일한 소스를 내려받아 재현할 수 있습니다 (`make legal-info`로 소스 묶음 생성 가능). v86은 BSD-2-Clause(`build/LICENSE.v86`), xterm.js는 MIT(`vendor/xterm/LICENSE`), SeaBIOS는 LGPL-3.0입니다.
