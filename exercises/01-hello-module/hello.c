#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Kernel Lab");
MODULE_DESCRIPTION("First kernel module");

static int __init hello_init(void)
{
	pr_info("Hello from Linux Kernel!\n");
	return 0;
}

static void __exit hello_exit(void)
{
	pr_info("Goodbye from Linux Kernel!\n");
}

module_init(hello_init);
module_exit(hello_exit);
