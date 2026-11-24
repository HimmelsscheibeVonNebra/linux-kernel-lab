#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/kobject.h>
#include <linux/sysfs.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Kernel Lab");
MODULE_DESCRIPTION("sysfs example: /sys/kernel/kernellab/value");

static struct kobject *lab_kobj;
static int value;

/* cat /sys/kernel/kernellab/value */
static ssize_t value_show(struct kobject *kobj, struct kobj_attribute *attr,
			  char *buf)
{
	return sysfs_emit(buf, "%d\n", value);
}

/* echo 42 > /sys/kernel/kernellab/value */
static ssize_t value_store(struct kobject *kobj, struct kobj_attribute *attr,
			   const char *buf, size_t count)
{
	int ret = kstrtoint(buf, 10, &value);

	if (ret)
		return ret;

	pr_info("sysfs_demo: value set to %d\n", value);
	return count;
}

static struct kobj_attribute value_attr = __ATTR_RW(value);

static int __init sysfs_demo_init(void)
{
	int ret;

	lab_kobj = kobject_create_and_add("kernellab", kernel_kobj);
	if (!lab_kobj)
		return -ENOMEM;

	ret = sysfs_create_file(lab_kobj, &value_attr.attr);
	if (ret) {
		kobject_put(lab_kobj);
		return ret;
	}

	pr_info("sysfs_demo: created /sys/kernel/kernellab/value\n");
	return 0;
}

static void __exit sysfs_demo_exit(void)
{
	kobject_put(lab_kobj);
	pr_info("sysfs_demo: removed /sys/kernel/kernellab\n");
}

module_init(sysfs_demo_init);
module_exit(sysfs_demo_exit);
