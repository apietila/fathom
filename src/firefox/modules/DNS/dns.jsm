// Module API
var EXPORTED_SYMBOLS = ["DNS"];//, "DNS_TCP", "DNS_UDP", "DNS_MCAST"];

Components.utils.import("resource://fathom/DNS/coreDNS.jsm");
Components.utils.import("resource://fathom/Logger.jsm");

const MCAST = 'mcast';
const UDP = 'udp';
const TCP = 'tcp';

function DNS(proto, fathomObj, dst, port) {
    this.protocol = proto;
    this.fathom = fathomObj;
    this.destination = dst;
    this.port = port;

    // network protocol obj
    var obj = null;
    switch (proto) {
    case MCAST:
	obj = new DNS_MCAST(this);
	break;
    case UDP:
	obj = new DNS_UDP(this);
	break;
    case TCP:
	obj = new DNS_TCP(this);
	break;
    default:
	break;
    }
    this.proto = obj;

    return this;
}

DNS.prototype = {	
    fathom : null,
    proto: null,
    protocol: null,
    destination : null,
    port : null,

    isMcast : function() {
	return (this.protocol === MCAST);
    },
    isTCP : function() {
	return (this.protocol === TCP);
    },

    /** Create a new DNS query payload. */
    query : function(domain, type, recordClass, fl) {
	var flags = (fl ? fl : DNSConstants.FLAGS_QUERY);
	var out = new DNSOutgoing(this.protocol, flags, this.isMcast());
	out = out.createRequest(domain, type, recordClass);
	return out.getHexString();
    },
    
    /** Parse DNS response payload, callsback per answer line. */
    response : function(buf, domain, callback) {
	var i = 0;
	while(i < buf.length) {
	    if (this.isTCP())
		buf = buf.slice(2); // ignore the len bytes

	    var resp = new Response(buf, this.protocol, i, buf.length);
	    var id = resp.readUnsignedShort();
	    var flags = resp.readUnsignedShort();
	    //Logger.debug("Flag = " + flags)

	    var newQuery = new DNSIncoming(flags, 
					   id, 
					   this.isMcast(), 
					   resp, 
					   domain);

	    // FIXME: I think we do this just to pass the object without 
	    // using __exposedProps__ everywhere but just makes us
	    // do obj -> string -> obj in practize so quite inefficient...
	    newQuery = JSON.stringify(newQuery);
	    callback(newQuery, domain);
	    i = resp.idx;
	}
    },
};

function DNS_TCP(dnsObj) {
    this.dns = dnsObj;
    this.fathom = dns.fathom;
}

DNS_TCP.prototype = {
    dns: null,
    fathom: null,
    socket: null,
    // TODO: remove ?
    recvInterval: null,
	
    close : function() {
	if (this.socket) {
	    self.fathom.socket.tcp.close(function() {},this.socket);
	    this.socket = null;
	}
    },

    sendRecv : function(DESC_ADDR, DESC_PORT, DESC_DATA, recordTCPSend, recordTCPReceive) {
	var tcpsocketid = null;
	var self = this;
		
	function sendSocketOpened(openedsocketid) {
	    if(openedsocketid && openedsocketid['error']) {
		recordTCPSend({ error : "failed to open tcp dns socket: " + 
				openedsocketid.error});
		return;
	    }

	    tcpsocketid = openedsocketid;
	    self.socket = tcpsocketid;
	    self.fathom.socket.tcp.send(recordTCPSend, tcpsocketid, DESC_DATA);
	    receive();
	}
		
	function receive() {
	    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components.interfaces.nsIWindowMediator);  
	    var mainWindow = wm.getMostRecentWindow("navigator:browser");
	    
	    // TODO: why not setTimeout or just receivestart until we hear something ... ?
	    var id = mainWindow.setInterval(function () {	
		if(!self.socket)
		    return;
 		mainWindow.clearInterval(id);

		//function receiveMsg(tcpsocketid) {
		self.fathom.socket.tcp.receive(recordTCPReceive, self.socket);
		//}
		
		/*self.recvInterval = mainWindow.setInterval(function() {
		  var tcpsocketid = self.socket;
		  if(tcpsocketid)
		  receiveMsg(tcpsocketid);
		  else {
		  mainWindow.clearInterval(self.recvInterval);
		  }
		  }, 2500);*/
	    }, 250);
	}
		
	self.fathom.socket.tcp.openSendSocket(sendSocketOpened, DESC_ADDR, DESC_PORT);	
    },

    sendRecvNew : function(SEND_DATA, onSend, onReceive) {
	var self = this;

	var send = function() {
	    self.fathom.socket.tcp.send(
		onSend,
		self.socket, 
		SEND_DATA);
	    
	    self.fathom.socket.tcp.recvfromstart(onReceive, self.socket);
	};

	if (self.socket) {
	    self.fathom.socket.tcp.recvfromstop(send, self.socket);
	} else {
	    // lazy open the socket
	    self.fathom.socket.tcp.openSendSocket(function(s) {
		if (s && s.error) {
		    onSend({ error : "failed to open tcp dns socket: " + s.error});
		    return;
		}	
		self.socket = s;    
		send();
	    }, self.dns.destination, self.dns.port);
	}
    }, // sendRecvNew
};

function DNS_UDP(dnsObj) {
    this.dns = dnsObj;
    this.fathom = dnsObj.fathom;
}

DNS_UDP.prototype = {
    dns: null,
    fathom: null,
    socket: null,

    // TODO: remove ?
    window: null,
    intervalid: null,
    SEND_INTERVAL_MILLISECONDS: 250,

    // stop receiving any more responses from this socket
    close : function() {
	var that = this;
	if (that.socket) {
	    that.fathom.socket.udp.recvfromstop(function() {
		that.fathom.socket.udp.close(function() {}, that.socket);
		that.socket = null;
	    },that.socket);
	}
    },
    
    // Unicast UDP request-response
    sendRecv: function(DEST_ADDR, DEST_PORT, SEND_DATA, recordUDPSend, recordUDPReceive) {
	var self = this;
		
	function sendUDP() {
	    if (self.intervalid)
		self.window.clearInterval(self.intervalid);

	    self.fathom.socket.udp.sendto(recordUDPSend, 
					  self.socket, 
					  SEND_DATA, 
					  DEST_ADDR, 
					  DEST_PORT);

	    self.fathom.socket.udp.recvfromstart(recordUDPReceive, self.socket);
	}
	
	function sendSockCreated(result) {
	    if (result && result.error) {
		recordUDPSend({ error : "failed to open udp dns socket: " + result.error});
		return;
	    }

	    self.socket = result;

	    if (!self.window) { // lazy init
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]  
		    .getService(Components.interfaces.nsIWindowMediator);  
		self.window = wm.getMostRecentWindow("navigator:browser");
	    }

	    // FIXME: why not a setTimeout and anyways why would we need this ?
	    self.intervalid = self.window.setInterval(sendUDP, 
						      self.SEND_INTERVAL_MILLISECONDS);
	}
	
	self.fathom.socket.udp.open(sendSockCreated);

    }, // sendRecv

    sendRecvNew : function(SEND_DATA, onSend, onReceive) {
	var self = this;

	var send = function() {
	    self.fathom.socket.udp.sendto(
		onSend,
		self.socket, 
		SEND_DATA, 
		self.dns.destination,
		self.dns.port);
	    
	    self.fathom.socket.udp.recvfromstart(onReceive, self.socket);
	};

	if (self.socket) {
	    self.fathom.socket.udp.recvfromstop(send, self.socket);
	} else {
	    // lazy open the socket
	    self.fathom.socket.udp.open(function(s) {
		if (s && s.error) {
		    onSend({ error : "failed to open udp dns socket: " + s.error});
		    return;
		}
		self.socket = s;    

		// bind any:*port
		self.fathom.socket.udp.bind(function(r) {
		    if (r && r.error) {
			onSend({ error : "failed to bind udp dns socket: " + s.error});
			return;
		    }
		    send();
		}, self.socket, 0, self.dns.port); 
	    });
	}
    }, // sendRecvNew

} // DNS_UDP

function DNS_MCAST(dnsObj) {
    this.dns = dnsObj;
    this.fathom = dnsObj.fathom;
}

DNS_MCAST.prototype = {
    dns: null,
    fathom: null,
    socket: null,

    // stop receiving any more responses from this socket
    close : function() {
	var that = this;
	if (that.socket) {
	    that.fathom.socket.udp.recvfromstop(function() {
		that.fathom.socket.multicast.close(function() {}, that.socket);
		that.socket = null;
	    },that.socket);
	}
    },
    
    sendRecv: function() {
	throw "DNS_MCAST.sendRecv deprecated!"
    },

    sendRecvNew : function(SEND_DATA, onSend, onReceive) {
	var self = this;

	var send = function() {
	    self.fathom.socket.multicast.sendto(
		onSend,
		self.socket, 
		SEND_DATA, 
		self.dns.destination,
		self.dns.port);
	    
	    self.fathom.socket.multicast.recvfromstart(onReceive, self.socket);
	};

	if (self.socket) {
	    self.fathom.socket.multicast.recvfromstop(send, self.socket);
	} else {
	    // lazy open the socket
	    self.fathom.socket.multicast.open(function(s) {
		if (s && s.error) {
		    onSend({ error : "failed to open multicast dns socket: " + s.error});
		    return;
		}	
		self.socket = s;    

		// bind any:*port and join destination group
		self.fathom.socket.multicast.bind(function(r) {
		    if (r && r.error) {
			onSend({ error : "failed to bind multicast dns socket: " + s.error});
			return;
		    }
		    send();
		}, self.socket, self.dns.destination, self.dns.port); 
	    });
	}
    },
}


