#!/bin/sh
# Buildroot post-build hook: $1 is the target rootfs directory.
# Puts the exercise modules and their sources where students expect them.
set -eu

TARGET_DIR="$1"
REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

mkdir -p "$TARGET_DIR/root/src" "$TARGET_DIR/mnt/9p" "$TARGET_DIR/opt"

# The page's 9p filesystem is mounted at /mnt/9p (see S20host9p):
#   /mnt/host -> uploaded files      /opt/gcc -> gcc, binutils, sysroot
rm -rf "$TARGET_DIR/mnt/host"
ln -sfn 9p/host "$TARGET_DIR/mnt/host"
ln -sfn /mnt/9p/gcc "$TARGET_DIR/opt/gcc"

# /root/<name>.ko  (also stays under /lib/modules for modprobe)
find "$TARGET_DIR/lib/modules" -name '*.ko' -path '*/updates/*' \
	-exec cp {} "$TARGET_DIR/root/" \;

# /root/src/<name>.c for reading inside the guest
cp "$REPO_DIR"/exercises/*/*.c "$TARGET_DIR/root/src/"
