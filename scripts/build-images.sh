#!/usr/bin/env bash
# Build images/bzImage and images/rootfs.cpio.gz with Buildroot inside Docker.
#
#   scripts/build-images.sh            full build (first run: toolchain + kernel)
#   scripts/build-images.sh modules    rebuild only exercises/ + sysprog/ + rootfs
#   scripts/build-images.sh shell      open a shell in the build container
#
# Environment:
#   WORK_DIR  Buildroot checkout + output (default: ../linux-kernel-lab-build)
#             Must be on a case-sensitive filesystem (i.e. Linux, not macOS).
#   JOBS      parallel jobs (default: all cores)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$REPO_DIR/../linux-kernel-lab-build-glibc}"
BR_VERSION="${BR_VERSION:-2026.08.2}"
JOBS="${JOBS:-0}"
IMAGE=kernellab-builder
MODE="${1:-all}"

mkdir -p "$WORK_DIR" "$REPO_DIR/images"
WORK_DIR="$(cd "$WORK_DIR" && pwd)"

docker build -q -t "$IMAGE" "$REPO_DIR/docker" >/dev/null

run() {
	docker run --rm ${TTY:+-it} \
		--user "$(id -u):$(id -g)" \
		-v "$WORK_DIR":/work \
		-v "$REPO_DIR":/src \
		-e BR_VERSION="$BR_VERSION" -e JOBS="$JOBS" \
		"$IMAGE" "$@"
}

case "$MODE" in
shell)
	TTY=1 run bash
	;;
all|modules)
	run bash -euo pipefail -c '
		if [ ! -d buildroot ]; then
			wget -q "https://buildroot.org/downloads/buildroot-$BR_VERSION.tar.xz"
			mkdir buildroot
			tar -xf "buildroot-$BR_VERSION.tar.xz" -C buildroot --strip-components=1
			rm "buildroot-$BR_VERSION.tar.xz"
		fi
		br() { make -C buildroot O=/work/output BR2_EXTERNAL=/src/buildroot-external BR2_JLEVEL="$JOBS" "$@"; }
		br kernellab_defconfig
		if [ "'"$MODE"'" = modules ]; then
			br kernellab-modules-dirclean sysprog-examples-dirclean
		fi
		br
		cp output/images/bzImage output/images/rootfs.cpio.gz /src/images/
		ls -l /src/images/
	'
	;;
*)
	echo "usage: $0 [all|modules|shell]" >&2
	exit 2
	;;
esac
