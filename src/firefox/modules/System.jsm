// Module API
var EXPORTED_SYMBOLS = ["System"];

Components.utils.import("resource://fathom/Logger.jsm");
Components.utils.import("resource://fathom/libParse2.jsm");
Components.utils.import("resource://fathom/utils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

// supported operating systems
const winnt = "winnt";
const android = "android";
const linux = "linux";
const darwin = "darwin";

const airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";

/**
 * @class System
 * @description This module provides the system tools API.
 *
 * @param {object} ctx - The Fathom extension object. Use this module as 
 *                       'var a = System(ctx); a.getOS();.
 */
var System = function (ctx) {
    return {
	/**
	 * @method getOS
	 * @static
	 *
	 * @description  This function returns client OS information.
	 * 
	 * @return {string} OS.
	 */
	getOS : function () {
	    return ctx.os;
	},

	/** 
	 * @method doTraceroute
	 * @static
	 *
	 * @description This function runs a traceroute to the given
	 * destination and, upon completion, returns the textual results.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {string} host The host (name or IP address) to run a
	 * traceroute to.
	 */
	doTraceroute : function(callback, host, incrementaloutput, iface, fast) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    // do incremental output? default false
	    var inc = false;
	    if (incrementaloutput !== undefined)
		inc = incrementaloutput; 
	    if (!host)
		callback({error: "doTraceroute: missing host argument"});

	    if (os == winnt) {
		cmd = "tracert";
		if (fast) {
		    args.push("-w 1000");
		}
		args.push(host);

	    } else if (os == linux || os == darwin || os == android) {
		cmd = "traceroute";
		if (iface!==undefined) {
		    args.push("-i"+iface);
		}
		if (fast) {
		    args.push("-w1");
		    args.push("-q1");
		} else {
		    args.push("-q3");
		    args.push("-m30");
		}
		args.push(host);

	    } else {
		callback({error: "doTraceroute: not available on " + os, __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "traceroute",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		    params: [host]
      		};
      		var data = libParse2(output, info);
      		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args, inc);

	}, // traceroute

	/** 
	 * @method doPing
	 * @static
	 *
	 * @description This function runs an ICMP ping to the given
	 * destination and, upon completion, returns the textual results.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {string} host The host (name or IP address) to ping.
	 * @param {integer} count The number of pings to attempt.
	 * @param {number} interval The interval between pings.
	 * @param {boolean} bcast Ping broadcast address.
	 * @param {boolean} incrementaloutput Send incremental output.
	 */
	doPing : function(callback, host, count, iface, interval, bcast, incrementaloutput) {
	    var os = ctx.os;
	    var cmd = 'ping';
	    var args = [];

	    if (host === undefined) {
		callback({error: "doPing: missing host argument", 
			  __exposedProps__: {error: "r"}});
		return;
	    }

	    // do incremental output? default false
	    var inc = false;
	    if (incrementaloutput !== undefined)
		inc = incrementaloutput; 

	    if (os == winnt) {
		if (count) {
		    args.push("-n " + count);
		} else {
		    args.push("-n 5");
		}

		if (iface) {
		    args.push("-S "+iface); // must be IP address ... -I does not work..
		}

	    } else if (os == linux || os == darwin || os == android) {
		if (count) {
		    args.push("-c" + count);
		} else {
		    args.push("-c 5");
		}

		if (iface) {
		    if (os == darwin) {
			args.push("-S"+iface); // must be IP address ... -I does not work..
		    } else {
			args.push("-I"+iface);
		    }	
		}

		if (interval) {
		    args.push("-i " + interval);
		}

		if (bcast !== undefined && bcast==true && 
		    (os == android || os == linux)) 
		{
		    args.push("-b");
		}
	    } else {
		callback({error: "doPing: not available on " + os,
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    args.push(host);
	    
	    function cbk(info) {
      		var output = {
      		    name: "ping",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};
      		var data = libParse2(output, info);
      		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args, inc);
	}, // doPing

	/** 
	 * @method getNameservers
	 * @static
	 *
	 * @description This function retrieves information about the
	 * client's DNS resolver configuration.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */
	getNameservers : function(callback) {
	    var that = ctx;
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];
	    var idx = 1;
	    var tmp = [];

	    if (os == winnt) {
		cmd = "ipconfig";
		args = ["/all"];

	    } else if (os == linux || os == darwin) {
		cmd = "cat";
		args = ["/etc/resolv.conf"];

	    } else if (os == android) {
		// must request server at the time ..
		cmd = "getprop";
		args = ["net.dns"+idx];

	    } else {
		callback({error: "getNameservers not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "nameserver",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};

      		var data = libParse2(output, info);

		if (os === android) {
		    if (data && !data.error && data.list.length > 0) { 
			// we can only get single nameserver at the time
			tmp.push(data.list[0]);
			idx += 1
			cmd = "getprop";
			args = ["net.dns"+idx];
			that._executeCommandAsync(cbk, cmd, args);

		    } else if (data.error) {
			callback(data);
		    } else {
			// done
      			callback(tmp);
		    }

		} else {
		    // all nameservers returned in one call
      		    callback(data);
		}
	    }	
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getNameservers

	/** 
	 * @method getHostname
	 * @static
	 *
	 * @description Get hostname
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */
	getHostname : function(callback) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == linux || os == darwin || os == winnt) {
		cmd = "hostname";
	    } else if (os == android) {
		cmd = "getprop";
		args = ["net.hostname"];
	    } else {
		callback({error: "getHostname not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "hostname",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};

      		var data = libParse2(output, info);
		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getHostname

	/** 
	 * @method nslookup
	 * @static
	 *
	 * @description call nslookup
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */
	nslookup : function(callback, arg) {
	    var os = ctx.os;
	    var cmd = "nslookup";
	    var args = [arg];
	    
	    function cbk(info) {
      		var output = {
      		    name: "nslookup",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};

      		var data = libParse2(output, info);
		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // nslookup

	/**
	 * @method getActiveInterfaces
	 * @static
	 *
	 * @description This function retrieves the current status of the
	 * clients' network interfaces.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */       
	getActiveInterfaces : function(callback) {
	    var that = ctx;
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    // ifconfig or netstat -i
	    if (os == winnt) {
		cmd = "ipconfig";
		args = ["/all"];

	    } else if (os == linux || os == darwin) {
		cmd = "ifconfig";

	    } else if (os == android) {
		cmd = "ip";
		args = ['-o','addr','show','up'];

	    } else {
		callback({error: "getActiveInterfaces not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "activeInterfaces",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};
      		var data = libParse2(output, info);

		if (os == android && data.error && 
		    data.error.indexOf('not found')>=0 && cmd !== 'netcfg') 
		{
		    // ip was not available, fallback to netcfg
		    Logger.info("\'ip\' not available, fallback to netcfg");
		    cmd = "netcfg";
		    args = [];
		    that._executeCommandAsync(cbk, cmd, args);
		} else {
      		    callback(data);
		}
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	},

	/**
	 * @method getActiveWifiInterface
	 * @static
	 *
	 * @description This function retrieves the current status of the
	 * clients' wireless network interface (iwconfig and friends).
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */       
	getActiveWifiInterface : function(callback) {
	    var that = ctx;
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];
	    
	    if (os == linux) {
		cmd = "iwconfig";

	    } else if (os == darwin) {
		cmd = airport;
		args = ["-I"];

	    } else if (os == android) {
		cmd = "getprop";
		args = ['wifi.interface'];

	    } else if (os == winnt) {
		cmd = "netsh";
		args = ['wlan','show','interfaces'];

	    } else {
		callback({error: "getActiveWifiInterface not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "activeWifiInterface",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};
      		var data = libParse2(output, info);

		if (os == darwin && !data.error) {
		    // get the name (and mac) of the wifi interface on OS X
		    cmd = "networksetup";
		    args = ["-listallhardwareports"];

		    that._executeCommandAsync(function(info2) {
      			var data2 = libParse2(output, info2);
			data.name = data2.name;
			data.mac = data2.mac;
      			callback(data);
		    }, cmd, args);

		} else {
      		    callback(data);
		}
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	},

	/**
	 * @method getArpCache
	 * @static
	 *
	 * @description This function retrieves the current contents of the ARP cache.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {string} hostname - Get the arp cache info only for the specified host (optional, default is all).
	 */       
	getArpCache : function(callback, hostname) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == winnt || os == darwin) {
		cmd = "arp";
		if (hostname)
		    args = [hostname];
		else {
		    if (os == winnt)
			args = ["-a"];
		    else
			args = ["-an"]; // add n because otherwise it can take forever..
		}

	    } else if (os == android || os == linux) {
		cmd = "ip";
		args = ['neigh','show'];
		if (hostname) {
		    args.append('to');
		    args.append(hostname);
		}

	    } else {
		callback({error: "getArpCache not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }		

	    function cbk(info) {
      		var output = {
      		    name: "arpCache",
      		    os: os,
		    cmd : cmd+ " " + args.join(" "),
      		};

      		var data = libParse2(output, info);
		if (!data.error && hostname) {
		    // query was for a single host
		    var h = (data.entries.length == 1 ? data.entries[0] : undefined);
		    if (h) {
			h.ip = hostname;
			h.__exposedProps__['ip'] = 'r';
			h.meta = data.meta;
			h.__exposedProps__['meta'] = 'r';
			callback(h);
		    } else {
			callback({error: "no such host in the arp cache : " + hostname, 
				  __exposedProps__: {error: "r"}});
		    }
		} else {
		    // error or requested all entries
      		    callback(data);
		}
	    }
      	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getArpcache

	/**
	 * @method getRoutingTable
	 * @static
	 *
	 * @description This function retrieves the client's current routing table.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */       
	getRoutingTable : function(callback) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == winnt) {
		cmd = "route";
		args = ["print"];

	    } else if (os == linux || os == darwin) {
		cmd = "netstat";
		args = ["-rn"];

	    } else if(os == android) {
		cmd = "cat";
		args = ["/proc/net/route"];

	    } else {
		callback({error: "getRoutingTable not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "routingInfo",
      		    os: os,
		    cmd : cmd+ " " + args.join(" "),
      		};
      		var data = libParse2(output, info);
      		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	},

	/** 
	 * @method getWifiInfo
	 * @static
	 *
	 * @description This function gets the list of nearby wireless access points.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {number} timeout The delay between scan start and second call
	 * to fetch the results (on most OSs the first scan cmd invocation does not return
	 * the full list of nearby cells or as on android we need two separate calls
	 * in anycase).
	 */
	getWifiInfo : function(callback, timeout) {
	    var that = ctx;
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];
	    var timeout = timeout || 2500; // ms

	    if (os == winnt) {
		cmd = "netsh";
		args = ["wlan", "show", "networks","bssid"];

	    } else if (os == linux) {
		cmd = "iwlist";
		args = ["scan"];

	    } else if (os == darwin) {
      		cmd = airport;
		args = ["-s"];

	    } else if(os == android) {
		// wpa_cli is available on some devices, trigger new scan, then request the list
		cmd = "wpa_cli";
		args = ["scan"];

	    } else {
		callback({error: "getWifiInfo not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }


	    var timer = undefined;
	    var first = true;
	    
	    function cbk(info) {
      		var output = {
      		    name: "wifiInfo",
      		    os: os,
		    cmd : cmd + " " + args.join(" "),
      		};

      		var data = libParse2(output, info);
		if (first) {
		    if (data && !data.error) {
			if (os == android) {
			    // android has a different command to fetch the results
			    cmd = "wpa_cli";
			    args = ["scan_results"];
			} // on other platforms just re-fetch the updated list

			first = false;
			if (timeout>0) {
			    // delay timeout ms to get more scanning results
			    timer = setTimeoutTimer(function() {
				that._executeCommandAsync(cbk, cmd, args);
			    }.bind(that), timeout);
			} else {
			    that._executeCommandAsync(cbk, cmd, args);
			}

		    } else {
			// some error on first call
      			callback(data);
			first = false;
		    }
		} else {
		    // 2nd time - final results
      		    callback(data);
		    timer = undefined;
		}
	    }; // cbk
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getWifiInfo

	/**
	 * @method getIfaceStats
	 * @static
	 *
	 * @description This function retrieves interface performance
	 * counters (bytes, packets, errors, etc).
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */       
	getIfaceStats : function(callback, iface) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == winnt) {
		var cmd = "netstat";
		var args = ["-e"];

	    } else if (os == linux || os == android) {
		cmd = "cat";
		args = ["/proc/net/dev"];

	    } else if (os == darwin) {
		cmd = "netstat";
		args = ["-bi"];
		if (iface) {
		    args.push("-I " + iface);
		}

	    } else {
		callback({error: "getIfaceStats not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
		if (!iface) {
		    // check for the last known iface 
		    var file = FileUtils.getFile("ProfD", ["baseline_endhost.sqlite"]);
		    var db = Services.storage.openDatabase(file);		  
		    var data = "";
		    
		    try {
			var q1 = "SELECT * FROM endhost ORDER BY id DESC LIMIT 1";
			var statement = db.createStatement(q1);
			if (statement.executeStep()) {
			    data = statement.getString(1);
			}
		    } catch(e) {
			dump(e);
		    } finally {
			statement.reset();
		    }
		    
		    if (data && data.length>0) {
      			// get the top most entry in the db
			var dataobj = JSON.parse(data);
			if (dataobj.interface) {
      			    iface = dataobj.interface.current;
			}
		    }

		    if (!iface) {
			callback({
			    error: "getIfaceStats failed to find active interface, got " + data, 
			    __exposedProps__: {error: "r"}});
			return;
		    }
		}

		var output = {
		    name: "interfaceStats",
		    os: os,
		    params: [iface],
		    cmd : cmd + " " + args.join(" "),
		};	    
		var data = libParse2(output, info);
		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getIfaceStats

	/**
	 * @method getWifiStats
	 * @static
	 *
	 * @description This function retrieves link quality parameters
	 * for WiFi interfaces.
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {string} name Optional wireless inteface name if the system
	 * has multiple wireless interfaces.
	 */   
	getWifiStats : function(callback, name) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    var params = [];
	    if (name)
		params.push(name);

	    if (os == winnt) {
      		//netsh wlan show networks mode=bssi
		cmd = "netsh";
		args = ["wlan", "show", "interface"];

	    } else if (os == linux || os == android) {
		cmd = "cat";
		args = ["/proc/net/wireless"];

	    } else if (os == darwin) {
		cmd = airport;
		args = ["-I"];

	    } else {
		callback({error: "getWifiStats not available on " + os,
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {      
      		var output = {
		    name: "wifiStats",
		    os: os,
		    params : params,
		    cmd : cmd + " " + args.join(" "),
		};
		var data = libParse2(output, info);
		callback(data);
	    }
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getWifiStats

	/**
	 * @method getLoad
	 * @static
	 *
	 * @description This function retrieves the client's current system load via "top".
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */       
	getLoad : function(callback) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == linux){
		cmd = "top";
		args = ['-b', '-n1'];

	    } else if (os == darwin) {
		cmd = "top";
		args = ["-l2", "-n1"];

	    } else if (os == android) {
		cmd = "top";
		args = ['-n', '1', '-m', '1'];

	    } else {
		callback({error: "getLoad not available on " + os, 
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
      		var output = {
      		    name: "loadInfo",
      		    os: os,
		    cmd : cmd+ " " + args.join(" "),
      		};

      		var data = libParse2(output, info);
      		callback(data);
	    };
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getLoad
	
	/**
	 * @method getMemInfo
	 * @static
	 *
	 * @description This function retrieves the client's current memory load via "proc".
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */
	getMemInfo: function (callback) {
	    var os = ctx.os;
	    var cmd = undefined;
	    var args = [];

	    if (os == linux || os == android) {
		cmd = "cat";
		args = ['/proc/meminfo'];

	    } else if (os == winnt) {
		cmd = "systeminfo";
		args = [];

	    } else {
		callback({error: "getMemInfo not available on " + os,
			  __exposedProps__: {error: "r"}});
		return;
	    }
	    
	    function cbk(info) {
		var output = {
		    name: "memInfo",
		    os: os,
		    cmd : cmd + " " + args.join(" "),
		};

		var data = libParse2(output, info);
		callback(data);
	    }
	    
	    ctx._executeCommandAsync(cbk, cmd, args);
	}, // getMemInfo
	
	/**
	 * @method getProxyInfo
	 * @static
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 *
	 * @param {string} url The URL for which the function looks up the
	 * applicable proxy configuration.
	 *
	 * @return {dictionary} The result describes the proxy.  For
	 * explanation of the dictionary keys, see
	 * <a href='https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIProxyInfo'>MDN</a>.
	 */
	getProxyInfo : function (callback, url) {
	    var proxy = {
      		host : null,
      		port : null,
      		type : null,
      		flags : null,
      		next : null,
      		failoverProxy : null,
      		failoverTimeout : null,
      		__exposedProps__: {
		    host : "r",
		    port : "r",
		    type : "r",
		    flags : "r",
		    next : "r",
		    failoverProxy : "r",
		    failoverTimeout : "r"
		}
	    };
	    var nextproxy = null, failoverproxy = null;
	    
	    var protocolProxyService = Cc["@mozilla.org/network/protocol-proxy-service;1"]
		.getService(Ci.nsIProtocolProxyService);
	    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

	    try {
		var uri = ioService.newURI(url, null, null);
	    } catch (e) {
		return proxy;
	    }

	    var proxyInfo = protocolProxyService.resolve(uri, 0);
	    if (proxyInfo) {	    
		if (proxyInfo.failoverProxy) {
		    failoverproxy = {
			host : proxyInfo.failoverProxy.host,
			port : proxyInfo.failoverProxy.port,
			type : proxyInfo.failoverProxy.type,
			flags : proxyInfo.failoverProxy.flags,
			next : proxyInfo.failoverProxy.next ? proxyInfo.failoverProxy.next.host : "null",
			failoverProxy : proxyInfo.failoverProxy.failoverProxy ? proxyInfo.failoverProxy.failoverProxy.host : "null",
			failoverTimeout : proxyInfo.failoverProxy.failoverTimeout,
			__exposedProps__: {
			    host : "r",
		  	    port : "r",
		  	    type : "r",
		  	    flags : "r",
		  	    next : "r",
		  	    failoverProxy : "r",
		  	    failoverTimeout : "r"
			}
		    };
		}
		
		if (proxyInfo.next) {
		    nextproxy = {
			host : proxyInfo.next.host,
			port : proxyInfo.next.port,
			type : proxyInfo.next.type,
			flags : proxyInfo.next.flags,
			next : proxyInfo.next.next ? proxyInfo.next.next.host : "null",
			failoverProxy : proxyInfo.next.failoverProxy ? proxyInfo.next.failoverProxy.host : "null",
			failoverTimeout : proxyInfo.next.failoverTimeout,
			__exposedProps__: {
			    host : "r",
		  	    port : "r",
		  	    type : "r",
		  	    flags : "r",
		  	    next : "r",
		  	    failoverProxy : "r",
		  	    failoverTimeout : "r"
			}
		    };
		}
		
		proxy.host = proxyInfo.host;
		proxy.port = proxyInfo.port;
		proxy.type = proxyInfo.type;
		proxy.failoverTimeout = proxyInfo.failoverTimeout;
		proxy.flags = proxyInfo.flags;
		proxy.next = nextproxy;
		proxy.failoverProxy = failoverproxy;
	    }

	    callback(proxy);
	}, // getProxyInfo
	
	/**
	 * @method getBrowserMemoryUsage
	 * @static
	 *
	 * @param {function} callback The callback Fathom invokes once the
	 * call completes. On error contains "error" member.
	 */
	getBrowserMemoryUsage: function(callback) {
	    var mgr = Cc["@mozilla.org/memory-reporter-manager;1"]
		.getService(Ci.nsIMemoryReporterManager);
	    var e = mgr.enumerateReporters();
	    while (e.hasMoreElements()) {
		var mr = e.getNext().QueryInterface(Ci.nsIMemoryReporter);
		if(mr.path == "resident") {
		    break;
		}
	    }
	    var val = {
		memoryUsage: (mr.amount/(1024 * 1024)).toFixed(3), 
		time: Date.now(),
		__exposedProps__ : {
		    memoryUsage : 'r',
		    time : 'r',
		}
	    };
	    callback(val);
	}
    }; // System object
}; // anon function