#!/bin/sh

# test machines
TEST="127.0.0.1
192.168.1.139"
#192.168.1.210"

for IP in $TEST
do
	echo "auto-install to $IP"
	wget --post-file=dist/fathom.xpi http://$IP:8889/
done

# cmon download
scp dist/fathom.xpi apietila@cmon.lip6.fr:~/public_html/
scp dist/fathom_version apietila@cmon.lip6.fr:~/public_html/

# local website
cp dist/fathom.xpi /home/apietila/mlabfathom/libhomenet/test/
