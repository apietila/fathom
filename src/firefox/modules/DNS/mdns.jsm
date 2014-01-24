// Module API
var EXPORTED_SYMBOLS = ["mDNS"];

Components.utils.import("resource://fathom/DNS/coreDNS.jsm");
Components.utils.import("resource://fathom/Logger.jsm");	

// mDNS well-known values
const MDNS_DEST_ADDR = '224.0.0.251';
const MDNS_DEST_PORT = 5353;
const DNSSD_DOMAIN = "_services._dns-sd._udp.local.";

const protoid = {
    name : 'mdns',
    address : MDNS_DEST_ADDR,
    port : MDNS_DEST_PORT
};

// mDNS answer record returned by the discovery callback
function Record() {
    this.proto = 'mdns';
    return this;
};
Record.prototype = {
    proto : null,
    servicename : null,
    ipv4 : null,
    ipv6 : null,
    os : null,
    text : null,
    port : null,
    hostname : null,
    __exposedProps__: {
	proto : 'r',
	servicename : 'r',
	ipv4 : 'r',
	ipv6 : 'r',
	os : 'r',
	text : 'r',
	port : 'r',
	hostname : 'r',
    }
};

function mDNS(ctx) {
    this.context = ctx;
    this.fathom = ctx.api;
    return this;
};

mDNS.prototype = {
    context : null,    
    fathom : null,
    cleanup : null,

    close : function(cb) {
	var self = this;

	var close = function(s) {
	    if (s) {
		self.fathom.socket.multicast.recvfromstop(function() {
		    self.fathom.socket.multicast.close(function() {}, s);
		}, s);
	    }
	}

	// cleanup all pending mdns requests
	for (var d in self.cleanup) {
	    close(self.cleanup[d]);
	}
	self.cleanup = {};
	if (cb && typeof cb === 'function')
	    cb();
    },

    discovery : function(cb) {
	var self = this;

	var idx = 0;
	var cache = {};    // service -> mdns record
	var ipcache = {};  // hostname -> ip address
	var ipv6cache = {};  // hostname -> ipv6 address
	var cbdone = {};
	
	var cache_update = function(ans,rhost) {
	    var fullname = undefined;
	    if (ans.recordType === DNSRecordType.PTR) {
		fullname = ans.alias;
		if (!cache[fullname]) {
		    cache[fullname] = new Record();
		    cache[fullname].servicename = fullname;
		    cache[fullname].ipv4 = rhost;
		    cbdone[fullname] = false;
		}
	    } else {
		fullname = ans.name;

		var record = cache[fullname];

		if (!record) {
		    record = new Record();
		    record.servicename = fullname;
		    record.ipv4 = rhost;  
		    cbdone[fullname] = false;
		} else if (cbdone[fullname]) {
 		    Logger.warn("mDNS: received more data for record already called back!?!");
		    cbdone[fullname] = false;
		};

		if (fullname.indexOf('printer')>=0) {
 		    record['os'] = 'printer';
		} else if (fullname.indexOf('airport')>=0) {
 		    record['os'] = 'airport';
		}

		switch (ans.recordType) {
		case DNSRecordType.A:
		    record['ipv4'] = ans.address;
		    break;
		case DNSRecordType.AAAA:
		    record['ipv6'] = ans.address;
		    break;
		case DNSRecordType.TXT:
		    record['text'] = ans.text;
		    // OS X leaks info this way
		    if (fullname.indexOf('device-info')>=0 && 
			record['text'].indexOf('Mac')>=0) 
		    {
 			record['os'] = 'darwin';
		    }
		    break;
		case DNSRecordType.SRV:
		    record['port'] = ans.port;
		    record['hostname'] = ans.target;
		    if (ans.target.indexOf('Mac')>=0) {
 			record['os'] = 'darwin';
		    } else if (ans.target.toLowerCase().indexOf('android')>=0) {
 			record['os'] = 'android';
		    } else if (ans.target.toLowerCase().indexOf('linux')>=0) {
 			record['os'] = 'linux';
		    }
		    break;
		default:
		    // we should not really see other types in mDNS
		    Logger.warn('mDNS: unhandled recordType: ' + ans.recordType);
		    break;
		}

		// update ip caches
		if (record.hostname && record.ipv4)
		    ipcache[record.hostname] = record.ipv4;

		if (record.hostname && record.ipv6)
		    ipv6cache[record.hostname] = record.ipv6;

		cache[fullname] = record;
	    }
	    return fullname;
	};

	var handle_send = function(r) {
	    if (r && r.error) {
		Logger.error("mDNS: failed to send mDNS request " + r.error);
	    }
	};
	
	var handle_ans = function(ans) {
	    Logger.debug("mDNS: response from " + ans.address);
	    var rhost = ans.address; // ipv4
	    var buf = ans.data; // bytes
	    var i = 0;
	    while (i < buf.length) {
		var resp = new Response(buf, 'udp', i, buf.length);
		var id = resp.readUnsignedShort();
		var flags = resp.readUnsignedShort();		    
		var robj = new DNSIncoming(flags, 
					   id, 
					   true, 
					   resp, 
					   undefined);

		var dlist = [];
		for (var j = 0; j < robj.answers.length; j++) {
		    var ansobj = robj.answers[j];
		    if (ansobj.recordType === DNSRecordType.PTR) {
			// gloabl service search response
			dlist.push(ansobj.alias);
		    } else {
			// update result cache
			fn = cache_update(ansobj,rhost);
		    }
		}
		    
		if (dlist.length>0) {
		    // request more details on the pointers returned
		    // by the initial service search query
		    do_query(dlist, DNSRecordType.ANY);
		}
		i = resp.idx; // this is the next index to read from buf
	    } // while

	    for (var fullname in cache) {
		var e = cache[fullname];
		if (!cbdone[fullname]) {
		    if (!e.hostname)
			e.hostname = e.servicename
		    if (!e.ipv4)
			e.ipv4 = ipcache[e.hostname]
		    if (!e.ipv6)
			e.ipv6 = ipv6cache[e.hostname]
		    
		    if (e.ipv4 && e.hostname!==e.servicename) {
			Logger.debug("mDNS: found " + e.servicename + " [" + e.ipv4 + "]");
			
			// register the device with the extension for security check
			self.context._addNewDiscoveredDevice(e, protoid);
			
			// notify the caller
			cb(e);
			
			cbdone[fullname] = true;
		    } // else not so usefull
		}
	    };
	}; // handle_ans

	var do_query = function(domain, type) {
	    Logger.debug('mDNS: lookup ' + domain + " type=" +type);

	    self.fathom.socket.multicast.open(function(s) {
		if (s && s.error) {
		    Logger.error("mDNS: failed to open mDNS socket " + r.error);
		    return;
		}

		self.cleanup[idx] = s;
		idx += 1;

		var out = new DNSOutgoing('mcast', DNSConstants.FLAGS_QUERY, true);
		out = out.createRequest(domain, type, DNSRecordClass.CLASS_IN);

		self.fathom.socket.multicast.sendto(handle_send, 
						    s, 
						    out.getHexString(), 
						    MDNS_DEST_ADDR, 
						    MDNS_DEST_PORT);

		self.fathom.socket.multicast.recvfromstart(handle_ans, s);
	    }); // open
	}; // do_query
	
	self.close(function() {
	    // start with root dnssd service search
	    do_query(DNSSD_DOMAIN, DNSRecordType.PTR);
	});
    }, // discovery
}; // prototype