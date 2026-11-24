################################################################################
#
# sysprog-examples: course examples, built with each class's own Makefile
#
################################################################################

SYSPROG_EXAMPLES_VERSION = 1.0
SYSPROG_EXAMPLES_SITE = $(BR2_EXTERNAL_KERNELLAB_PATH)/../sysprog
SYSPROG_EXAMPLES_SITE_METHOD = local

# The examples target 64-bit Ubuntu, so 32-bit format warnings must not stop
# the build: build-examples.sh compiles through a wrapper that adds -Wno-error.
define SYSPROG_EXAMPLES_BUILD_CMDS
	$(TARGET_MAKE_ENV) $(SYSPROG_EXAMPLES_PKGDIR)/build-examples.sh \
		$(@D) "$(TARGET_CC)"
endef

define SYSPROG_EXAMPLES_INSTALL_TARGET_CMDS
	mkdir -p $(TARGET_DIR)/home/student
	rsync -a --exclude '.*' --exclude cc-lab --exclude '*.o' \
		$(@D)/ $(TARGET_DIR)/home/student/
endef

$(eval $(generic-package))
