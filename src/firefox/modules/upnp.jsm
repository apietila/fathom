// Module API
var EXPORTED_SYMBOLS = ["Upnp"];

Components.utils.import("resource://fathom/Logger.jsm");	
Components.utils.import("resource://fathom/utils.jsm");

const SSDP_PORT = 1900;
const SSDP_MCAST_ADDR = "239.255.255.250";
const SSDP_MSEARCH = 
    "M-SEARCH * HTTP/1.1\r\n"+
    "HOST:"+SSDP_MCAST_ADDR+":"+SSDP_PORT+"\r\n"+
    "ST:ssdp:all\r\n"+
    "MAN:\"ssdp:discover\"\r\n"+
    "MX:10\r\n\r\n";

const SSDP_ALIVE = 'ssdp:alive';
const SSDP_BYEBYE = 'ssdp:byebye';
const SSDP_UPDATE = 'ssdp:update';

// Map SSDP notification sub type to emitted events 
const UPNP_NTS_EVENTS = {
    'ssdp:alive': 'DeviceAvailable',
    'ssdp:byebye': 'DeviceUnavailable',
    'ssdp:update': 'DeviceUpdate'
};

const SSDP_IGW = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1';

const protoid = {
    name : 'mdns',
    address : SSDP_MCAST_ADDR,
    port : SSDP_PORT
};

// upnp answer record returned by the discovery callback
function Record() {
    this.proto = 'upnp';
    return this;
};
Record.prototype = {
    proto : null,
    device : null,
    ssdp : null,
    ipv4 : null,
    __exposedProps__: {
	proto : 'r',
	ipv4 : 'r',
	ssdp : 'r',
	device : 'r'
    }
};

function error(err) {
    return { error : err, __exposedProps__: { error : 'r'} };
};

function Upnp(ctx) {
    this.context = ctx;
    this.fathom = ctx.api;
    return this;
};

Upnp.prototype = {
    context : null,    
    fathom : null,
    ss : null,      // multicast socket
    cleanup : null, // tmp tcp sockets

    close : function(cb) {
	var self = this;
	var s = self.ss;
	if (s) {
	    self.fathom.socket.multicast.recvfromstop(function() {
		self.fathom.socket.multicast.close(function() {
		}, s);
	    }, s);
	}
	self.ss = undefined;

	// cleanup all pending http requests
	for (var d in self.cleanup) {
	    if (!self.cleanup[d].pending)
		self.fathom.socket.tcp.closeSocket(
		    function() {}, self.cleanup[d]);
	}
	self.cleanup = {};

	if (cb && typeof cb === 'function')
	    cb();
    },

    discovery : function(cb) {
	var self = this;

	// helper to read http device descriptions
	var getxml = function(url, ucb) {
	    var tmp = url.split('/');
	    var msg = "GET /"+tmp[tmp.length-1]+" HTTP/1.1\r\n\r\n";
	    Logger.debug("Upnp getxml: " + msg);

	    tmp = tmp[2].split(':');
	    var ip = tmp[0];
	    var port = parseInt(tmp[1]);
	    var rinfo = {host : ip, port : port};

	    Logger.debug("Upnp getxml: " + ip + ":" + port);

	    if (self.cleanup[ip]) {
		Logger.debug("Upnp getxml: pending");
		ucb("",rinfo);
		return; // req done
	    }

	    self.cleanup[ip] = {pending:true};


	    self.fathom.socket.tcp.openSendSocket(function(s) {
		if (s && s.error) {
		    Logger.debug("Upnp getxml "+ip+" open fail: "+s.error);
		    self.cleanup[ip] = undefined;
		    ucb(undefined,rinfo);
		    return;
		}
		self.cleanup[ip] = s;
	    
		self.fathom.socket.tcp.send(function(res) {}, s, msg); // send

		var xml = '';
		var recvloop = function() {
		    self.fathom.socket.tcp.receive(function(res) {
			if (!res || res.error) {
			    Logger.debug("Upnp getxml "+ip+" recv fail: "+
					 res.error);
			    self.fathom.socket.tcp.closeSocket(function() {}, s);
			    self.cleanup[ip] = undefined;
			    ucb(undefined,rinfo);
			    return;
			}		    
			//Logger.debug(res);
			
			var idx = res.indexOf('<?xml version');
			if (idx>=0) {
			    xml = res.substring(idx);
			} else {
			    xml += res;
			}
		    
			idx = xml.indexOf('</root>');
			if (idx>=0) {
			    self.fathom.socket.tcp.closeSocket(function(){}, s);
			    self.cleanup[ip] = undefined;
			    ucb(xml, rinfo);
			} else {
			    recvloop();
			}    
		    }, s, true); // receive		
		};
		recvloop();
	    }, ip, port); // open
	}; // getxml 

	var handle_send = function(r) {
	    if (r && r.error) {
		cb(error("failed to send UPnP request: " + r.error));
	    }
	};

	var handle_ans = function(res) {
	    if (res && res.error) {
		Logger.warning("Upnp receive error: " + res.error);
		return;
	    }

	    var lines = res.data.split('\r\n');
	    var headers= {};
	    for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		var idx = line.indexOf(':');
		if (idx > 0) {
		    var k = line.substring(0,idx).toLowerCase();
		    var v = line.substring(idx+2);
		    headers[k] = v;
		}
	    }
	    
	    Logger.debug(JSON.stringify(headers,null,4));

	    if (headers.location) {
		getxml(
		    headers.location, 
		    function(obj, rinfo) {
			if (obj && !obj.error && rinfo) {
			    var resobj = new Record();	
			    // this is the raw xml descriptor
			    resobj.device = obj;
			    resobj.ipv4 = rinfo.host;
			    resobj.ssdp = headers;

			    // mark all properties readable
			    var tmp = {}
			    for (var n in resobj.ssdp) {
				if (resobj.ssdp.hasOwnProperty(n))
				    tmp[n] = 'r';
			    }
			    resobj.ssdp.__exposedProps__ = tmp;

			    // register the new device with 
			    // the extension
			    self.context._addNewDiscoveredDevice(
				resobj, protoid);
			    cb(resobj);
			}
		    }); // getxml		
	    } else {
		Logger.debug("Upnp got invalid response : " + res.data);
	    }
	}; // handle ans	

	// start by making sure any previous pending request is
	// cleaned up
	self.close(function() {
	    self.ss = undefined;
	    self.cleanup = {};

	    self.fathom.socket.multicast.open(function(s) {
		if (s && s.error) {
		    cb(error("failed to open UPnP socket: " + r.error));
		    return;
		}

		// store socket handle for close
		self.ss = s;
		    
		// FIXME could think of a nicer way to allow internal modules to
		// get around the security module...

		// call socket usage directly to avoid destination permission
		// checks - if user allowed UPnP proto, we also allow 
		// communcations to the reserved UPnP multicast group:port
		self.context._doSocketUsageRequest(handle_send, 'udpSendto', 
						   [self.ss,
						    SSDP_MSEARCH, 
						    SSDP_MCAST_ADDR, 
						    SSDP_PORT]);

		//fathom.socket.multicast.sendto(
		//    handle_send, 
		//    self.ss, 
		//    SSDP_MSEARCH, 
		//    SSDP_MCAST_ADDR, 
		//    SSDP_PORT);

		// start receiving data
		self.fathom.socket.multicast.recvfromstart(handle_ans, self.ss, true);

	    }); // open
	}); // close
    } // discovery
}; // prototype
