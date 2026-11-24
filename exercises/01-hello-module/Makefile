ifneq ($(KERNELRELEASE),)
# Invoked by the kernel build system (kbuild)
obj-m += hello.o
else
# Invoked directly: make KDIR=/path/to/buildroot/output/build/linux-<version>
KDIR ?= /path/to/buildroot/output/build/linux-6.12.40

all:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean
endif
