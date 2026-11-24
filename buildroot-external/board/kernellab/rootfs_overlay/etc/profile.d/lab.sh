export TERM=xterm
export TZ=Asia/Seoul
# gcc, cc, as, ld ... from the 9p toolchain (downloaded on first use)
[ -x /opt/gcc/bin/gcc ] && export PATH="$PATH:/opt/gcc/bin"
# The serial terminal on the web page is 100x30.
case "$(tty)" in /dev/ttyS*) stty rows 30 cols 100 ;; esac

if [ "$(id -u)" = 0 ]; then
	export HOME=/root
	cd /root
	PS1='kernel-lab:\w# '
	printf '\n  Linux Kernel Lab -- modules: /root/*.ko  sources: /root/src\n\n'
else
	dir=$(sed -n 's/.*lab\.dir=\([^ ]*\).*/\1/p' /proc/cmdline)
	[ -n "$dir" ] && cd "$HOME/$dir"
	PS1='student@lab:\w\$ '
	printf '\n  System Programming Lab -- %s\n\n' "$(pwd)"
fi
export PS1
