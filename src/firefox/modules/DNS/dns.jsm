// Module API
var EXPORTED_SYMBOLS = ["DNS"];

Components.utils.import("resource://fathom/DNS/coreDNS.jsm");
Components.utils.import("resource://fathom/Logger.jsm");

const MCAST = 'mcast';
const UDP = 'udp';
const TCP = 'tcp';

function DNS(proto, fathomObj, dst, port) {
    // network protocol obj
    this.protocol = proto;
    var obj = null;
    switch (proto) {
    case MCAST:
	obj = new DNS_MCAST(fathomObj, dst, port);
	break;
    case UDP:
	obj = new DNS_UDP(fathomObj, dst, port);
	break;
    case TCP:
	obj = new DNS_TCP(fathomObj, dst, port);
	break;
    default:
	break;
    }
    this.proto = obj;
    return this;
};

DNS.prototype = {	
    proto: null,
    protocol: null,

    isMcast : function() {
	return (this.protocol === MCAST);
    },
    isTCP : function() {
	return (this.protocol === TCP);
    },
    isUDP : function() {
	return (this.protocol === UDP);
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

function DNS_TCP(fathomObj, dst, port) {
    this.fathom = fathomObj;
    this.destination = dst;
    this.port = port;
};

DNS_TCP.prototype = {
    destination : null,
    port : null,
    fathom: null,
    socket: null,
    // TODO: remove ?
    recvInterval: null,
	
    close : function(cb) {
	if (this.socket) {
	    self.fathom.socket.tcp.close(function() {},this.socket);
	    this.socket = null;
	    if (typeof cb === 'function')
		cb();
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
};

function DNS_UDP(fathomObj, dst, port) {
    this.fathom = fathomObj;
    this.destination = dst;
    this.port = port;
}

DNS_UDP.prototype = {
    destination : null,
    port : null,
    fathom: null,
    socket: null,  // send socket

    // TODO: remove ?
    window: null,
    intervalid: null,
    SEND_INTERVAL_MILLISECONDS: 250,

    // stop receiving any more responses from this listening socket
    close : function(cb) {
	var self = this;
	if (self.socket) {
	    self.fathom.socket.udp.recvfromstop(function() {
		self.fathom.socket.udp.close(function() {}, self.socket);
		self.socket = null;
		if (typeof cb === 'function')
		    cb();
	    }, self.socket);
	}
    },
    
    // Unicast UDP request-response
    sendRecv: function(DEST_ADDR, DEST_PORT, SEND_DATA, onSend, onReceive, to) {
	var self = this;
	var timeout = to || this.SEND_INTERVAL_MILLISECONDS;
	this.destination = DEST_ADDR;
	this.port = DEST_PORT;
		
	function send() {
	    if (self.intervalid)
		self.window.clearInterval(self.intervalid);

	    self.fathom.socket.udp.sendto(onSend, 
					  self.socket, 
					  SEND_DATA, 
					  self.destination, 
					  self.port);

	    self.fathom.socket.udp.recvfromstart(onReceive, self.socket);
	};
	
	self.fathom.socket.udp.open(function(result) {
	    if (result && result.error) {
		recordUDPSend({ error : "failed to open udp dns socket: " + result.error});
		return;
	    }
	    self.socket = result;

	    if (timeout>0) {
		if (!self.window) {
		    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]  
			.getService(Components.interfaces.nsIWindowMediator);  
		    self.window = wm.getMostRecentWindow("navigator:browser");
		}
		self.intervalid = self.window.setInterval(send,timeout);
	    } else {
		send();
	    }
	}); // open
	
    }, // sendRecv
} // DNS_UDP

function DNS_MCAST(fathomObj, dst, port) {
    this.fathom = fathomObj;
    this.destination = dst;
    this.port = port;
}

DNS_MCAST.prototype = {
    destination : null,
    port : null,
    fathom: null,
    socket: null,

    // TODO: remove ?
    window: null,
    intervalid: null,
    SEND_INTERVAL_MILLISECONDS: 250,

    // stop receiving any more responses from this socket
    close : function(cb) {
	var self = this;
	if (self.socket) {
	    self.fathom.socket.multicast.recvfromstop(function() {
		self.fathom.socket.multicast.close(function() {}, self.socket);
		self.socket = null;
		if (typeof cb === 'function')
		    cb();
	    },self.socket);
	}
    },
    
    sendRecv: function(DEST_ADDR, DEST_PORT, SEND_DATA, onSend, onReceive, to) {
	var self = this;
	var timeout = to || this.SEND_INTERVAL_MILLISECONDS;
	this.destination = DEST_ADDR;
	this.port = DEST_PORT;
		
	function send() {
	    if (self.intervalid)
		self.window.clearInterval(self.intervalid);

	    self.fathom.socket.multicast.sendto(onSend, 
						self.socket, 
						SEND_DATA, 
						self.destination, 
						self.port);

	    self.fathom.socket.multicast.recvfromstart(onReceive, self.socket);
	};
	
	self.fathom.socket.multicast.open(function(result) {
	    if (result && result.error) {
		onSend({ error : "failed to open multicast dns socket: " + result.error});
		return;
	    }
	    self.socket = result;

	    if (timeout>0) {
		if (!self.window) {
		    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]  
			.getService(Components.interfaces.nsIWindowMediator);  
		    self.window = wm.getMostRecentWindow("navigator:browser");
		}
		self.intervalid = self.window.setInterval(send,timeout);
	    } else {
		send();
	    }
	}); // open
	
    }, // sendRecv
}


