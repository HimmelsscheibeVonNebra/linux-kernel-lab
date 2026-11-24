#!/bin/sh
# usage: build-toolchain.sh <build-dir> <gcc.tar> <binutils.tar> <gmp.tar> <mpfr.tar> <mpc.tar>
#
# Builds gcc (C only) and binutils that run on the i686 target, installed
# under /opt/gcc with /opt/gcc/sysroot as their sysroot, into <build-dir>/out.
#
# Environment (from native-toolchain.mk): PATH with the cross toolchain,
# GNU_HOST_NAME, GNU_TARGET_NAME, STAGING_DIR, JOBS, GCC_PATCH_DIR.
set -eu

B="$1"
GCC_TAR="$2" BINUTILS_TAR="$3" GMP_TAR="$4" MPFR_TAR="$5" MPC_TAR="$6"

T="$GNU_TARGET_NAME"
PREFIX=/opt/gcc
SYSROOT=$PREFIX/sysroot
OUT="$B/out"
W="$B/work"

rm -rf "$W" "$OUT"
mkdir -p "$W" "$OUT"
cd "$W"

unpack() { mkdir "$1"; tar -xf "$2" -C "$1" --strip-components=1; }
unpack gcc "$GCC_TAR"
unpack binutils "$BINUTILS_TAR"
unpack gcc/gmp "$GMP_TAR"     # in-tree: built and linked statically into cc1
unpack gcc/mpfr "$MPFR_TAR"
unpack gcc/mpc "$MPC_TAR"

# Same patches Buildroot applies to its own gcc
if [ -d "$GCC_PATCH_DIR" ]; then
	for p in "$GCC_PATCH_DIR"/*.patch; do
		[ -e "$p" ] && patch -d gcc -p1 -s < "$p"
	done
fi

# Programs that run on the target are built with the cross compiler.
export CC="$T-gcc" CXX="$T-g++" AR="$T-ar" RANLIB="$T-ranlib" \
	NM="$T-nm" STRIP="$T-strip" LD="$T-ld" AS="$T-as"
export CC_FOR_BUILD=gcc CXX_FOR_BUILD=g++
# Target libraries (libgcc) are built by the cross compiler too.  Name it
# explicitly: left alone, configure picks "$T-cc", which is not always a
# working entry point of Buildroot's toolchain wrapper.
export CC_FOR_TARGET="$T-gcc" GCC_FOR_TARGET="$T-gcc" CXX_FOR_TARGET="$T-g++" \
	AR_FOR_TARGET="$T-ar" AS_FOR_TARGET="$T-as" LD_FOR_TARGET="$T-ld" \
	NM_FOR_TARGET="$T-nm" RANLIB_FOR_TARGET="$T-ranlib" STRIP_FOR_TARGET="$T-strip" \
	OBJDUMP_FOR_TARGET="$T-objdump" READELF_FOR_TARGET="$T-readelf"
export CFLAGS="-O2" CXXFLAGS="-O2"

common="--build=$GNU_HOST_NAME --host=$T --target=$T --prefix=$PREFIX
	--with-sysroot=$SYSROOT --disable-nls --disable-multilib"

# ---- binutils (as, ld, ar, objdump, readelf, ...) ----
mkdir build-binutils
(
	cd build-binutils
	../binutils/configure $common \
		--disable-werror --disable-gdb --disable-gdbserver --disable-sim \
		--disable-gprofng --disable-gold --disable-plugins \
		--disable-shared --enable-static --enable-deterministic-archives \
		--without-zstd --without-debuginfod
	make -j"$JOBS"
	make install DESTDIR="$OUT"
)

# ---- gcc (C only) ----
# A "crossed native" build: its target libraries (libgcc) are compiled by the
# existing cross compiler, so headers come from the build-time sysroot.
mkdir build-gcc
(
	cd build-gcc
	../gcc/configure $common \
		--with-build-sysroot="$STAGING_DIR" \
		--enable-languages=c --disable-bootstrap \
		--disable-libsanitizer --disable-libssp --disable-libgomp \
		--disable-libquadmath --disable-libvtv --disable-lto --disable-plugin \
		--disable-decimal-float --enable-threads --enable-tls \
		--enable-__cxa_atexit --enable-shared --with-arch=i686 \
		--without-isl --without-zstd --with-gnu-ld --with-gnu-as \
		--with-pkgversion="Linux Lab"
	make -j"$JOBS"
	make install-strip DESTDIR="$OUT"
)

R="$OUT$PREFIX"

# ---- sysroot: the guest's own glibc headers, crt files and libraries ----
mkdir -p "$R/sysroot/usr"
cp -a "$STAGING_DIR/usr/include" "$R/sysroot/usr/"
cp -a "$STAGING_DIR/lib" "$R/sysroot/"
mkdir -p "$R/sysroot/usr/lib"
( cd "$STAGING_DIR/usr/lib" && \
  find . -maxdepth 1 \( -name '*crt*.o' -o -name 'lib*.so' -o -name 'lib*.a' \) \
       ! -name 'libstdc++*' ! -name 'libsupc++*' -exec cp -a {} "$R/sysroot/usr/lib/" \; )
rm -rf "$R/sysroot/lib/libstdc++"* "$R/sysroot/lib/"*.py

# ---- tidy: plain names only, no docs ----
rm -rf "$R/share" "$R/include" "$R/$T/include"
for f in "$R/bin/$T-"*; do
	name="${f##*/$T-}"
	# keep the unprefixed copy (gcc, as, ld, ...), drop the prefixed one
	if [ -e "$R/bin/$name" ]; then rm -f "$f"; else mv "$f" "$R/bin/$name"; fi
done
rm -f "$R/bin/"*-"$(basename "$GCC_TAR" | sed 's/gcc-\(.*\)\.tar.*/\1/')"
ln -sf gcc "$R/bin/cc"

# binutils "make install" is not stripped
for f in "$R/bin/"* "$R/$T/bin/"*; do
	[ -f "$f" ] && [ ! -L "$f" ] && "$T-strip" "$f" 2>/dev/null || true
done

du -sh "$R" "$R/sysroot" "$R/libexec"
