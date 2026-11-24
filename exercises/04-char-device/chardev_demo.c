#include <linux/init.h>
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/device.h>
#include <linux/mutex.h>
#include <linux/uaccess.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("Kernel Lab");
MODULE_DESCRIPTION("Character device example: /dev/kernellab");

#define DEV_NAME "kernellab"
#define BUF_SIZE 256

static dev_t devno;
static struct cdev lab_cdev;
static struct class *lab_class;

static char buffer[BUF_SIZE];
static size_t data_len;
static DEFINE_MUTEX(lab_lock);

static int lab_open(struct inode *inode, struct file *file)
{
	pr_info("chardev_demo: open\n");
	return 0;
}

static int lab_release(struct inode *inode, struct file *file)
{
	pr_info("chardev_demo: release\n");
	return 0;
}

/* cat /dev/kernellab : return what was written last */
static ssize_t lab_read(struct file *file, char __user *ubuf, size_t count,
			loff_t *ppos)
{
	ssize_t ret;

	mutex_lock(&lab_lock);
	ret = simple_read_from_buffer(ubuf, count, ppos, buffer, data_len);
	mutex_unlock(&lab_lock);
	return ret;
}

/* echo hi > /dev/kernellab : replace the stored message */
static ssize_t lab_write(struct file *file, const char __user *ubuf,
			 size_t count, loff_t *ppos)
{
	size_t len = min_t(size_t, count, BUF_SIZE);

	mutex_lock(&lab_lock);
	if (copy_from_user(buffer, ubuf, len)) {
		mutex_unlock(&lab_lock);
		return -EFAULT;
	}
	data_len = len;
	mutex_unlock(&lab_lock);

	pr_info("chardev_demo: stored %zu bytes\n", len);
	return count;
}

static const struct file_operations lab_fops = {
	.owner   = THIS_MODULE,
	.open    = lab_open,
	.release = lab_release,
	.read    = lab_read,
	.write   = lab_write,
};

static int __init chardev_demo_init(void)
{
	struct device *dev;
	int ret;

	ret = alloc_chrdev_region(&devno, 0, 1, DEV_NAME);
	if (ret)
		return ret;

	cdev_init(&lab_cdev, &lab_fops);
	ret = cdev_add(&lab_cdev, devno, 1);
	if (ret)
		goto err_region;

	lab_class = class_create(DEV_NAME);
	if (IS_ERR(lab_class)) {
		ret = PTR_ERR(lab_class);
		goto err_cdev;
	}

	/* devtmpfs creates /dev/kernellab automatically */
	dev = device_create(lab_class, NULL, devno, NULL, DEV_NAME);
	if (IS_ERR(dev)) {
		ret = PTR_ERR(dev);
		goto err_class;
	}

	pr_info("chardev_demo: registered /dev/%s (major %d, minor %d)\n",
		DEV_NAME, MAJOR(devno), MINOR(devno));
	return 0;

err_class:
	class_destroy(lab_class);
err_cdev:
	cdev_del(&lab_cdev);
err_region:
	unregister_chrdev_region(devno, 1);
	return ret;
}

static void __exit chardev_demo_exit(void)
{
	device_destroy(lab_class, devno);
	class_destroy(lab_class);
	cdev_del(&lab_cdev);
	unregister_chrdev_region(devno, 1);
	pr_info("chardev_demo: unregistered /dev/%s\n", DEV_NAME);
}

module_init(chardev_demo_init);
module_exit(chardev_demo_exit);
