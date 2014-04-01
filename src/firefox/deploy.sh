#!/bin/sh

# local website
cp dist/fathom.xpi ../../../libhomenet/test/

# test machines: loca, mac, android, win PC (does not work?)
TEST="127.0.0.1 192.168.1.197"
#192.168.1.173
#192.168.1.139"
#192.168.1.194
#192.168.1.210"

for IP in $TEST
do
	echo "auto-install to $IP"
	wget --post-file=dist/fathom.xpi http://$IP:8889/
done

# cmon download
scp dist/fathom.xpi apietila@cmon.lip6.fr:~/public_html/
scp dist/fathom_version apietila@cmon.lip6.fr:~/public_html/
