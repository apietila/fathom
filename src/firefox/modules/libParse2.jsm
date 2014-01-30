/**
 * Command line tools parser.
 *
 */
var EXPORTED_SYMBOLS = ["libParse2"];

Components.utils.import("resource://fathom/Logger.jsm");

// supported operating systems
const winnt = "winnt";
const android = "android";
const linux = "linux";
const darwin = "darwin";

//------ Parsers ---------//

/* Traceroute output. */
function parseTraceroute(config, output) {
    var traceroute = {
	target: config.params[0],
	hop: [],
	__exposedProps__: {
	    target: "r",
	    hop: "r"
	}
    };

    function Hop() {};
    Hop.prototype = {
	id: null,
	host: null,
	ip: null,
	rtt: null,
	missed : null,
	__exposedProps__: {
	    id: "r",
	    host: "r",
	    ip: "r",
	    rtt: "r",
	    missed : "r",
	}
    };
    var lines = output.split("\n");

    switch (config.os.toLowerCase()) {
    case linux:
    case android:
	for (var i = 1; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g,' ').replace(/\sms/g,'');
	    if (str.trim() == "") 
		continue;

	    var ent = str.trim().split(' ');

	    var h = new Hop();
	    h.id = ent[0];
	    h.host = ent[1];
	    h.ip = ent[2] ? ent[2].replace(/\(|\)/gi, '') : ent[2];
	   
	    h.missed = 0;
	    h.rtt = [];
	    for (var k = 3; k < ent.length; k++) {
		if (ent[k] === '*') {
		    h.missed = h.missed + 1;
		} else {
		    h.rtt.push(parseFloat(ent[k]));
		}
	    }
	    
	    traceroute.hop.push(h);
	}
	break;
    case darwin:
        var prevhop = undefined;
	for (var i = 0; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g,' ').replace(/\sms/g,'');
	    str = str.trim();
	    if (str == "" || str.indexOf('traceroute')>=0) 
		continue;

	    var ent = str.split(' ');
	    var dre = new RegExp(/^\d{1,2} /); // <id> <host> ..
	    if (dre.test(str)) {
		if (prevhop) {
		    if (prevhop.id>traceroute.hop.length+1)
			break; // things are going wrong - looks like this traceroute failed
		    traceroute.hop.push(prevhop);
		}
		prevhop = undefined;
		    
		// new hop id
		var h = new Hop();
		h.id = parseInt(ent[0]);

		if (ent[1] == '*') {
		    h.host = '*';
		    h.ip = '*';
		    h.missed = 0;
		    h.rtt = [];
		    for (var k = 1; k < ent.length; k++) {
			if (ent[k] === '*') {
			    h.missed = h.missed + 1;
			} else {
			    h.rtt.push(parseFloat(ent[k]));
			}
		    }

		} else {		
		    // TODO: should really be a lists due to varying routes ...
		    h.host = ent[1];
		    h.ip = ent[2] ? ent[2].replace(/\(|\)/gi, '') : ent[2];
		    h.missed = 0;
		    h.rtt = [];
		    
		    for (var k = 3; k < ent.length; k++) {
			if (ent[k] === '*') {
			    h.missed = h.missed + 1;
			} else {
			    h.rtt.push(parseFloat(ent[k]));
			}
		    }
		}
	    
		prevhop = h;

	    } else if (prevhop) {
		// more results on previous hop due varying routes
		// TODO: will have different hop ip .. 
		for (var k = 2; k < ent.length; k++) {
		    if (ent[k] === '*') {
			prevhop.missed = h.missed + 1;
		    } else {
			prevhop.rtt.push(parseFloat(ent[k]));
		    }
		}
	    }
	}
	if (prevhop && prevhop.id==traceroute.hop.length+1)
	    traceroute.hop.push(prevhop);
	break;
    case winnt:
	for (var i = 3; i < lines.length - 2; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ').replace(/\sms/g, '');
	    if (str.trim() == "") {
		continue;
	    }

	    var ent = str.trim().split(' ');

	    var h = new Hop();
	    h.id = ent[0];

	    if(ent.length == 6) {
		h.host = ent[4];
		h.ip = ent[5].replace(/\[|\]/gi, '');
	    } else if(ent.length == 5) {
		h.ip = ent[4];
	    }

	    if (h.ip) {
		h.missed = 0;
		h.rtt = [];
		for (var k = 1; k <= 3; k++) {
		    if (ent[k] === '*') {
			h.missed = h.missed + 1;
		    } else {
			h.rtt.push(parseFloat(ent[k].replace(/</g,'')));
		    }
		}
	    }

	    traceroute.hop.push(h);

	}
	break;
    default:
	traceroute = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return traceroute;
};

/* Ping output. */
function parsePing(config, output) {
    var ping = 	{
	domain: null,
	ip: null,
	pings : [],
	stats: {
	    packets: {
		sent: null,
		received: null,
		lost: null,
		lossrate : 100,
		succrate : 0,
		__exposedProps__: {
		    sent: "r",
		    received: "r",
		    lost: "r",
		    lossrate : "r",
		    succrate : "r"
		}
	    },
	    rtt: {
		min: null,
		max: null,
		avg: null,
		mdev: null,
		__exposedProps__: {
		    min: "r",
		    max: "r",
		    avg: "r",
		    mdev: "r"
		}
	    },
	    __exposedProps__: {
		packets: "r",
		rtt: "r"
	    }
	},
	__exposedProps__: {
	    domain: "r",
	    ip: "r",
	    stats: "r",
	    pings: "r"
	}
    };

    function Ping() {}
    Ping.prototype = {
	bytes: null,
	domain: null,
	ip: null,
	icmp_req: null,
	ttl: null,
	time: null,
	__exposedProps__: {
	    bytes: "r",
	    domain: "r",
	    ip: "r",
	    icmp_req: "r",
	    ttl: "r",
	    time: "r",
	}
    };

    var lines = output.trim().split("\n");

    switch (config.os.toLowerCase()) {
    case linux:
    case android:
    case darwin:
	for (var i = 0; i < lines.length; i++) {
	    if (lines[i].length < 2)
		continue
	    
	    var line = lines[i].trim().replace(/\s{2,}/g, ' ');
	    if (i == 0) {
		var s = line.split(' ');
		ping.domain = s[1];
		ping.ip = s[2].replace(/\(|\)|:/gi, '');
		
	    } else if (line.indexOf("bytes from")>0) {
		var s = line.split(' ');

		var p = new Ping();
		p.bytes = parseInt(s[0]);

		if (s[3].indexOf(':')>=0) {
		    // 64 bytes from 192.168.1.1: icmp_req=1 ttl=64 time=0.291 ms
		    p.ip = s[3].replace(/\(|\)|:/gi, '');
		    p.domain = p.ip;
		    [4,5,6].map(function(j) {
			if (s[j].indexOf('=')>0) {
			    var tmp = s[j].trim().split('=');
			    p[tmp[0]] = parseFloat(tmp[1]);
			}
		    });
		} else {
		    // 64 bytes from wi-in-f99.1e100.net (173.194.67.99): icmp_req=3 ttl=46 time=6.83 ms
		    p.domain = s[3];
		    p.ip = s[4].replace(/\(|\)|:/gi, '');

		    [5,6,7].map(function(j) {
			if (s[j].indexOf('=')>0) {
			    var tmp = s[j].trim().split('=');
			    p[tmp[0]] = parseFloat(tmp[1]);
			}
		    });
		}

		ping.pings.push(p);
		
	    } else if (line.indexOf("packet")>0) {
		var s = line.split(',');
		var sent = s[0].trim().split(' ')[0];
		var received = s[1].trim().split(' ')[0];
		ping.stats.packets.sent = parseInt(sent);
		ping.stats.packets.received = parseInt(received);
		ping.stats.packets.lost = ping.stats.packets.sent - ping.stats.packets.received;
		ping.stats.packets.lossrate = 100.0;
		ping.stats.packets.succrate = 0.0;
		if (sent>0) {
		    ping.stats.packets.lossrate = ping.stats.packets.lost*100.0/ping.stats.packets.sent;
		    ping.stats.packets.succrate = ping.stats.packets.received*100.0/ping.stats.packets.sent;
		}

	    } else if (line.indexOf("avg")>0) {
 		var s = line.split('=')[1].split('/');
		var min = s[0].replace(/ms/, "");
		var avg = s[1].replace(/ms/, "");
		var max = s[2].replace(/ms/, "");
		var mdev = s[3].replace(/ms/, "");
		
		ping.stats.rtt.min = parseFloat(min);
		ping.stats.rtt.max = parseFloat(max);
		ping.stats.rtt.avg = parseFloat(avg);
		ping.stats.rtt.mdev = parseFloat(mdev);
	    }
	}
	break;

    case winnt:
	if (lines.length > 1) {
	    for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trim().replace(/\s{2,}/g, ' ');
		if (i == 0) {
		    var s = line.split(' ');
		    ping.domain = s[1];
		    ping.ip = s[1];
		    if (s[2].indexOf('[')>=0) {
			ping.ip = s[2].replace(/[\[\]]/gi, '');
			if (ping.ip == "::1")
			    ping.ip = "127.0.0.1"
		    }

		} else if (line.indexOf("Reply from")>=0) {
		    var s = line.split(' ');

		    var p = new Ping();
		    if (s[2] === "::1:") {
			p.ip = '127.0.0.1'
			p.domain = 'localhost'
		    } else {
			p.ip = s[2].replace(/[\[\]:]/gi, '');
			p.domain = p.ip;
		    }

		    for (var j = 3; j<s.length; j++) {
			if (s[j].indexOf('=')>0) {
			    var tmp = s[j].trim().split('=');
			    p[tmp[0].toLowerCase()] = parseFloat(tmp[1].replace(/ms/,''));
			} else if (s[j].indexOf('<')>=0) {
			    var tmp = s[j].trim().split('<');
			    p[tmp[0].toLowerCase()] = parseFloat(tmp[1].replace(/ms/,''));
			}
		    };

		    ping.pings.push(p);

		} else if (line.indexOf("Packets: Sent =")>=0) {
		    var s = line.split(',');

		    var sent = s[0].trim().split(' ')[3];
		    var received = s[1].trim().split(' ')[2];
		    var lost = s[2].trim().split('%')[0].split("(")[1];
		    ping.stats.packets.sent = parseInt(sent);
		    ping.stats.packets.received = parseInt(received);
		    ping.stats.packets.lost = ping.stats.packets.sent - ping.stats.packets.received;
		    ping.stats.packets.lossrate = 100.0;
		    ping.stats.packets.succrate = 0.0;
		    if (sent>0) {
			ping.stats.packets.lossrate = ping.stats.packets.lost*100.0/ping.stats.packets.sent;
			ping.stats.packets.succrate = ping.stats.packets.received*100.0/ping.stats.packets.sent;
		    }
		} else if (line.indexOf("Minimum =")>=0) {
		    var s = line.split(',');

		    var min = s[0].split('=')[1].split('ms')[0].trim();
		    var max = s[1].split('=')[1].split('ms')[0].trim();
		    var avg = s[2].split('=')[1].split('ms')[0].trim();
		    var mdev = 0;

		    ping.stats.rtt.min = parseFloat(min);
		    ping.stats.rtt.max = parseFloat(max);
		    ping.stats.rtt.avg = parseFloat(avg);
		    ping.stats.rtt.mdev = parseFloat(mdev);
		}
	    }
	} else {
	    ping = {
		error: lines[0],
		__exposedProps__: {
		    error: "r",
		}
	    };
	}
	break;
    default:
	ping = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return ping;
};

/* /etc/resolv.conf or getprop net.dnsX */
function parseNameServer(config, output) {
    var nameserver = {
	domain: null,
	list: [],
	__exposedProps__: {
	    domain: "r",
	    list: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case android:
	// cmd: getprop net.dnsX
	var s = output.trim();
	if (s.length>0)
	    nameserver.list.push(s);
	break;
    case linux:
    case darwin:
	// cmd: cat /etc/resolf.con
	var lines = output.trim().split("\n");
	for (var i = 0; i < lines.length; i++) {
	    var line = lines[i].trim().replace(/\s{2,}/g, ' ');
	    if (line[0] == "#" || line == "") 
		continue;

	    var s = line.split(' ');
	    if (s[0] == "domain") 
		nameserver.domain = s[1];
	    else if (s[0] == "nameserver") 
		nameserver.list.push(s[1]);
	}
	break;
    case winnt:
	var blocks = output.trim().split("\n\n");
	for (var i = 0; i < blocks.length; i++) {
	    var lines = blocks[i].split("\n");
	    var flag = false;
	    for (var j = 0; j < lines.length; j++) {
		var y = new RegExp("IPv4 Address.*:\\s+(.+)\\s+", "ig");
		var w = y.exec(lines[j]);
		if (w) {
		    flag = true;
		}
		if (flag) {
		    var z = new RegExp("DNS Servers.*:\\s+(.*)\\s+", "ig");
		    var kw = z.exec(lines[j]);
		    if (kw) {
			nameserver.list.push(kw[1]);
			while(lines[j+1] && lines[j+1].trim().indexOf(":") == -1) {
			    nameserver.list.push(lines[j+1].trim());
			    j=j+1;
			}
			flag = false;
		    }
		}
	    }
	}
	break;
    default:
	nameserver = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return nameserver;
};

/* route/netstat */
function parseRoutingTable(config,output) {
    var routingTable = {
	entry: {
	    destination: null,
	    gateway: null,
	    mask: null,
	    interface: null,
	    __exposedProps__: {
		destination: "r",
		gateway: "r",
		mask: "r",
		interface: "r"
	    }
	},
	defaultEntry: [],
	__exposedProps__: {
	    entry: "r",
	    defaultEntry: "r"
	}
    };

    var dest = routingTable.entry.destination = new Array();
    var gate = routingTable.entry.gateway = new Array();
    var mask = routingTable.entry.mask = new Array();
    var intf = routingTable.entry.interface = new Array();

    // list of E
    routingTable.defaultEntry = new Array();
    function E() {};
    E.prototype = {
	gateway: null,
	"interface": null,
	version: null,
	__exposedProps__: {
	    gateway: "r",
	    'interface': "r",
	    version: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case android:	
	var lines = output.trim().split('\n');
	function ip4(val) {
	    var addr = [];
	    var tmp = (val & 0xFF);
	    if (tmp < 0) tmp = tmp & 0xFF + 1;
	    var t = addr.push(tmp);
	    tmp = (val & 0xFF00) >> 8;
	    if (tmp < 0) tmp = tmp & 0xFFFF + 1;
	    t = addr.push(tmp);
	    tmp = (val & 0xFF0000) >> 16;
	    if (tmp < 0) tmp = tmp & 0xFFFFFF + 1;
	    t = addr.push(tmp);
	    tmp = (val & 0xFF000000) >> 24;
	    if (tmp < 0) tmp = tmp & 0xFFFFFFFF + 1;
	    t = addr.push(tmp);
	    return addr.join(".");
	}
	for (var i = 1; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ');
	    var ent = str.trim().split('\t');
	    dest.push(ip4(parseInt(ent[1], 16)));
	    gate.push(ip4(parseInt(ent[2], 16)));
	    mask.push(ip4(parseInt(ent[7], 16)));
	    intf.push(ent[0]);
	    if (ip4(parseInt(ent[1], 16)) == "0.0.0.0") {
		// optionally check for flags -- like UG
		var e = new E();
		e.gateway = ip4(parseInt(ent[2], 16));
		e['interface'] = ent[0];
		e.version = 'ipv4';
		routingTable.defaultEntry.push(e);
	    }
	}
	break;
    case linux:
	var lines = output.trim().split('\n');
	for (var i = 2; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ');
	    var ent = str.trim().split(' ');
	    dest.push(ent[0]);
	    gate.push(ent[1]);
	    mask.push(ent[2]);
	    intf.push(ent[7]);
	    if (ent[0] == "0.0.0.0") {
		// optionally check for flags -- like UG
		var e = new E();
		e.gateway = ent[1];
		e['interface'] = ent[7];
		e.version = 'ipv4';
		routingTable.defaultEntry.push(e);
	    }
	}
	// TODO : fix for IPv6
	break;
    case darwin:
	var parts = output.trim().split("Internet");
	var ipv4 = parts[1].split("Expire")[1];
	var ipv6 = parts[2].split("Expire")[1];
	// push ipv4 entries into the table
	var lines = ipv4.trim().split('\n');
	for (var i = 0; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ');
	    var ent = str.trim().split(' ');
	    dest.push(ent[0]);
	    gate.push(ent[1]);
	    mask.push(null);
	    intf.push(ent[5]);
	    if (ent[0] == "default") {
		// optionally check for flags -- like UG
		var e = new E();
		e.gateway = ent[1];
		e['interface'] = ent[5];
		e.version = 'ipv4';
		routingTable.defaultEntry.push(e);
	    }
	}
	// TODO : fix for IPv6
	break;
    case winnt:
	var lines = output.trim().split("Active Routes:")[1].split("Persistent Routes:")[0].trim().split('\n');
	for (var i = 1; i < lines.length - 1; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ');
	    var ent = str.trim().split(' ');
	    dest.push(ent[0]);
	    gate.push(ent[2]);
	    mask.push(ent[1]);
	    intf.push(ent[3]);
	    if (ent[0] == "0.0.0.0") {
		// optionally check for flags -- like metric
		var e = new E();
		e.gateway = ent[2];
		e['interface'] = ent[3];
		e.version = 'ipv4';
		routingTable.defaultEntry.push(e);
	    }
	}
	break;
    default:
	routingTable = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return routingTable;
}

/* ifconfig/ipconfig */
function parseInterface(config,output) {
    function Iface() {};
    Iface.prototype = {
	name: null,
	address: null,
	mtu: null,
	mac: null,
	tx: null,
	rx: null,
	__exposedProps__: {
	    name: "r",
	    address: "r",
	    mtu: "r",
	    mac: "r",
	    tx: "r",
	    rx: "r"
	}
    };

    // output is a list of Ifaces
    var interfaces = new Array();
    var res = {
	interfaces: interfaces,
	__exposedProps__: {
	    interfaces: "r"
	}
    };

    function cidrToNetmask(bits) {
	var netmask = "";
	for (var i = 0; i < 4; i++) {
	    if (i) netmask += ".";
	    if (bits >= 8) {
		netmask += Math.pow(2, 8) - 1;
		bits -= 8;
	    } else {
		netmask += 256 - Math.pow(2, (8 - bits));
		bits = 0;
	    }
	}
	return netmask;
    }

    switch (config.os.toLowerCase()) {
    case android:
	var inter = output.trim().replace(/\s{2,}/g, ' ').split("\n");
	var cache = {};
	for (var i = 0; i < inter.length; i++) {
	    var w = inter[i].split(" ");
	    if (w[1].trim() == "UP") {
		// netcfg output format: wlan0 UP 192.168.1.139/24 0x00001043 08:60:6e:9f:db:0d
		var intf = new Iface();
		intf.name = w[0].trim();
		intf.address = {
		    ipv4: null,
		    ipv6: null,
		    broadcast: null,
		    mask: null,
		    __exposedProps__: {
			ipv4: "r",
			ipv6: "r",
			broadcast: "r",
			mask: "r"
		    }
		};
		if (w[2].indexOf('/')>=0) {
  		    var temp_ip = w[2].trim().split("/");
		    intf.address.ipv4 = temp_ip[0].trim();
		    intf.address.mask = cidrToNetmask(parseInt(temp_ip[1].trim()));
		} else {
  		    intf.address.ipv4 = w[2].trim();
  		    intf.address.mask = w[3].trim();
                }

		interfaces.push(intf);
		
	    } else {
		// ip link output format
		var name = w[1].trim().replace(':','');
		var intf = cache[name] || new Iface();
		if (!intf.name)
		    intf.name = name;		
		if (!intf.address)
		    intf.address = {
			ipv4: null,
			ipv6: null,
			broadcast: null,
			mask: null,
			__exposedProps__: {
			    ipv4: "r",
			    ipv6: "r",
			    broadcast: "r",
			    mask: "r"
			}
		    };

		var k = 1; 
		while (k < w.length) {
		    if (w[k] === 'mtu') {
			intf.mtu = parseInt(w[k+1]);
			
		    } else if (w[k].indexOf('link')>0) {
			intf.mac = w[k+1];
			
		    } else if (w[k] === 'inet') {
			var temp_ip = w[k+1].trim().split("/");
			intf.address.ipv4 = temp_ip[0].trim();
			intf.address.mask = cidrToNetmask(parseInt(temp_ip[1].trim()));
			
		    } else if (w[k] === 'inet6') {
			var temp_ip = w[k+1].trim().split("/");
			intf.address.ipv6 = temp_ip[0].trim();
			
		    } else if (w[k].indexOf('brd')>0) {
			intf.broadcast = w[k+1];
		    }					
		    k += 1
		}
		if (!cache[name])
		    cache[name] = intf;					
	    }
	}
	
	// all done, push to the results (only for ip tool results)
	for (var k in cache) {
	    if (cache.hasOwnProperty(k) && cache[k].address.ipv4!==null && 
		(cache[k].address.ipv4!=='127.0.0.1' || cache[k].address.ipv4!=='0.0.0.0'))
		interfaces.push(cache[k]);
	}
	break;
	
    case linux:
	var inter = output.trim().split("\n\n");
	for (var i = 0; i < inter.length; i++) {
	    var str = inter[i].trim().replace(/\s{2,}/g, ' ');
	    if (!str)
		continue

	    var x = new RegExp("(.+)\\s+Link.+HWaddr\\s(.+)\\sinet addr:(.+)\\sBcast:(.+)\\sMask:(.+)\\sinet6 addr:\\s(.+)\\sScope.+\\sMTU:(\\d+)\\sMetric.+\\sRX bytes:(\\d+)\\s.+\\sTX bytes:(\\d+)\\s.+");
	    var w = x.exec(str);

	    if (w) {
		var intf = new Iface();
		intf.name = w[1].trim();
		intf.mac = w[2].trim();
		intf.address = {
		    ipv4: w[3].trim(),
		    ipv6: w[6].trim(),
		    broadcast: w[4].trim(),
		    mask: w[5].trim(),
		    __exposedProps__: {
			ipv4: "r",
			ipv6: "r",
			broadcast: "r",
			mask: "r"
		    }
		};
		intf.mtu = parseInt(w[7].trim());
		intf.tx = parseInt(w[9].trim());
		intf.rx = parseInt(w[8].trim());

		interfaces.push(intf);

	    } else {
		var regexp = {
		    'name': new RegExp("(\\w+):\\s+", "ig"),
		    'ipv4': new RegExp("inet ([\\d\\.]+)\\s", "ig"),
		    'broadcast': new RegExp("broadcast ([\\d\\.]+)\\s", "ig"),
		    'mask': new RegExp("netmask ([\\d\\.]+)\\s", "ig"),
		    'ipv6': new RegExp("inet6 ([\\d\\w:]+)\\s", "ig"),
		    'mtu': new RegExp("mtu (\\d+)", "ig"),
		    'mac': new RegExp("ether ([\\d\\w:]+)\\s", "ig"),
		    'tx': new RegExp("TX .+ bytes (\\d+)"),
		    'rx': new RegExp("RX .+ bytes (\\d+)"),
		}

		var intf = new Iface();
		intf.address = {
		    ipv4: null,
		    ipv6: null,
		    broadcast: null,
		    mask: null,
		    __exposedProps__: {
			ipv4: "r",
			ipv6: "r",
			broadcast: "r",
			mask: "r"
		    }
		};

		for (var j in regexp) {
		    var ww = regexp[j].exec(str);
		    if (ww && ww[1]) {
			switch (j) {
			case 'ipv4':
			case 'broadcast':
			case 'mask':
			case 'ipv6':
			    intf.address[j] = ww[1];
			    break;
			case 'name':
			case 'mac':
			    intf[j] = ww[1];
			    break;
			case 'mtu':
			case 'tx':
			case 'rx':
			    intf[j] = parseInt(ww[1]);
			    break;
			default:
			    break;
			}
		    }
		}
		if (intf.mac) 
		    interfaces.push(intf);
	    }
	}
	break;
    case darwin:
	var lines = output.trim().split("\n");
	var inter = "";
	var x = new RegExp(".+flags.+mtu.+");

  	var addIface = function(text) {
	    text = text.replace(/\s+/g, ' ');
	    var reg1 = new RegExp("(.+):.+\\smtu\\s([0-9]+).+\\sether\\s(.+)\\sinet6\\s(.+)\\sprefixlen.+\\sinet\\s(.+)\\snetmask\\s(.+)\\sbroadcast\\s([0-9\.]+)");
	    var reg2 = new RegExp("(.+):.+\\smtu\\s([0-9]+).+\\sether\\s(.+)\\sinet\\s(.+)\\snetmask\\s(.+)\\sbroadcast\\s([0-9\.]+)");

	    var intf = new Iface();	    
	    var w = reg1.exec(text);
	    if (w) {
		intf.name = w[1];
		intf.mtu = parseInt(w[2]);
		intf.mac = w[3];
		intf.address = {
		    ipv4: w[5],
		    ipv6: w[4].split('%')[0],
		    broadcast: w[7],
		    mask: w[6],
		    __exposedProps__: {
			ipv4: "r",
			ipv6: "r",
			broadcast: "r",
			mask: "r"
		    }
		};
		interfaces.push(intf);

	    } else {
		w = reg2.exec(text);
		if (w) {
		    intf.name = w[1];
		    intf.mtu = parseInt(w[2]);
		    intf.mac = w[3];
		    intf.address = {
			ipv4: w[4],
			ipv6: null,
			broadcast: w[6],
			mask: w[5],
			__exposedProps__: {
			    ipv4: "r",
			    ipv6: "r",
			    broadcast: "r",
			    mask: "r"
			}
		    };		    
		    interfaces.push(intf);
		}
	    }
	}

	for (var i = 0; i < lines.length; i++) {
	    if (x.test(lines[i].trim())) {
		// next iface starts, add prev
		if (inter != "") 
		    addIface(inter);

		inter = lines[i];
	    } else {
		inter += lines[i];
		// last on the list
		if (i == lines.length - 1) 
		    addIface(inter); 
 	    }
	}
	break;
    case winnt:
	var text = output.trim().split(":\r\n\r\n");
	for(var i = 1; i < text.length; i++) {
	    var intf = new Iface();

	    var tmp = text[i-1].trim().split("\n");
	    intf.name = tmp[tmp.length - 1];

	    intf.address = {
		ipv4: null,
		ipv6: null,
		broadcast: null,
		mask: null,
		__exposedProps__: {
		    ipv4: "r",
		    ipv6: "r",
		    broadcast: "r",
		    mask: "r"
		}
	    };
	    
	    if (intf.name.indexOf("adapter") >= 0) {
		var regexp = {
		    'ipv4': new RegExp("IPv4 Address.*:\\s+(.+)", "ig"),
		    'mask': new RegExp("Subnet Mask.*:\\s+(.+)", "ig"),
		    'ipv6': new RegExp("IPv6 Address.*:\\s+(.+)", "ig"),
		    'mac': new RegExp("Physical Address.*:\\s+(.+)", "ig"),
		}
		
		for (var j in regexp) {
		    var ww = regexp[j].exec(text[i]);
		    if (ww && ww[1]) {
			switch (j) {
			case 'ipv4':
			case 'ipv6':
			    intf.address[j] = ww[1].trim().split("(")[0];
			    break;
			case 'mask':
			    intf.address[j] = ww[1];
			    break;
			case 'mac':
			    intf[j] = ww[1].toLowerCase().replace(/-/g,':');
			    break;
			default:
			    break;
			}
		    }
		}
	    }
	    if (intf.mac && intf.address.ipv4)
		interfaces.push(intf);
	}
	break;
    default:
	res = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return res;
};

function parseMem(config, output) {
    var memory = {
	used: null,
	free: null,
	__exposedProps__: {
	    used: "r",
	    free: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case android:
    case linux:
	var text = output.trim().split("\n\n");
	var y = new RegExp("MemTotal:(.+)kB\\s+MemFree:(.+)kB\\s+Buffers");
	var w = y.exec(text[0].trim());
	if (w) {
	    memory.used = parseInt(w[1].trim()) - parseInt(w[2].trim());
	    memory.free = parseInt(w[2].trim());
	}
	break;
    default:
	memory = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return memory;
};

/* top */
function parseTop(config, output) {
    var sys = { 
	tasks : {
	    total: null,
	    running: null,
	    sleeping: null,
	    __exposedProps__: {
		total: "r",
		running: "r",
		sleeping: "r"
	    }
	},
	loadavg : {
	    onemin : null,
	    fivemin : null,
	    fifteenmin : null,
	    __exposedProps__: {
		onemin : "r",
		fivemin : "r",
		fifteenmin : "r",
	    }
	},
	cpu : {
	    user: null,
	    system: null,
	    idle : null,
	    __exposedProps__: {
		user: "r",
		system: "r",
		idle: "r"
	    }
	},
	memory : {
	    total : null,
	    used: null,
	    free: null,
	    __exposedProps__: {
		total: "r",
		used: "r",
		free: "r"
	    }
	},
	__exposedProps__ : {
	    tasks: "r",
	    loadavg: "r",
	    cpu: "r",
	    memory: "r",
	}
    };


    var lines = output.trim().replace(/\s{2,}/g, ' ').split("\n");

    switch (config.os.toLowerCase()) {
    case android:
	for (var i = 0; i < lines.length; i++) {
	    var row = lines[i].trim().split(' ');
	    if (row[2] === 'System') {
		// User 0%, System 0%, IOW 0%, IRQ 0%
		sys.cpu.user = parseFloat(row[1].replace('%,',''));
		sys.cpu.system = parseFloat(row[3].replace('%,',''));
		sys.cpu.idle = 100.0 - (sys.cpu.user + sys.cpu.system);
	    } else if (row[3] === 'Nice') {
		// User 8 + Nice 1 + Sys 23 + Idle 270 + IOW 1 + IRQ 0 + SIRQ 0 = 303
		sys.tasks.total = parseInt(row[21]);
		sys.tasks.sleeping = parseInt(row[10]);
		sys.tasks.running = sys.tasks.total - sys.tasks.sleeping;
	    }
	}
	break;

    case linux:
	for (var i = 0; i < lines.length; i++) {
	    var row = lines[i].trim().split(' ');
	    switch(row[0]) {
	    case "top":
		for (var j = 1; j<row.length; j++) {
		    if (row[j] == "average:") {
			sys.loadavg.onemin = parseFloat(row[j+1].replace(',',''));
			sys.loadavg.fivemin = parseFloat(row[j+2].replace(',',''));
			sys.loadavg.fifteenmin = parseFloat(row[j+3].replace(',',''));
			break;
		    }
		}
	    case "Tasks:":
		sys.tasks.total = parseInt(row[1]);
		sys.tasks.running = parseInt(row[3]);
		sys.tasks.sleeping = parseInt(row[5]);
		break;
	    case "%Cpu(s):":
		sys.cpu.user = parseFloat(row[1]);
		sys.cpu.system = parseFloat(row[3]);
		sys.cpu.idle = parseFloat(row[7]);
		break;
	    case "KiB":
		if (row[1] == 'Mem:') {
		    sys.memory.total = parseInt(row[2]);
		    sys.memory.used = parseInt(row[4]);
		    sys.memory.free = parseInt(row[6]);
		}
		break;
	    default:
		break;
	    };
	}
	break;
    case darwin:
	for (var i = 0; i < lines.length; i++) {
	    var row = lines[i].trim().split(' ');
	    switch(row[0]) {
	    case "Processes:":
		sys.tasks.total = parseInt(row[1]);
		sys.tasks.running = parseInt(row[3]);
		sys.tasks.sleeping = parseInt(row[7]);
		break;
	    case "Load":
		sys.loadavg.onemin = parseFloat(row[2].replace(',',''));
		sys.loadavg.fivemin = parseFloat(row[3].replace(',',''));
		sys.loadavg.fifteenmin = parseFloat(row[4].replace(',',''));
		sys.cpu.user = parseFloat(row[7].replace('%',''));
		sys.cpu.system = parseFloat(row[9].replace('%',''));
		sys.cpu.idle = parseFloat(row[11].replace('%',''));
		break;
	    case "PhysMem:":
		sys.memory.used = parseInt(row[1].replace('M',''));
		sys.memory.free = parseInt(row[5].replace('M',''));
		sys.memory.total = (sys.memory.used + sys.memory.free);
		break;
	    default:
		break;
	    };
	}
	break;
    case winnt:
	// TODO:
	var cpux = new RegExp("LoadPercentage\\s+(.+)");
	var memoryx = new RegExp("Total Physical Memory:\\s+(.+) MB\\s+Available Physical Memory:\\s+(.+) MB\\s+Virtual Memory: Max Size");
	var processx = new RegExp("System.+\\s+System");
	
	var cpuw = cpux.exec(output);
	var memoryw = memoryx.exec(output);
	var processw = processx.exec(output);
	
	if (cpuw) {
	    sys.cpu.user = cpuw[1].trim();
	}
	if (memoryw) {
	    sys.memory.used = 1024 * (parseInt(memoryw[1].trim().replace(/,/, '')) - parseInt(memoryw[2].trim().replace(/,/, '')));
	    sys.memory.free = 1024 * memoryw[2].trim();
	}
	if (processw) {
	    sys.tasks.total = output.trim().split("\n").length - 2;
	}
	break;
    default:
	sys = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return sys;
};

/* /proc/net/dev or netstat */
function parseIfaceStats(config,output) {
    if (config.os.toLowerCase() !== winnt && 
	(!config.params || config.params.length!=1)) 
    {
	return {
	    error: 'libParse: missing interface name parameter in ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
    };

    // target interface
    var dIface = (config.os.toLowerCase() !== winnt ? config.params[0] : undefined);

    var tx = {
	bytes: 0,
	packets: 0,
	errs: 0,
	drops: 0,
	__exposedProps__: {
	    bytes: "r",
	    packets: "r",
	    errs: "r",
	    drops: "r"
	}
    };
    var rx = {
	bytes: 0,
	packets: 0,
	errs: 0,
	drops: 0,
	__exposedProps__: {
	    bytes: "r",
	    packets: "r",
	    errs: "r",
	    drops: "r"
	}
    };
    var stats = {
	tx: tx,
	rx: rx,
	iface: dIface,
	__exposedProps__: {
	    tx: "r",
	    rx: "r",
	    iface: "r"
	}
    };
	
    switch (config.os.toLowerCase()) {
    case linux:
    case android:
	var x = new RegExp(dIface.trim() + ":(.+)\\s*");
	var w = x.exec(output);
	if (w) {
	    var elems = w[1].trim().replace(/\s{2,}/g, ' ').split(" ");
	    rx.bytes = parseInt(elems[0].trim());
	    rx.packets = parseInt(elems[1].trim());
	    rx.errs = parseInt(elems[2].trim());
	    rx.drops = parseInt(elems[3].trim());
	    tx.bytes = parseInt(elems[8].trim());
	    tx.packets = parseInt(elems[9].trim());
	    tx.errs = parseInt(elems[10].trim());
	    tx.drops = parseInt(elems[11].trim());
	} else {
	    stats = {
		error: 'libParse: no such interface ' +dIface,
		__exposedProps__: {
		    error: "r",
		}
	    };
	}
	break;
    case darwin:
	var found = false;
	var lines = output.trim().replace(/\s{2,}/g, ' ').split("\n");
	for (var i = 0; i < lines.length; i++) {
	    var row = lines[i].trim().split(' ');
	    if (row[0] === dIface && row[2].indexOf('Link')>=0) {
		rx.packets = parseInt(row[4].trim());
		rx.errs = parseInt(row[5].trim());
		rx.bytes = parseInt(row[6].trim());
		rx.drops = 0;
		tx.packets = parseInt(row[7].trim());
		tx.errs = parseInt(row[8].trim());
		tx.bytes = parseInt(row[9].trim());
		tx.drops = 0;
		found = true;
		break;
	    }
	}
	if (!found) {
	    stats = {
		error: 'libParse: no such interface ' +dIface,
		__exposedProps__: {
		    error: "r",
		}
	    };
	}
	break;
    case winnt:
	var x = new RegExp("Bytes\\s+(.+)\\s+(.+)\\s+Unicast packets\\s+(.+)\\s+(.+)\\s+Non-unicast packets\\s+(.+)\\s+(.+)\\s+Discards\\s+(.+)\\s+(.+)\\s+Errors\\s+(.+)\\s+(.+)\\s+");
	var elems = x.exec(output);
	if (elems) {
	    rx.bytes = parseInt(elems[1].trim());
	    rx.packets = parseInt(elems[3].trim());
	    rx.errs = 0;
	    rx.drops = 0;
	    tx.bytes = parseInt(elems[2].trim());
	    tx.packets = parseInt(elems[4].trim());
	    tx.errs = 0;
	    tx.drops = 0;
	}
	break;
    default:
	stats = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return stats;
};

/* arp -a or ip neigh show */
function parseArpCache(config,output) {
    function Elem() {};
    Elem.prototype = {
	host: null,
	ip: null,
	mac: null,
	interface: null,
	__exposedProps__: {
	    host: "r",
	    ip: "r",
	    mac: "r",
	    interface: "r"
	}
    };

    // Array of Elems
    var arpCache = new Array();
    var res = {
	entries: arpCache,
	__exposedProps__: {
	    entries: "r"
	}
    };

    var lines = output.trim().split('\n');

    switch (config.os.toLowerCase()) {
    case linux:
	if (lines[0].indexOf('Address')>=0 || lines[0].indexOf('no entry')>=0) {
	    // arp hostname
	    if (lines.length >= 2) {
		var x = lines[1].replace(/\s{1,}/g,' ').split(' ');
		var e = new Elem();
		e.host = (x[0].indexOf("\?") >= 0 ? null : x[0]);
		e.mac = (x[2].indexOf('incomplete')>=0 ? null : x[2]);
		e.interface = x[4];
		arpCache.push(e);
	    } // else not found

	} else {
	    // arp -a
	    for(var k = 0; k <lines.length; k++) {
		var i = lines[k];
		var x = i.split(' ');
		var e = new Elem();
		e.host = (x[0].indexOf("\?") >= 0 ? null : x[0]);
		e.ip = x[1].replace(/\(|\)/gi,'');
		e.mac = x[3];
		e.interface = x[6];
		arpCache.push(e);
	    }
	}
	break;
    case darwin:
	for(var k = 0; k <lines.length; k++) {
	    var i = lines[k];
	    var x = i.split(' ');
	    var e = new Elem();
	    e.host = (x[0].indexOf("\?") >= 0 ? null : x[0]);
	    e.ip = x[1].replace(/\(|\)/gi,'');
	    e.mac = (x[3].indexOf('incomplete')>=0 ? null : x[3]);
	    e.interface = x[5];
	    arpCache.push(e);
	}
	break;
    case android:
	for(var k = 0; k <lines.length; k++) {
	    var i = lines[k];
	    var x = i.split(' ');
	    var e = new Elem();
	    e.host = undefined;
	    e.ip = x[0];
	    e.mac = x[4];
	    e.interface = x[2];
	    arpCache.push(e);
	}
	break;
    case winnt:
	for(var k = 2; k <lines.length; k++) {
	    var i = lines[k].trim().replace(/\s{2,}/g,' ');
	    var x = i.split(' ');
	    var e = new Elem();
	    e.ip = x[0];
	    e.mac = x[1].replace(/-/g,':').toLowerCase();
	    arpCache.push(e);
	}
	break;
    default:
	res = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return res;
};


// Map 802.11 channels to frequencies  (availability depends on country)
var channel2freq = {
    // 2.4GHz
    1 :	2412,
    2 :	2417,
    3 :	2422,
    4 :	2427,
    5 :	2432,
    6 :	2437,
    7 :	2442,
    8 :	2447,
    9 :	2452,
    10:	2457,
    11:	2462, 
    12:	2467, 
    13:	2472, 
    14:	2484,
    // 5GHz
    36: 5180,
    38: 5190,
    40: 5200,
    42: 5210,
    44: 5220,
    46: 5230,
    48: 5240,
    52: 5260,
    56: 5280,
    60: 5300,
    64: 5320,
    100:5500,
    104:5520,
    108:5540,
    112:5560,
    116:5580,
    120:5600,
    124:5620,
    128:5640,
    132:5660,
    136:5680,
    140:5700,
    149:5745,
    153:5765,
    157:5785,
    161:5805,
    165:5825,
};
	
/* iwconfig / airport / ip / netsh  */
function parseWireless(config, output) {
    // cells is a list of Cells
    var wireless = {
	cells : [],
	__exposedProps__: {
	    cells: "r"
	}
    };

    function Cell() {};
    Cell.prototype = {
	id: null,
	mac: null,       // ap mac
	essid: null,     // network ssid
	channel: null,   // 
	frequency: null, // MHz
	quality: null,   // %
	signal: null,    // signal strength dBm
	bitrate: null,     // available bitrates
	encryption: null,// true | false
	mode: null,      // managed or adhoc
	lastBeacon: null,
	__exposedProps__: {
		id: "r",
		mac: "r",
		essid: "r",
		frequency: "r",
		channel: "r",
		quality: "r",
		signal: "r",
		bitrate: "r",
		encryption: "r",
		mode: "r",
		lastBeacon: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case linux:
	// split the info into cells
	var tmpCells = output.trim().split("Cell");
	if (!tmpCells || tmpCells.length<=0)
	    break;

	for(var i = 1; i < tmpCells.length; i++) {
	    var info = "Cell" + tmpCells[i];
	    info = info.replace(/\s{2,}/g, ' ');
	    info = info.replace(/\n{1,}/g, ' ');
	    
	    var x = new RegExp("Cell (.+) - Address: (.+)\\s+Channel:(.+)\\s+Frequency:(.+ GHz).+\\s+Quality=(.+)\\s+Signal level=(.+) dBm\\s+Encryption key:(.+)\\s+ESSID:\"(.+)\"\\s+");
	    
	    var w = x.exec(info);
	    
	    var cell = new Cell(); 
	    cell.id = w[1];
	    cell.mac = w[2];
	    cell.channel = parseInt(w[3]);
	    cell.frequency = ~~(parseInt(w[4])*1000); // GHz -> MHz
	    if (w[5].indexOf('\/')>=0) {
		var tmp = w[5].split('\/'); // Quality=31/70
		cell.quality = 100.0 * parseFloat(tmp[0]) / parseFloat(tmp[1]);
	    } else {
		cell.quality = w[5]; // can this happen?
	    }
	    cell.signal = parseInt(w[6]);
	    cell.encryption = (w[7].trim() === "on");
	    cell.essid = w[8].replace(/"/g,'');
	    
	    if (info.indexOf('Mode:') >= 0) {
		var re = new RegExp(/Mode:\s*(\w+)/);
		cell.mode = re.exec(info)[1];
	    }
	    if (info.indexOf('Last beacon:') >= 0) {
		var re = new RegExp(/Last beacon:\s*(\d+)ms/);
		cell.lastBeacon = parseInt(re.exec(info)[1]);
	    }

	    //  Bit Rates:6 Mb/s; 9 Mb/s; 12 Mb/s; 18 Mb/s; 24 Mb/s 36 Mb/s; 48 Mb/s; 54 Mb/s
	    cell.bitrate = new Array();
	    var idx = info.indexOf('Bit Rates:');
	    if (idx>=0) {
		var rates = info.substring(idx+'Bit Rates:'.length).split('Mb/s');
		for (var j = 0; j < rates.length; j++) {
		    var r = parseFloat(rates[j].replace(';','').trim());
		    if (!isNaN(r) && isFinite(r))
			cell.bitrate.push(r);
		    else
			break;
		}
	    }
	    
	    wireless.cells.push(cell);
	}
	break;

    case darwin:
	var tmpCells = output.trim().split("\n");
	if (tmpCells.length<0)
	    break;

	for(var i = 1; i < tmpCells.length; i++) {
	    if (tmpCells[i].indexOf(':')<0) // does not look a valid cell line
		continue

	    var info = tmpCells[i].trim().replace(/\s{2,}/g,' ');
	    var cols = info.split(' ');

	    var cell = new Cell(); 
	    cell.id = i;
	    cell.essid = cols[0];
	    cell.mac = cols[1];
	    cell.signal = parseInt(cols[2]);
	    cell.channel = parseInt(cols[3].split(',')[0]);
	    cell.encryption = cols[6];
	    
	    wireless.cells.push(cell);
	}
	break;

    case android:
	if (output.trim().indexOf('bssid') >= 0) {
	    var tmpCells = output.trim().split("\n");
	    for(var i = 2; i < tmpCells.length; i++) {
		if (tmpCells[i].indexOf(':')<0) // does not look a valid cell line
		    continue

		var info = tmpCells[i].trim().replace(/\s{2,}/g,' ');
		var cols = info.split(' ');

		var cell = new Cell(); 
		cell.id = i;
		cell.mac = cols[0];
		cell.frequency = cols[1];
		cell.signal = parseInt(cols[2]);
		cell.encryption = cols[3];
		cell.essid = cols[4];

		wireless.cells.push(cell);
	    }
	}
	break;

    case winnt:
	// split the info into cells
	var tmpCells = output.trim().split("\r\n\r\n");
	for(var i = 1; i < tmpCells.length; i++) {
	    var id,ssid,mode,enc;
	    var cell = undefined;

	    var info = tmpCells[i].trim().split("\n");
	    for (var j = 0; j < info.length; j++) {
		var w = info[j].trim().replace(/\s{2,}/g,' ').split(': ');
		if (w.length!==2)
		    continue;

		if (w[0].indexOf('BSSID')>=0) {
		    if (cell !== undefined) { // prev cell
			wireless.cells.push(cell);			
		    }

		    // Each cell can have multiple APs (bssids), report
		    // each as separate 'cell'
		    cell = new Cell();
		    cell.id = 'SSID'+id+':'+w[0].replace("BSSID ",'');
		    cell.mac = w[1];
		    cell.essid = ssid;
		    cell.mode = mode;
		    cell.encryption = enc;
		    cell.bitrate = new Array();

		} else if (w[0].trim().indexOf('SSID')>=0) {
		    id = w[0].replace("SSID",'').trim();
		    ssid = w[1];

		} else if (w[0].trim() == 'Network type') {
		    mode = w[1];

		} else if (w[0].trim() == 'Authentication') {
		    enc = (w[1].trim() !== 'Open');

		} else if (w[0].trim() == 'Signal' && cell!==undefined) {
		    cell.quality = parseInt(w[1].replace('%',''));

		} else if (w[0].trim() == 'Channel' && cell!==undefined) {
		    cell.channel = parseInt(w[1]);
		    cell.frequency = channel2freq[cell.channel];

		} else if (w[0].trim().indexOf('rates ')>=0 && cell!==undefined) {
		    var tmp = w[1].split(' ');
		    for (var k = 0; k < tmp.length; k++) {
			cell.bitrate.push(parseInt(tmp[k].trim()));
		    }
		}
	    } // end for

	    if (cell !== undefined) { // the last cell
		wireless.cells.push(cell);			
		cell = undefined;
	    }
	}
	break;
    default:
	wireless = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return wireless;
};

// use config.params to filter results for particular interface
function parseProcNetWireless(config, output) {    
    var lines = output.trim().split("\n");

    // less than 3 lines on any platform means no wifi adapter is present
    if (lines.length < 3) {
	return {
	    error: 'no wifi interface statistics available',
	    __exposedProps__: {
		error: "r",
	    }
	};
    }
    var wifi = {
	link: null,   // quality: % or abstract quantity
	signal: null, // dBm
	noise: null,  // dBm
	iface: null,   // iface
	__exposedProps__: {
	    link: "r",
	    signal: "r",
	    noise: "r",
	    iface: "r",
	}
    };

    switch (config.os.toLowerCase()) {
    case linux:
    case android:
	for (var i = 0; i < lines.length && wifi.signal==null; i++) {
	    var line = lines[i];
	    if (line.indexOf('|')>=0)
		continue; // header line

	    var elems = line.trim().replace(/\s{2,}/g, ' ').split(" ");
	    var iface = elems[0].replace(':','');

	    if (config.params && config.params.length === 1) {
		if (config.params[0] === iface) {
		    // found the requested interface
		    wifi.link = parseInt(elems[2]);
		    wifi.signal = parseInt(elems[3]);
		    wifi.noise = parseInt(elems[4]);
		    wifi.iface = iface;
		}
	    } else {
		// just pick the first line
		wifi.link = parseInt(elems[2]);
		wifi.signal = parseInt(elems[3]);
		wifi.noise = parseInt(elems[4]);
		wifi.iface = iface;
	    }
	}
	break;
    case darwin:
	for (var i = 0; i < lines.length; i++) {
	    var elems = lines[i].trim().replace(/\s{2,}/g, ' ').split(":");
	    if (elems[0] == "agrCtlRSSI") 
	       wifi.signal = parseInt(elems[1].trim());
	    else if (elems[0] == "agrCtlNoise") 
	       wifi.noise = parseInt(elems[1].trim());
	}
	break;
    case winnt:
	var x = new RegExp("Signal\\s+:\\s+(.+)%");
	var elems = x.exec(output.trim());
	if (elems) 
	   wifi.link = parseInt(elems[1]);
	else
	    wifi = {
		error: 'no wifi interface statistics available',
		__exposedProps__: {
		    error: "r",
		}
	    };
	break;
    default:
	wifi = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return wifi;
};
		
function parseWifiInterface(config,output) {
    var iwconfig = {
	mac : null,      // mac address
	proto: null,     // 802.11 version
	ssid: null,      // network name
	bssid : null,    // network bssid
	mode: null,      // managed or adhoc
	freq: null,      // MHz
	channel: null,   // 
	name : null,     // device name
	txpower : null,  // 
	signal : null,   // signal strength
	noise : null,    // noise 
	quality : null,     // link quality (%)
	txbitrate : null,// last known transmit bitrate (Mbps)
	rxbitrate : null,// last known receive bitrate (Mbps)
	offline : null,
	__exposedProps__: {
	    mac: "r",
	    proto: "r",
	    ssid: "r",
	    bssid : "r",
	    mode: "r",
	    freq: "r",
	    channel: "r",
	    name : "r",
	    txpower : "r",
	    signal : "r",
	    noise : "r",
	    quality : "r",
	    txbitrate : "r",		    			
	    rxbitrate : "r",		    			
	    offline : "r",
	}
    };

    var lines = output.trim().split("\n");

    switch (config.os.toLowerCase()) {
    case linux:
	var i;
	for (i = 0; i<lines.length; i++) {
	    var tmp = lines[i].trim().replace(/\s{2,}/g, ' ').split(' ');

	    if (lines[i].indexOf('ESSID')>=0) {
		// wlan0     IEEE 802.11abgn  ESSID:"BISmark5-testbed"
		iwconfig.name = tmp[0].trim();
		iwconfig.proto = tmp[2].trim();
		var tmp2 = tmp[3].trim().split(':');
		iwconfig.ssid = tmp2[1].replace(/"/g,'');

	    } else if (lines[i].indexOf('Mode:')>=0) {
		// Mode:Managed  Frequency:5.18 GHz  Access Point: A0:21:B7:BB:17:54
		var tmp2 = tmp[0].trim().split(':');
		iwconfig.mode = tmp2[1].toLowerCase();
		tmp2 = tmp[1].trim().split(':');
		iwconfig.freq = ~~(parseFloat(tmp2[1])*1000); // GHz -> MHz

		// find channel
		for (var channel in channel2freq) {
		    if (channel2freq[channel] === iwconfig.freq) {
			iwconfig.channel = channel
			break;
		    }
		}

		iwconfig.bssid = tmp[5];

	    } else if (lines[i].indexOf('Bit Rate')>=0) {
		// Bit Rate[=;]6 Mb/s   Tx-Power[=;]15 dBm
		if (tmp[1].indexOf('=')>=0) { // fixed bitrate
		    var tmp2 = tmp[1].trim().split('=');
		    iwconfig.txbitrate = parseInt(tmp2[1]);
		} else { // auto bitrate
		    var tmp2 = tmp[1].trim().split(';');
		    iwconfig.txbitrate = tmp2[1];
		}

		if (tmp[3].indexOf('=')>=0) { // fixed power
		    var tmp2 = tmp[3].trim().split('=');
		    iwconfig.txpower = parseInt(tmp2[1]);
		} else if (tmp[3].indexOf('=')>=0) { // auto power
		    var tmp2 = tmp[3].trim().split(';');
		    iwconfig.txpower = tmp2[1];
		} 

	    } else if (lines[i].indexOf('Link Quality')>=0) {
		// Link Quality=66/70  Signal level=-44 dBm 
		if (tmp[1].indexOf('/')>=0) {
		    // convert to %
		    var tmp2 = tmp[1].trim().split('=')[1].split('/');
		    iwconfig.quality = 100.0 * parseInt(tmp2[0])/parseInt(tmp2[1]);
		}

		if (tmp[3].indexOf('=')>=0) { // fixed
		    tmp2 = tmp[3].trim().split('=');
		    iwconfig.signal = parseInt(tmp2[1]);
		} else { // auto
		    tmp2 = tmp[3].trim().split(';');
		    iwconfig.signal = tmp2[1];
		}
	    }
	}
	break;
    case darwin:
	var inwifiport = false;
	var i;
	for (i = 0; i<lines.length; i++) {
	    var tmp = lines[i].trim().split(': ');
	    if (tmp.length!=2)
		continue;

	    switch(tmp[0]) {
	    case "AirPort":
		if (tmp[1].trim().toLowerCase() === 'off')
		    iwconfig.offline = true;
		else
		    iwconfig.offline = false;
		break;
	    case "agrCtlRSSI":
		iwconfig.signal = parseInt(tmp[1].trim());
		break;
	    case "agrCtlNoise":
		iwconfig.noise = parseInt(tmp[1].trim());
		break;
	    case "op mode":
		iwconfig.mode = (tmp[1].trim() === 'station' ? 'managed' : 'adhoc');
		break;
	    case "lastTxRate":
		iwconfig.txbitrate = parseInt(tmp[1].trim());
		break;
	    case "BSSID":
		iwconfig.bssid = tmp[1].trim();
		break;
	    case "SSID":
		iwconfig.ssid = tmp[1].trim();
		break;
	    case "channel":
		iwconfig.channel = parseInt(tmp[1].trim());
		iwconfig.freq = channel2freq[iwconfig.channel];
	break;
	    case "Hardware Port":
		if (tmp[1].trim() === "Wi-Fi")
		    inwifiport = true;
		else
		    inwifiport = false;
		break;
	    case "Device":
		if (inwifiport)
		    iwconfig.name = tmp[1].trim();
		break;
	    case "Ethernet Address":
		if (inwifiport)
		    iwconfig.mac = tmp[1].trim();
		break;
	    };
	}
	break;
    case winnt:
	for (var i = 0; i<lines.length; i++) {
	    var tmp = lines[i].trim().split(': ');
	    if (tmp.length!=2)
		continue;

	    switch(tmp[0].trim()) {
	    case "Name":
		iwconfig.name = tmp[1].trim();
		break;
	    case "Physical address":
		iwconfig.mac = tmp[1].trim();
		break;
	    case "Radio type":
		iwconfig.proto = tmp[1].trim();
		break;
	    case "State":
		if (tmp[1].trim().toLowerCase() === 'connected')
		    iwconfig.offline = false;
		else
		    iwconfig.offline = true;
		break;
	    case "SSID":
		iwconfig.ssid = tmp[1].trim();
		break;
	    case "BSSID":
		iwconfig.bssid = tmp[1].trim();
		break;
	    case "Network type":
		iwconfig.mode = (tmp[1].trim() === 'Infrastructure' ? 'managed' : 'adhoc');
		break;
	    case "Channel":
		iwconfig.channel = parseInt(tmp[1].trim());
		iwconfig.freq = channel2freq[iwconfig.channel];
		break;
	    case "Receive rate (Mbps)":
		iwconfig.rxbitrate = parseInt(tmp[1].trim());
		break;
	    case "Transmit rate (Mbps)":
		iwconfig.txbitrate = parseInt(tmp[1].trim());
		break;
	    case "Signal":
		iwconfig.quality = parseInt(tmp[1].trim().replace('%',''));
		break;
	    }
	}
	break;
    case android:
	iwconfig.name = output.trim();
	break;
    default:
	iwconfig = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return iwconfig;
};

/**
 * Public API method.
 *
 * @param {object} config - object with 
 * <ul>
 *  <li>name : unique name of the parse task <required></li>
 *  <li>os : current operating system  <required></li>
 *  <li>params : additional info for the parser <optional></li>
 * </ul>
 *
 * @param {object} obj - data to parse
 */
var libParse2 = function (config, obj) {
    var res = undefined;
    var out = obj.stdout;
    var err = obj.stderr;

    Logger.debug("libParse2: calling for " + config.name);

    // check first if the output exists and has no errors
    if (obj && obj["error"]) {
	Logger.debug(obj);
	res = {
	    error : obj["error"],
	    exitstatus : null,
	    __exposedProps__: {
		error: "r",
		exitstatus: "r"
	    }
	};
    } else if (!out && err) {
	Logger.debug(err);
	var serr = err.trim() + "";
	if (err.indexOf(':')>0) { 
	    serr = err.substring(err.indexOf(':')+1).trim();
	};
	res = {
	    error : serr,
	    exitstatus : obj.extistatus,
	    __exposedProps__: {
		error: "r",
		exitstatus: "r"
	    }
	};
    } else if (out && out["error"]) {
	Logger.debug(out);
	res = {
	    error : obj["error"],
	    exitstatus : obj.extistatus,
	    __exposedProps__: {
		error: "r",
		exitstatus: "r"
	    }
	};
    }

    var addcommon = function(res) {	
	// add some common metadata for each report
	var meta = {
	    ts : Date.now(),
	    name : config.name,
	    cmd : config.cmd,
	    os : config.os,
	    __exposedProps__ : {
		ts : "r",
		name: "r",
		cmd : "r",	
		os : "r",	
	    }
	};
	res.meta = meta;
	if (!res.__exposedProps__)
	    res.__exposedProps__ = {};
	res.__exposedProps__.meta = 'r';
	return res;
    };

    if (res !== undefined) { // there was an error
	Logger.debug("libParse2: command failed - stop parsing");
	return addcommon(res);
    }

//    Logger.debug(out);

    // choose the parser
    switch(config.name) {
    case "traceroute":
	res = parseTraceroute(config,out);
	break;
    case "ping":
	res = parsePing(config,out);
	break;
    case "nameserver":
	res = parseNameServer(config,out);
	break;
    case "hostname":
	res = {hostname : out.trim(), __exposedProps__ : {hostname : "r" }};
	break;
    case "defaultInterfaces":
	res = parseRoutingTable(config,out);
	if (!res.error)
	   res = retval.defaultEntry;
	break;
    case "routingInfo":
	res = parseRoutingTable(config,out);
	break;
    case "activeInterfaces":
	res = parseInterface(config,out);
	break;
    case "memInfo":
	res = parseMem(config,out);
	break;
    case "loadInfo":
	res = parseTop(config,out);
	break;
    case "interfaceStats":
	res = parseIfaceStats(config,out);
	break;
    case "arpCache":
	res = parseArpCache(config,out);
	break;
    case "wifiInfo":
	res = parseWireless(config,out);
	break;		
    case "wifiStats":
	res = parseProcNetWireless(config,out);
	break;
    case "activeWifiInterface":
	res = parseWifiInterface(config,out);
	break;	
    default:
	res = {
	    error: 'libParse: unknown parse request ' +config.name,
	    __exposedProps__: {
		error : "r",
	    }
	};
	break;
    };

    return addcommon(res);
}
