#!/bin/sh
# usage: build-examples.sh <build-dir> <cross-compiler command>
# Builds every example directory: with its own Makefile when it has one,
# otherwise one binary per .c file.
set -eu

cd "$1"
CROSS_CC="$2"

printf '#!/bin/sh\nexec %s "$@" -Wno-error\n' "$CROSS_CC" > cc-lab
chmod +x cc-lab
CC_LAB="$(pwd)/cc-lab"

for d in $(find . -name '*.c' -exec dirname {} \; | sort -u); do
	if [ -f "$d/Makefile" ]; then
		make -C "$d" CC="$CC_LAB" all
	fi
	# Programs the Makefile does not cover (or no Makefile at all)
	for c in "$d"/*.c; do
		if [ ! -x "${c%.c}" ] && grep -q 'main *(' "$c"; then
			"$CC_LAB" -Wall -Wextra -O2 -o "${c%.c}" "$c" -lrt -pthread
		fi
	done
done
