var EXPORTED_SYMBOLS = ["libParse2"];

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

    function Hop() {}
    Hop.prototype = {
	id: null,
	host: null,
	ip: null,
	rtt: [],
	missed : 0,
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
    case "linux":
    case "android": // TODO : check if this works ...
	var start = 1;
	for (var i = start; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g,' ');//.replace(/\sms/g,'');
	    if (str.trim() == "") continue;
	    var ent = str.trim().split(' ');
	    var h = new Hop();
	    h.id = ent[0];
	    h.host = ent[1];
	    h.ip = ent[2] ? ent[2].replace(/\(|\)/gi, '') : ent[2];
	   
	    for (var k = 3; k < ent.length; k++) {
		if (ent[k+1] == 'ms') {
		    // delay in ms
		    h.rtt.push(parseFloat(ent[k]));
		} else if (ent[k] == '*') {
		    // no response
		    h.missed += 1;
		}
	    }
	    
	    traceroute.hop.push(h);
	}
	break;
    case "darwin":
	var start = 0;
	for (var i = start; i < lines.length; i++) {
	    var str = lines[i].replace(/\s{2,}/g,' ');//.replace(/\sms/g,'');
	    if (str.trim() == "") continue;
	    var ent = str.trim().split(' ');
	    var h = new Hop();
	    h.id = ent[0];
	    h.host = ent[1];
	    h.ip = ent[2] ? ent[2].replace(/\(|\)/gi, '') : ent[2];
	    
	    var tmprtt = "";
	    for (var k = 3; k < ent.length; k++)
		tmprtt += ent[k] + " ";
	    var tmprtt1 = ent[3],
	    tmprtt2 = ent[4],
	    tmprtt3 = ent[5];
	    
	    var flag = false;
	    while(!flag) {
		if(i == lines.length) {
		    flag = true;
		    continue;
		}
		// test if the following lines are next hops
		var newline = (i < lines.length && lines[i+1]) ? lines[i+1].replace(/\s{2,}/g,' ').trim() : "";
		var elems = newline;
		var start = elems.split(" ")[0];
		// check if this is a hop number
		var par_t = parseInt(start);
		var par_e = par_t.toString().length;
		if(par_e == start.length && par_t != NaN) {
		    // this is a hop, so continue forward
		    flag = true;
		} else {
		    i++;
		    tmprtt += elems + " ";
		}
	    }
	    
	    var rtts = tmprtt.split("ms");
	    
	    var len = rtts.length > 1 ? rtts[0].trim().split(" ") : [];
	    h.rtt1 = (len.length > 0) ? len[len.length - 1] : "*";
	    //tmprtt1;
	    len = rtts.length > 2 ? rtts[1].trim().split(" ") : [];
	    h.rtt2 = (len.length > 0) ? len[len.length - 1] : "*";
	    //tmprtt2;
	    len = rtts.length > 3 ? rtts[2].trim().split(" ") : [];
	    h.rtt3 = (len.length > 0) ? len[len.length - 1] : "*";
	    //tmprtt3;
	    
	    traceroute.hop.push(h);
	}
	break;
    case "winnt":
	for (var i = 3; i < lines.length - 2; i++) {
	    var str = lines[i].replace(/\s{2,}/g, ' ').replace(/\sms/g, '');
	    if (str.trim() == "") continue;
	    var ent = str.trim().split(' ');
	    var h = new Hop();
	    if(ent.length == 6) {
		h.id = ent[0];
		h.host = ent[4];
		h.ip = ent[5].replace(/\[|\]/gi, '');
		h.rtt1 = ent[1];
		h.rtt2 = ent[2];
		h.rtt3 = ent[3];

		traceroute.hop.push(h);

	    } else if(ent.length == 5) {
		h.id = ent[0];
		h.ip = ent[4];
		h.rtt1 = ent[1];
		h.rtt2 = ent[2];
		h.rtt3 = ent[3];

		traceroute.hop.push(h);
	    }
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

    var lines = output.split("\n");

    switch (config.os.toLowerCase()) {
    case "linux":
    case "android":
    case "darwin":
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
		// 64 bytes from 192.168.1.1: icmp_req=1 ttl=64 time=0.291 ms
		if (s[3].indexOf(':')>=0) {
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
		var lost = s[2].trim().split('%')[0];
		ping.stats.packets.sent = parseInt(sent);
		ping.stats.packets.received = parseInt(received);
		ping.stats.packets.lost = parseInt(lost);
		ping.stats.packets.lossrate = 100.0;
		ping.stats.packets.succrate = 0.0;
		if (sent>0) {
		    ping.stats.packets.lossrate = ping.stats.packets.lost*100.0/ping.stats.packets.sent;
		    ping.stats.packets.succrate = ping.stats.packets.received*100.0/ping.stats.packets.sent;
		}
	    } else if (line.indexOf("avg")>0) {
 		var s = line.split('=')[1].split('/');
		var min = s[0].replace(/ms/, "");
		var max = s[1].replace(/ms/, "");
		var avg = s[2].replace(/ms/, "");
		var mdev = s[3].replace(/ms/, "");
		
		ping.stats.rtt.min = parseFloat(min);
		ping.stats.rtt.max = parseFloat(max);
		ping.stats.rtt.avg = parseFloat(avg);
		ping.stats.rtt.mdev = parseFloat(mdev);
	    }
	}
	break;
    case "winnt":
	if (lines.length == 1) {
	    ping.domain = "";
	    ping.ip = "";
	    return ping;
	}
	for (var i = 0; i < lines.length; i++) {
	    var line = lines[i].trim().replace(/\s{2,}/g, ' ');
	    if (i > 0 && i < lines.length - 4) continue;
	    if (i == 0) {
		var s = line.split(' ');
		ping.domain = s[1];
		ping.ip = (s[2].indexOf('[') == -1) ? s[1] : s[2].replace(/[|]|:/gi, '');

	    } else if (i == lines.length - 3) {
		var s = line.split(',');
		var sent = s[0].trim().split(' ')[3];
		var received = s[1].trim().split(' ')[2];
		var lost = s[2].trim().split('%')[0].split("(")[1];
		ping.stats.packets.sent = sent;
		ping.stats.packets.received = received;
		ping.stats.packets.lost = lost;

	    } else if (i == lines.length - 1) {
		var s = line.split(',');
		var min = s[0].split('=')[1].split('ms')[0].trim();
		var max = s[1].split('=')[1].split('ms')[0].trim();
		var avg = s[2].split('=')[1].split('ms')[0].trim();
		var mdev = 0;
		ping.stats.rtt.min = min;
		ping.stats.rtt.max = max;
		ping.stats.rtt.avg = avg;
		ping.stats.rtt.mdev = mdev;
	    }
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
function parseNameServerInfo(config, output) {
    var nameserver = {
	domain: null,
	list: [],
	__exposedProps__: {
	    domain: "r",
	    list: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case "android":
	// cmd: getprop net.dnsX
	var s = info.trim();
	nameserver.list.push(s);
	break;
    case "linux":
    case "darwin":
	// cmd: cat /etc/resolf.con
	var lines = output.split("\n");
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
    case "winnt":
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
    case "android":	
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
    case "linux":
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
    case "darwin":
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
	    mask.push("N/A");
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
    case "winnt":
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
function parseInterfaceInfo(config,output) {
    // output is a list of Ifaces
    var interfaces = new Array();
    function Iface() {};
    Iface.prototype = {
	name: null,
	address: {
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
	},
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
    case "android":
	var inter = output.trim().replace(/\s{2,}/g, ' ').split("\n");
	var cache = {};
	for (var i = 0; i < inter.length; i++) {
	    var w = inter[i].split(" ");
	    if (w[1].trim() == "UP") {
		// netcfg output format: wlan0 UP 192.168.1.139/24 0x00001043 08:60:6e:9f:db:0d
		var intf = new Iface();
		intf.name = w[0].trim();
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
		var name = w[0].trim().replace(':','');
		var intf = cache[name] || new Iface();
		if (!intf.name)
		    intf.name = name;		
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
	
    case "linux":
	var inter = output.trim().split("\n\n");
	for (var i = 0; i < inter.length; i++) {
	    var x = new RegExp("(.+)\\s+Link.+HWaddr\\s(.+)\\s+inet addr:(.+)\\s+Bcast:(.+)\\s+Mask:(.+)\\s+inet6 addr:\\s+(.+)\\s+Scope.+\\s+.+MTU:(.+)\\s+Metric.+\\s+.+\\s+.+\\s+.+\\s+RX bytes:(.+)TX bytes:(.+)\\s*");
	    var w = x.exec(inter[i]);
	    var intf = new Iface();
	    if (w) {
		intf.name = w[1].trim();
		intf.address.ipv4 = w[3].trim();
		intf.address.broadcast = w[4].trim();
		intf.address.mask = w[5].trim();
		intf.address.ipv6 = w[6].trim();
		intf.mtu = w[7].trim();
		intf.mac = w[2].trim();
		intf.tx = w[9].trim();
		intf.rx = w[8].trim();

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
		    'tx': new RegExp("TX .+ bytes (.+)"),
		    'rx': new RegExp("RX .+ bytes (.+)"),
		}
		
		for (var j in regexp) {
		    var ww = regexp[j].exec(inter[i]);
		    if (ww && ww[1]) {
			switch (j) {
			case 'ipv4':
			case 'broadcast':
			case 'mask':
			case 'ipv6':
			    intf.address[j] = ww[1];
			    break;
			case 'name':
			case 'mtu':
			case 'mac':
			case 'tx':
			case 'rx':
			    intf[j] = ww[1];
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
    case "darwin":
	var lines = info.trim().split("\n");
	var inter = "";
	var x = new RegExp(".+flags.+mtu.+");

  	var addIface = function(text) {
	    var reg1 = new RegExp("(.+):.+mtu\\s([0-9]+)\\s+ether\\s(.+)\\sinet6\\s(.+)\\sprefixlen.+\\sinet\\s(.+)\\snetmask\\s(.+)\\sbroadcast\\s([0-9\.]+)");
	    var reg2 = new RegExp("(.+):.+mtu\\s([0-9]+)\\s+ether\\s(.+)\\sinet\\s(.+)\\snetmask\\s(.+)\\sbroadcast\\s([0-9\.]+)");

	    var intf = new Iface();	    
	    var w = reg1.exec(text);
	    if (w) {
		intf.name = w[1];
		intf.address.ipv4 = w[5];
		intf.address.broadcast = w[7];
		intf.address.mask = w[6];
		intf.address.ipv6 = w[4];
		intf.mtu = w[2];
		intf.mac = w[3];
		interfaces.push(intf);

	    } else {
		w = reg2.exec(text);
		if (w) {
		    intf.name = w[1];
		    intf.address.ipv4 = w[4];
		    intf.address.broadcast = w[6];
		    intf.address.mask = w[5];
		    intf.mtu = w[2];
		    intf.mac = w[3];
		    
		    interfaces.push(intf);
		}
	    }
	    
	}

	for (var i = 0; i < lines.length; i++) {
	    if (x.test(lines[i].trim())) {
		// next iface starts, add prev
		if (inter != "") 
		    addIface(inter.replace(/\s{2,}/g, ' '));

		inter = lines[i];
	    } else {
		inter += lines[i];
		// last on the list
		if (i == lines.length - 1) 
		    addIface(inter.replace(/\s{2,}/g, ' ')); 
 	    }
	}
	break;
    case "winnt":
	var text = output.trim().split(":\r\n\r\n");
	for(var i = 1; i < text.length; i++) {
	    var intf = new Iface();
	    var tmp = text[i-1].trim().split("\n");
	    intf.name = tmp[tmp.length - 1];
	    if (intf.name.indexOf("adapter") != -1) {
		var regexp = {
		    'ipv4': new RegExp("IPv4 Address.*:\\s+(.+)", "ig"),
		    'mask': new RegExp("Subnet Mask.*:\\s+(.+)", "ig"),
		    'ipv6': new RegExp("IPv6 Address.*:\\s+(.+)", "ig"),
		    'mtu': new RegExp("NA", "ig"),
		    'mac': new RegExp("Physical Address.*:\\s+(.+)", "ig"),
		    'tx': new RegExp("NA", "ig"),
		    'rx': new RegExp("NA", "ig")
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
			    intf[j] = ww[1];
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
	interfaces = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return interfaces;
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
    case "android":
    case "linux":
	var text = output.trim().split("\n\n");
	var y = new RegExp("MemTotal:(.+)kB\\s+MemFree:(.+)kB\\s+Buffers");
	var w = y.exec(text[0].trim());
	if (w) {
	    memory.used = parseInt(w[1].trim()) - parseInt(w[2].trim());
	    memory.free =  w[2].trim();
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
	    cpu: "r",
	    memory: "r",
	}
    };

    switch (config.os.toLowerCase()) {
    case "android":
	var text = output.trim().split("\n\n");
	var x = new RegExp("User(.+)%.+System(.+)%.+IOW.+\\s+.+Idle(.+)IOW.+=(.+)");

	var w = x.exec(text[0].trim());
	if (w) {
	    sys.tasks.total = w[4].trim();
	    sys.tasks.running = parseInt(w[4].trim()) - parseInt(w[3].split("+")[0].trim());
	    sys.tasks.sleeping = w[3].split("+")[0].trim();

	    sys.cpu.user = w[1].trim();
	    sys.cpu.system = w[2].trim();
	    sys.cpu.idle = w[9].trim();
	}
	var y = new RegExp("MemTotal:(.+)kB\\s+MemFree:(.+)kB\\s+Buffers");
	var w = y.exec(text[0].trim());
	if (w) {
	    sys.memory.total = w[10].trim();
	    sys.memory.used = parseInt(w[1].trim()) - parseInt(w[2].trim());
	    sys.memory.free = w[2].trim();
	}
	break;
    case "linux":
	var text = output.trim().replace(/\s{2,}/g, ' ').split("\n\n");
	var x = new RegExp(".+average:(.+),(.+),(.+)\\s+Tasks:(.+)total,(.+)running,(.+)sleeping.+\\s+Cpu.+:(.+)%us,(.+)%sy,.+ni,(.+)%id.+\\s+Mem:(.+)total,(.+)used,(.+)free");

	var w = x.exec(text);
	if (w) {
	    sys.tasks.total = w[4].trim();
	    sys.tasks.running = w[5].trim();
	    sys.tasks.sleeping = w[6].trim();
	    sys.cpu.user = w[7].trim();
	    sys.cpu.system = w[8].trim();
	    sys.cpu.idle = w[9].trim();
	    sys.memory.total = w[10].trim();
	    sys.memory.used = w[11].trim().split("k")[0];
	    sys.memory.free = w[12].trim().split("k")[0];
	}
	break;
    case "darwin":
	var text = output.trim().replace(/\s{2,}/g, ' ').split("\n\n");
	var x = new RegExp("Processes:(.+)total,(.+)running,(.+)sleeping.+\\s+.+\\s+Load Avg:(.+),(.+),(.+)\\s+CPU usage:(.+)user,(.+)sys,(.+)idle\\s+SharedLibs.+\\s+MemRegions.+\\s+PhysMem:.+inactive,(.+)M used,(.+)M free.\\s+");

	var w = x.exec(text);
	if (w) {
	    sys.tasks.total = w[1].trim();
	    sys.tasks.running = w[2].trim();
	    sys.tasks.sleeping = w[3].trim();
	    sys.cpu.user = w[7].trim().slice(0, -1);
	    sys.cpu.system = w[8].trim().slice(0, -1);
	    sys.cpu.idle = w[9].trim();
	    sys.memory.total = (parseInt(w[10].trim()) + parseInt(w[11].trim())) + "M";
	    sys.memory.used = w[10].trim();
	    sys.memory.free = w[11].trim();
	}
	break;
    case "winnt":
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
	    sys.tasks.total = info.trim().split("\n").length - 2;
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

/* /proc/net/dev */
function parseProcNetDev(config,output) {
    // target interface
    var dIface = config.params[0];

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
	__exposedProps__: {
	    tx: "r",
	    rx: "r",
	}
    };
	
    switch (config.os.toLowerCase()) {
    case "linux":
    case "android":
	if (dIface) {
	    var x = new RegExp(dIface.trim() + ":(.+)\\s*");
	    var w = x.exec(output);
	    if (w) {
		var elems = w[1].trim().replace(/\s{2,}/g, ' ').split(" ");
		// store the tx, rx info
		rx.bytes = elems[0].trim();
		rx.packets = elems[1].trim();
		rx.errs = elems[2].trim();
		rx.drops = elems[3].trim();
		tx.bytes = elems[8].trim();
		tx.packets = elems[9].trim();
		tx.errs = elems[10].trim();
		tx.drops = elems[11].trim();
	    }
	}
	break;
    case "darwin":
	if (dIface) {
	    var x = new RegExp(dIface.trim() + "(.+)\\s*");
	    var w = x.exec(output);
	    if (w) {
		//dump(w);
		var elems = w[1].trim().replace(/\s{2,}/g, ' ').split(" ");
		//dump(elems);
		// store the tx, rx info
		rx.bytes = elems[5].trim();
		rx.packets = elems[3].trim();
		rx.errs = 0;
		rx.drops = 0;
		tx.bytes = elems[8].trim();
		tx.packets = elems[6].trim();
		tx.errs = 0;
		tx.drops = 0;
	    }
	}
	break;
    case "winnt":
	if (dIface) {
	    var x = new RegExp("Bytes\\s+(.+)\\s+(.+)\\s+Unicast packets\\s+(.+)\\s+(.+)\\s+Non-unicast packets\\s+(.+)\\s+(.+)\\s+Discards\\s+(.+)\\s+(.+)\\s+Errors\\s+(.+)\\s+(.+)\\s+");
	    var elems = x.exec(output);
	    if (elems) {
		rx.bytes = elems[1].trim();
		rx.packets = elems[3].trim();
		rx.errs = 0;
		rx.drops = 0;
		tx.bytes = elems[2].trim();
		tx.packets = elems[4].trim();
		tx.errs = 0;
		tx.drops = 0;
	    }
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
function parseArpCache(info) {
    // Array of Elems
    var arpCache = new Array();
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

    switch (config.os.toLowerCase()) {
    case "linux":
	var tmp = info.trim().split('\n');
	for(var k = 0; k < tmp.length; k++) {
	    var i = tmp[k];
	    var x = i.split(' ');
	    var e = new Elem();
	    e.host = x[0];
	    e.ip = x[1].replace(/\(|\)/gi,'');
	    e.mac = x[3];
	    e.interface = x[6];
	    arpCache.push(e);
	}
	break;
    case "darwin":
	var tmp = info.trim().split('\n');
	for(var k = 0; k < tmp.length; k++) {
	    var i = tmp[k];
	    var x = i.split(' ');
	    var e = new Elem();
	    e.host = x[0];
	    e.ip = x[1].replace(/\(|\)/gi,'');
	    e.mac = x[3];
	    e.interface = x[5];
	    arpCache.push(e);
	}
	break;
    case "android":
	var tmp = info.trim().split('\n');
	for(var k = 0; k < tmp.length; k++) {
	    var i = tmp[k];
	    var x = i.split(' ');
	    var e = new Elem();
	    e.host = undefined;
	    e.ip = x[0];
	    e.mac = x[4];
	    e.interface = x[2];
	    arpCache.push(e);
	}
	break;
    default:
	arpCache = {
	    error: 'libParse: no parser for ' +config.name+ ' on ' + config.os,
	    __exposedProps__: {
		error: "r",
	    }
	};
	break;
    }
    return arpCache;
};
	
/* iwconfig / airport / ip  */
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
	mac: null,
	essid: null,
	frequency: null,
	quality: null,
	signal: null,
	channel: null,
	bitrate: [],
	encryption: null,
	mode: null,
	lastBeacon: null,
	__exposedProps__: {
		id: "r",
		mac: "r",
		essid: "r",
		frequency: "r",
		quality: "r",
		signal: "r",
		channel: "r",
		bitrate: "r",
		encryption: "r",
		mode: "r",
		lastBeacon: "r"
	}
    };

    switch (config.os.toLowerCase()) {
    case "linux":
	// split the info into cells
	var tmpCells = output.trim().split("Cell");
	for(var i = 1; i < tmpCells.length; i++) {
	    var info = "Cell" + tmpCells[i];
	    
	    var x = new RegExp("Cell (.+) - Address: (.+)\\s+Channel:(.+)\\s+Frequency:(.+ GHz).+\\s+Quality=(.+).+ Signal level=(.+ dBm)\\s+Encryption key:(.+)\\s+ESSID:(.+)\\s+");
	    
	    var w = x.exec(info);
	    
	    var cell = new Cell(); 
	    cell.id = w[1];
	    cell.mac = w[2];
	    cell.channel = w[3];
	    cell.frequency = w[4];
	    cell.quality = w[5];
	    cell.signal = w[6];
	    cell.encryption = w[7];
	    cell.essid = w[8];
	    
	    cell.mode = /Mode:(.+)\s/.exec(info)[1];
	    cell.lastBeacon = /Last beacon:(.+)\s/.exec(info)[1];
	    
	    var tmp = /Bit Rates:(.+)\s(.*)\s+Bit Rates:(.+)\s/.exec(info);
	    if(tmp)
		cell.bitrate = tmp[1] + "; " + tmp[2] + "; " + tmp[3];
	    
	    wireless.cells.push(cell);
	}
	break;
    case "darwin":
	var tmpCells = output.trim().split("\n");
	for(var i = 1; i < tmpCells.length; i++) {
	    var info = tmpCells[i].trim().replace(/\s{2,}/g,' ');
	    var cols = info.split(' ');

	    var cell = new Cell(); 
	    cell.id = i;
	    cell.mac = cols[1];
	    cell.channel = cols[3];
	    cell.signal = cols[2];
	    cell.encryption = cols[6];
	    cell.essid = cols[0];
	    
	    wireless.cells.push(cell);
	}
	break;
    case "android":
	if (output.trim().indexOf('bssid') >= 0) {
	    var tmpCells = output.trim().split("\n");
	    for(var i = 2; i < tmpCells.length; i++) {
		var info = tmpCells[i].trim().replace(/\s{2,}/g,' ');
		var cols = info.split(' ');

		var cell = new Cell(); 
		cell.id = i;
		cell.mac = cols[0]; // bssid
		cell.frequency = cols[1];
		cell.signal = cols[2];
		cell.encryption = cols[3];
		cell.essid = cols[4];

		wireless.cells.push(cell);
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

function parseProcNetWireless(config, output) {
    var wifi = {
	link: null,
	signal: null,
	noise: null,
	__exposedProps__: {
	    link: "r",
	    signal: "r",
	    noise: "r",
	}
    };
    
    switch (config.os.toLowerCase()) {
    case "linux":
    case "android":
	var lines = info.trim().split("\n");
	// just 3 lines are printed on linux
	// less than 3 lines means no wifi adapter is present
	if (lines.length < 3) 
	    return;

	var line = lines[lines.length - 1];
	var elems = line.trim().replace(/\s{2,}/g, ' ').replace(/\./g, '').split(" ");

	if (params && params.length==1) {
	    var iface = elems[0].replace(':','');
	    if (params[0] === iface) {
		wifi.link = elems[2];
		wifi.signal = elems[3];
		wifi.noise = elems[4];
	    }
	} else {
	    // just pick the last line
	    wifi.link = elems[2];
	    wifi.signal = elems[3];
	    wifi.noise = elems[4];
	}
	break;
    case "darwin":
	var lines = info.trim().split("\n");
	for (var i = 0; i < lines.length; i++) {
	    var elems = lines[i].trim().replace(/\s{2,}/g, ' ').split(":");
	    if (elems[0] == "agrCtlRSSI") wifi.signal = elems[1];
	    if (elems[0] == "agrCtlNoise") wifi.noise = elems[1];
	}
	break;
    case "winnt":
	var x = new RegExp("Signal\\s+:\\s+(.+)%");
	var elems = x.exec(info.trim());
	if (elems) wifi.link = elems[1];
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
		
function parseWifiInterface(info) {
    var iwconfig = {
	mac : null,
	proto: null,
	ssid: null,
	bssid : null,
	mode: null,
	freq: null,
	channel: null,
	name : null,
	txpower : null,
	signal : null,
	noise : null,
	bitrate : null,
	error : null,
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
	    bitrate : "r",		    			
	    error : "r",
	}
    };

    var lines = info.trim().split("\n");
    switch (config.os.toLowerCase()) {
    case "linux":
	var i;
	for (i = 0; i<lines.length; i++) {
	    var tmp = lines[i].split();
	    if (lines[i].indexOf('ESSID')>=0) {
		// wlan0     IEEE 802.11abgn  ESSID:"BISmark5-testbed"
		iwconfig.name = tmp[0].trim();
		iwconfig.proto = tmp[2].trim();
		var tmp2 = tmp[3].trim().split(':');
		iwconfig.ssid = tmp2[1].replace("\"",'');
	    } else if (lines[i].indexOf('Mode:')>=0) {
		// Mode:Managed  Frequency:5.18 GHz  Access Point: A0:21:B7:BB:17:54
		var tmp2 = tmp[0].trim().split(':');
		iwconfig.mode = tmp2[1];
		tmp2 = tmp[1].trim().split(':');
		iwconfig.freq = tmp2[1];
		iwconfig.bssid = tmp[5];
	    } else if (lines[i].indexOf('Bit Rate')>=0) {
		// Bit Rate[=;]6 Mb/s   Tx-Power[=;]15 dBm
		if (tmp[1].indexOf('=')>=0) { // fixed bitrate
		    var tmp2 = tmp[1].trim().split('=');
		    iwconfig.bitrate = tmp2[1];
		} else { // auto bitrate
		    var tmp2 = tmp[1].trim().split(';');
		    iwconfig.bitrate = tmp2[1];
		}

		if (tmp[3].indexOf('=')>=0) { // fixed power
		    var tmp2 = tmp[3].trim().split('=');
		    iwconfig.txpower = tmp2[1];
		} else if (tmp[3].indexOf('=')>=0) { // auto power
		    var tmp2 = tmp[3].trim().split(';');
		    iwconfig.txpower = tmp2[1];
		} 

	    } else if (lines[i].indexOf('Link Quality')>=0) {
		// Link Quality=66/70  Signal level=-44 dBm 
		if (tmp[3].indexOf('=')>=0) { // fixed
		    var tmp2 = tmp[3].trim().split('=');
		    iwconfig.signal = tmp2[1];
		} else { // auto
		    var tmp2 = tmp[3].trim().split(';');
		    iwconfig.signale = tmp2[1];
		}
	    }
	}
	break;
    case "darwin":
	var inwifiport = false;
	var i;
	for (i = 0; i<lines.length; i++) {
	    var tmp = lines[i].trim().split(': ');
	    if (tmp.length!=2)
		continue;

	    switch(tmp[0]) {
	    case "AirPort":
		if (tmp[1].trim().toLowerCase() === 'off')
		    iwconfig.error = "wifi is off";
		break;
	    case "agrCtlRSSI":
		iwconfig.signal = tmp[1].trim();
		break;
	    case "agrCtlNoise":
		iwconfig.noise = tmp[1].trim();
		break;
	    case "op mode":
		iwconfig.mode = tmp[1].trim();
		break;
	    case "lastTxRate":
		iwconfig.bitrate = tmp[1].trim();
		break;
	    case "BSSID":
		iwconfig.bssid = tmp[1].trim();
		break;
	    case "SSID":
		iwconfig.ssid = tmp[1].trim();
		break;
	    case "channel":
		iwconfig.channel = tmp[1].trim();
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
    case "android":
	iwconfig.name = info.trim();
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

    // check first if the output exists and has no errors
    if (obj && obj["error"]) {
	res = {
	    error : obj["error"],
	    exitstatus : null,
	    __exposedProps__: {
		error: "r",
		exitstatus: "r"
	    }
	};
    } else if (!out && err) {
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
	res = {
	    error : obj["error"],
	    exitstatus : obj.extistatus,
	    __exposedProps__: {
		error: "r",
		exitstatus: "r"
	    }
	};
    }

    if (res !== undefined) {
	res.ts = Date.now();
	res.__exposedProps__.ts = "r";	
	return res;
    }

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
	res = parseProcNetDev(config,out);
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

    res.ts = Date.now();
    res.__exposedProps__.ts = "r";
    return res;
}
