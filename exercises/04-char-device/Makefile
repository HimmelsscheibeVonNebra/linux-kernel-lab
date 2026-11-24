ifneq ($(KERNELRELEASE),)
obj-m += chardev_demo.o
else
KDIR ?= /path/to/buildroot/output/build/linux-6.12.40

all:
	$(MAKE) -C $(KDIR) M=$(CURDIR) modules

clean:
	$(MAKE) -C $(KDIR) M=$(CURDIR) clean
endif
