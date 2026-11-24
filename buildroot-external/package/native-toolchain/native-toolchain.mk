################################################################################
#
# native-toolchain: gcc + binutils for the target ("crossed native"), built
# with the Buildroot cross toolchain from the same sources and versions.
#
################################################################################

NATIVE_TOOLCHAIN_VERSION = $(GCC_VERSION)
NATIVE_TOOLCHAIN_SITE = $(NATIVE_TOOLCHAIN_PKGDIR)/src
NATIVE_TOOLCHAIN_SITE_METHOD = local
NATIVE_TOOLCHAIN_LICENSE = GPL-3.0+ (gcc, binutils), LGPL-3.0+ (gmp, mpfr, mpc)

# The host-* packages guarantee their source tarballs are in DL_DIR.
NATIVE_TOOLCHAIN_DEPENDENCIES = host-m4 host-gmp host-mpfr host-mpc host-binutils

NATIVE_TOOLCHAIN_INSTALL_TARGET = NO
NATIVE_TOOLCHAIN_INSTALL_IMAGES = YES

define NATIVE_TOOLCHAIN_BUILD_CMDS
	PATH=$(BR_PATH) \
	GNU_HOST_NAME=$(GNU_HOST_NAME) \
	GNU_TARGET_NAME=$(GNU_TARGET_NAME) \
	STAGING_DIR=$(STAGING_DIR) \
	JOBS=$(PARALLEL_JOBS) \
	GCC_PATCH_DIR=$(TOPDIR)/package/gcc/$(GCC_VERSION) \
	$(NATIVE_TOOLCHAIN_PKGDIR)/build-toolchain.sh $(@D) \
		$(DL_DIR)/gcc/$(GCC_SOURCE) \
		$(DL_DIR)/binutils/$(BINUTILS_SOURCE) \
		$(DL_DIR)/gmp/$(GMP_SOURCE) \
		$(DL_DIR)/mpfr/$(MPFR_SOURCE) \
		$(DL_DIR)/mpc/$(MPC_SOURCE)
endef

define NATIVE_TOOLCHAIN_INSTALL_IMAGES_CMDS
	rm -rf $(BINARIES_DIR)/toolchain
	mkdir -p $(BINARIES_DIR)/toolchain
	cp -a $(@D)/out/opt/gcc $(BINARIES_DIR)/toolchain/gcc
endef

$(eval $(generic-package))
