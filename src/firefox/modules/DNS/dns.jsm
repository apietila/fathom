// Module API
var EXPORTED_SYMBOLS = ["DNS", "DNS_TCP", "DNS_UDP"];

Components.utils.import("resource://fathom/DNS/coreDNS.jsm");

function DNS(proto, fathomObj) {
    var obj = null;
    switch(proto) {
    case "udp":
	obj = new DNS_UDP(fathomObj);
	break;
    case "tcp":
	obj = new DNS_TCP(fathomObj);
	break;
    default:
	break;
    }
    this.protocol = proto;
    this.proto = obj;
    return this;
}

DNS.prototype = {	
    proto: null,
    protocol: null,
    
    query : function(domain, type, recordClass, fl) {
	var proto = this.protocol;
	var flags = (fl ? fl : DNSConstants.FLAGS_QUERY);
	var out = new DNSOutgoing(proto, flags);
	out = out.createRequest(domain, type, recordClass);
	return out.getHexString();
    },
    
    response : function(buf, domain, callback) {
	var proto = this.protocol;
	var i = 0;
	while(i < buf.length) {
	    if(proto == "tcp")
		buf = buf.slice(2); // ignore the len bytes
	    var resp = new Response(buf, proto, i, buf.length);
	    var id = resp.readUnsignedShort();
	    var flags = resp.readUnsignedShort();
	    //log("Flag = " + flags)
	    var newQuery = new DNSIncoming(flags, id, false, resp, domain);
	    callback.call(null, JSON.stringify(newQuery), domain);
	    i = resp.idx;
	}
    },
    
    sendRecv: function() {
	return this.proto.sendRecv.apply(null, arguments);
    },
    
    mcastSendRecv: function() {
	if (!this.proto.mcastSendRecv)
	    throw "mcastSendRecv not available on " + this.protocol + " protocol";
	return this.proto.mcastSendRecv.apply(null, arguments);
    },

    close : function() {
	return this.proto.close.apply(null, arguments);
    },
};

/* tcp and udp */

function DNS_TCP(fathomObj) {
    this.fathom = fathomObj;
}

DNS_TCP.prototype = {
    fathom: null,
    socket: null,
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
				//log('Error openeing TCP socket : ' + openedsocketid['error']);
				return;
			}
			tcpsocketid = openedsocketid;
			self.socket = tcpsocketid;
			self.fathom.socket.tcp.send(recordTCPSend, tcpsocketid, DESC_DATA);
			//self.fathom.socket.tcp.receive(recordTCPReceive, tcpsocketid);
			receive(recordTCPReceive);
		}
		
		function receive(recordTCPReceive) {

			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);  
			var mainWindow = wm.getMostRecentWindow("navigator:browser");

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
	}
};

function DNS_UDP(fathomObj) {
    this.fathom = fathomObj;
}

DNS_UDP.prototype = {
	fathom: null,
	window: null,
	
	socket: null,
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
    sendRecv: function(DEST_ADDR, DEST_PORT, SEND_DATA, recordUDPSend, recordUDPReceive ,timeout) {
	var self = this;
	// FIXME: why would we want to have this timeout ?
	var timeout = timeout || this.SEND_INTERVAL_MILLISECONDS; 
		
	function sendUDP() {
	    self.fathom.socket.udp.sendto(recordUDPSend, self.socket, SEND_DATA, DEST_ADDR, DEST_PORT);
	    self.fathom.socket.udp.recvfromstart(recordUDPReceive, self.socket);
	    if (self.intervalid)
		self.window.clearInterval(self.intervalid);
	}
	
	function sendSockCreated(result) {
	    self.socket = result;
	    if (timeout > 0) { 
		if (!self.window) { // lazy init
		    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]  
			.getService(Components.interfaces.nsIWindowMediator);  
		    self.window = wm.getMostRecentWindow("navigator:browser");
		}
		self.intervalid = self.window.setInterval(sendUDP, self.SEND_INTERVAL_MILLISECONDS);
	    } else {
		sendUDP();
	    }
	}
	
	self.fathom.socket.udp.open(sendSockCreated);

    }, // sendRecv

    // mDNS request - response
    mcastSendRecv: function(DEST_ADDR, DEST_PORT, SEND_DATA, recordUDPSend, recordUDPReceive) {
	var self = this;	
	self.fathom.socket.multicast.open(function(s) {
	    if (s && s.error) {
		recordUDPSend(
		    { error : "failed to open multicast dns socket: " + s.error});
		return;
	    }	
	    self.socket = s;    

	    self.fathom.socket.multicast.bind(function(r) {
		if (r && r.error) {
		    recordUDPSend(
			{ error : "failed to bind multicast dns socket: " + s.error});
		    return;
		}

		// send the multicast request
		self.fathom.socket.multicast.sendto(recordUDPSend, self.socket, SEND_DATA, DEST_ADDR, DEST_PORT);

		// start receiving responses until close is called
		self.fathom.socket.multicast.recvfromstart(recordUDPReceive, self.socket);

	    }, self.socket, DEST_ADDR, DEST_PORT); // bind
	});
    },
}
