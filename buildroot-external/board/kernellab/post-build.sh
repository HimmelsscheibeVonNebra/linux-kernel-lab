#!/bin/sh
# Buildroot post-build hook: $1 is the target rootfs directory.
# Puts the exercise modules and their sources where students expect them.
set -eu

TARGET_DIR="$1"
REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

mkdir -p "$TARGET_DIR/root/src" "$TARGET_DIR/mnt/host"

# /root/<name>.ko  (also stays under /lib/modules for modprobe)
find "$TARGET_DIR/lib/modules" -name '*.ko' -path '*/updates/*' \
	-exec cp {} "$TARGET_DIR/root/" \;

# /root/src/<name>.c for reading inside the guest
cp "$REPO_DIR"/exercises/*/*.c "$TARGET_DIR/root/src/"
