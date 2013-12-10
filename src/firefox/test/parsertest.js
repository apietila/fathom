function parse(output) {
    function Iface() {};
    Iface.prototype = {
	name: null,
	address: null,
	mtu: null,
	mac: null,
	tx: null,
	rx: null,
	__exposedProps__ : {
	    name: "r",
	    address: "r",
	    mtu: "r",
	    mac: "r",
	    tx: "r",
	    rx: "r"
	},
    };

    // output is a list of Ifaces
    var res = {
	interfaces: new Array(),
	__exposedProps__: {
	    interfaces: "r"
	}
    };

    var lines = output.trim().split("\n");
    var inter = "";
    var x = new RegExp(".+flags.+mtu.+");

    var addIface = function(text) {
	text = text.replace(/\s+/g, ' ');
	console.log(text);
	//en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500 ether 54:26:96:ce:3d:89 inet6 fe80::5626:96ff:fece:3d89%en0 prefixlen 64 scopeid 0x5 inet 192.168.0.204 netmask 0xffffff00 broadcast 192.168.0.255 nd6 options=1<PERFORMNUD> media: autoselect status: active
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
		ipv6: w[4],
		broadcast: w[7],
		mask: w[6],
		__exposedProps__: {
		    ipv4: "r",
		    ipv6: "r",
		    broadcast: "r",
		    mask: "r"
		}
	    };
	    res.interfaces.push(intf);
	    
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
		res.interfaces.push(intf);
		
	    } else {
		console.log("don't match");
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
    return res;
}

var exec = require('child_process').exec,
    child;

child = exec('ifconfig',
  function (error, stdout, stderr) {
      console.log('stdout: ' + stdout);
      console.log('stderr: ' + stderr);
      if (error !== null) {
	  console.log('exec error: ' + error);
      }      
      var json = parse(stdout);
      console.log(JSON.stringify(json,null,2));
});
