// Module API
var EXPORTED_SYMBOLS = ["mDNS"];

Components.utils.import("resource://fathom/DNS/coreDNS.jsm");
Components.utils.import("resource://fathom/Logger.jsm");	

// mDNS well-known values
const MDNS_DEST_ADDR = '224.0.0.251';
const MDNS_DEST_PORT = 5353;
const DNSSD_DOMAIN = "_services._dns-sd._udp.local.";

function mDNS(ctx) {
    this.context = ctx;
    this.fathom = ctx.api;
    return this;
};

mDNS.prototype = {
    context : null,    
    cleanup : null,
    fathom : null,

    close : function(cb) {
	var self = this;

	// cleanup all pending dns requests
	_.each(cleanup, function(s) {
	    self.fathom.socket.multicast.recvfromstop(function() {
		self.fathom.socket.multicast.close(function() {}, s);
		s = null;
	    }, s);
	});

	this.cleanup = {};
	if (cb && typeof cb === 'function')
	    cb();
    },

    discovery : function(cb) {
	var that = this;

	var cache = {};    // fullname -> mdns record
	var ipcache = {};  // hostname -> ip address
	var ipv6cache = {};  // hostname -> ipv6 address
	
	var cache_update = function(ans,rhost) {
	    var fullname = undefined;
	    if (ans.recordType === DNSRecordType.PTR) {
		fullname = ans.alias;
		if (!cache[fullname]) {
		    cache[fullname] = { proto : 'mdns',
					servicename : fullname,
				        ipv4 : rhost };
		}
		
	    } else {
		fullname = ans.name;
		var record = cache[fullname];
		if (!record) {
		    record = {proto : 'mdns',
			      servicename : fullname,
			      ipv4 : rhost };		    
		} else if (record.done) {
 		    Logger.warn("received more data on record already called back ...");
		    record.done = false;
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
			record['text'].indexOf('Mac')>=0) {
 			record['os'] = 'darwin';
		    }
		    break;
		case DNSRecordType.SRV:
		    record['port'] = ans.port;
		    record['hostname'] = ans.target;
		    break;
		default:
		    // we should not really see other types in mDNS
		    Logger.warn('Unhandled recordType: ' + ans.recordType);
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

	var handle_send = function(id) {
	    return function(r) {
		if (r && r.error) {
		    Logger.error("Failed to send mDNS request ["+id+"]: " + r.error);
		    if (cleanup[id]) {
			self.fathom.socket.multicast.close(function() {}, cleanup[id]);
			delete cleanup[id];
		    }
		}
	    }; // return
	};
	
	var handle_ans = function(id) {
	    return function(ans) {
		if (!cleanup[id]) { // should not happen?
		    Logger.error("Received answer for cleaned dns object [" + id +"]?!?");
		    return;
		}

		var rhost = ans.address;

		// handle response records
		var buf = ans.data;
		var i = 0;
		while (i < buf.length) {
		    var resp = new Response(buf, 'mcast', i, buf.length);
		    var id = resp.readUnsignedShort();		    
		    var robj = new DNSIncoming(flags, 
					       id, 
					       true, 
					       resp, 
					       undefined);

		    var dlist = [];
		    for (var j = 0; j < robj.answers.length; j++) {
			var absobj = robj.answers[j];
			if (ansobj.name === DNSSD_DOMAIN && 
			    ansobj.recordType === DNSRecordType.PTR)
			{
			    // gloabl service search response
			    dlist.push(ansobj.alias);
			} else {
			    // update result cache
			    fn = cache_update(ansobj,rhost);
			}); // each
		    
		    if (dlist.length>0) {
			do_query(dlist, DNSRecordType.ANY);
		    }
		    i = resp.idx;
		} // while

		// purge new data
		if (!_.isEmpty(cache)) {
		    for (var fullname in cache) {
			var e = cache[e];
			if (!e.done) {
			    if (!e.hostname)
				e.hostname = e.servicename
			    // make sure the entry has IP info
			    if (!e.ipv4)
				e.ipv4 = ipcache[e.hostname]
			    if (!e.ipv6)
				e.ipv6 = ipv6cache[e.hostname]

			    if (e.ipv4) {
				cb(e);
				e.done = true;
				// TODO: notify fathom ctx that we have found
				// a new potential target through mdns

			    } // else not so usefull
			}
		    }
		};
	    }; // return func
	}; // handle_ans

	var do_query = function(domain, type) {
	    var curridx = idx;
	    var onSend = handle_send(curridx);
	    var onReceive = handle_ans(curridx);

	    Logger.debug('mdns lookup ' + domain + " type=" +type+ " [" + curridx + "]");

	    idx += 1; // next

	    // create and send the query
	    var flags = DNSConstants.FLAGS_QUERY;
	    var out = new DNSOutgoing('mcast', flags, true);
	    out = out.createRequest(domain, type, DNSRecordClass.CLASS_IN);
	    var query = out.getHexString();

	    that.fathom.socket.multicast.open(function(s) {
		if (s && s.error) {
		    onSend({ error : "failed to open multicast dns socket: " + s.error});
		    return;
		}
		cleanup[curridx] = s; // for resp handling and cleanup
		that.fathom.socket.multicast.sendto(onSend, 
						    s, 
						    query, 
						    MDNS_DST_ADDR, 
						    MDNS_DST_PORT);

		that.fathom.socket.multicast.recvfromstart(onReceive, s);
	    });
	}; // do_query

	// make sure there's no previous requests running
	this.close(function() {
	    // start with root dnssd service search
	    do_query(DNSSD_DOMAIN, DNSRecordType.PTR);
	});
    };
};