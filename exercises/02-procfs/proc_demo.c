#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/proc_fs.h>
#include <linux/seq_file.h>
#include <linux/jiffies.h>
#include <linux/atomic.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Kernel Lab");
MODULE_DESCRIPTION("procfs example: /proc/kernellab");

#define PROC_NAME "kernellab"

static atomic_t read_count = ATOMIC_INIT(0);

/* Called every time user space reads /proc/kernellab. */
static int kernellab_show(struct seq_file *m, void *v)
{
	seq_puts(m, "Hello from /proc/kernellab\n");
	seq_printf(m, "jiffies:    %lu\n", jiffies);
	seq_printf(m, "HZ:         %d\n", HZ);
	seq_printf(m, "read_count: %d\n", atomic_inc_return(&read_count));
	return 0;
}

static int __init proc_demo_init(void)
{
	if (!proc_create_single(PROC_NAME, 0444, NULL, kernellab_show))
		return -ENOMEM;

	pr_info("proc_demo: created /proc/%s\n", PROC_NAME);
	return 0;
}

static void __exit proc_demo_exit(void)
{
	remove_proc_entry(PROC_NAME, NULL);
	pr_info("proc_demo: removed /proc/%s\n", PROC_NAME);
}

module_init(proc_demo_init);
module_exit(proc_demo_exit);
