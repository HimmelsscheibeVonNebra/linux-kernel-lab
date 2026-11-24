################################################################################
#
# kernellab-modules: out-of-tree exercise modules, built against the lab kernel
#
################################################################################

KERNELLAB_MODULES_VERSION = 1.0
KERNELLAB_MODULES_SITE = $(BR2_EXTERNAL_KERNELLAB_PATH)/../exercises
KERNELLAB_MODULES_SITE_METHOD = local
KERNELLAB_MODULES_LICENSE = GPL-2.0
KERNELLAB_MODULES_MODULE_SUBDIRS = \
	01-hello-module \
	02-procfs \
	03-sysfs \
	04-char-device

$(eval $(kernel-module))
$(eval $(generic-package))
