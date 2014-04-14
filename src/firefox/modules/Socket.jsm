/** 
 * @author Anna-Kaisa Pietilainen <anna-kaisa.pietilainen@inria.fr>
 */

/** Module API 
 * @private
 */
var EXPORTED_SYMBOLS = ["Socket"];

// Imports
Components.utils.import("resource://fathom/Logger.jsm");

var Socket = function(ctx) {
    /**
     * @description fathom.socket.* namespace. Low level TCP/UDP socket API.
     * @exports fathom/socket
     */
    var s = {};

	/**
	 * @description This component provides functions for sending and
	 * receiving broadcast messages using UDP over IPv4.
	 *
	 * @exports fathom/socket/broadcast
	 */
	var broadcast = s.broadcast = {};

    /**
     * @description This function opens a socket suitable for
     * transmitting broadcast messages.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, its only argument is
     * a numerical socket ID.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     */	
	 broadcast.openSendSocket = function (callback) {
		return ctx._doSocketOpenRequest(callback, 'broadcastOpenSendSocket', []);
	 };

    /**
     * @description This function opens a broadcast socket and binds
     * it to the given port.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, its only argument is
     * a numerical socket ID.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} port The local port on which the socket will
     * listen for broadcast messages.
     */	
    broadcast.openReceiveSocket = function (callback, port) {
	    return ctx._doSocketOpenRequest(callback, 'broadcastOpenReceiveSocket', [port]);
    };

    /**
     * @description This function closes a broadcast socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @socketid {integer} socketid The socket handle previously
     * obtained from one of the opening functions.
     */
    broadcast.closeSocket = function (callback, socketid) {
	    return ctx._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
    };

    /**
     * @description This function transmits data on a broadcast socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     * @param {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     * @param {string} msg  The message to transmit.
     * @param {string} ip The broadcast IPv4 address to send to.
     * @param {integer} port  The (UDP) port to send to.
     */
    broadcast.send = function (callback, socketid, msg, ip, port) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketUsageRequest(callback, 'broadcastSend', 
    					 [socketid, msg, ip, port]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						ip, port, 
    						'socket.broadcast');
    };

    /**
     * @description On a socket created via openReceiveSocket(),
     * this function receives data.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, its only argument is
     * a string containing the received message.  On error, its only
     * argument is a dictionary whose member "error" describes the
     * problem that occurred.
     * 
     * @param {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     */
    broadcast.receive = function (callback, socketid) {
        return ctx.doSocketUsageRequest(callback, 'broadcastReceive', [socketid]);
    };
	
	/**
	 * @description This component provides functions for sending and
	 * receiving multicast messages using UDP over IPv4.
	 *
	 * @exports fathom/socket/multicast
	 */
	var multicast = s.multicast = {};

    /**
     * @description This function opens a multicast socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} ttl The multicast TTL, i.e., the number of
     * hops the datagram can traverse, doubling as the multicast
     * "threshold" of host/network/site/etc.
     *
     * @param {boolean} loopback If True, this host will receive its own messages.
     */
    multicast.open = function (callback, ttl, loopback) {
	return ctx._doSocketOpenRequest(callback, 
					 'multicastOpenSocket', [ttl,loopback]);
    };

    /**
     * @description Join the given multicast group
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, its only argument is
     * a numerical socket ID.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @socketid {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     *
     * @param {string} ip  The IPv4 address of the multicast group to join.
     */	
    multicast.join = function (callback, socketid, ip, port, reuse) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketUsageRequest(callback, 
    					  'multicastJoin', 
    					  [socketid, ip, port, reuse]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						ip, port, 
    						'socket.multicast');
    };

    /**
     * @description This function closes a multicast socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @socketid {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     */
    multicast.close = function (callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
    };

    /** 
     * @description This function sends data over a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} data  Data to send.
     */ 
    multicast.send = function(callback, socketid, data) {
	return ctx._doSocketUsageRequest(callback, 'udpSend', [socketid, data]);
    };

    /** 
     * @description This function receives data on a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */ 
    multicast.recv = function(callback, socketid, length, timeout) {
	return ctx._doSocketUsageRequest(callback, 'udpRecv', 
					 [socketid, length, timeout]);
    };

    /** 
     * @description This function sends data on a UDP socket and
     * reads subsequently returned responses.  This function is an
     * optimization, saving one message-passing roundtrip into the
     * Fathom core to read the response after having sent data.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} data  Data to send.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */ 
    multicast.sendrecv = function(callback, socketid, data, length) {
	return ctx._doSocketUsageRequest(callback, 'udpSendrecv', 
					 [socketid, data, length]);
    };

    /**
     * @description This function establishes a callback to get
     * invoked automatically whenever data arrive on a given UDP
     * socket.  To stop receiving, call recvstop().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */     
    multicast.recvstart = function(callback, socketid, length, asstring) {
    	var multiresponse = true;
    	if (asstring == undefined) {
    	    asstring = false;
    	}
    	return ctx._doSocketUsageRequest(callback, 'udpRecvstart',
    					  [socketid, length, asstring], 
    					 multiresponse);
    };

    /**
     * @description This function cancels the callbacks previously
     * installed via recvstart().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    multicast.recvstop = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvstop', [socketid]);
    };

    /** 
     * @description This function sends data over a UDP socket, to a
     * specific destination.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} data  Data to send.
     *
     * @param {string} ip  IP address to send to.
     *
     * @param {integer} port  Port to send to.

     */ 
    multicast.sendto = function(callback, socketid, data, ip, port) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketUsageRequest(callback, 'udpSendto', 
    					  [socketid, data, ip, port]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						ip, port, 
    						'socket.multicast');
    };

    /** 
     * @description This function receives data on a UDP socket,
     * from a specific sender.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */ 
    multicast.recvfrom = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvfrom', [socketid]);
    };

    /**
     * @description This function establishes a callback to get
     * invoked automatically whenever data arrive on a given UDP
     * socket, from a specific sender.  To stop receiving, call
     * recvfromstop().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    multicast.recvfromstart = function(callback, socketid, asstring) {
    	var multiresponse = true;
    	if (asstring == undefined) {
    	    asstring = false;
    	}
    	return ctx._doSocketUsageRequest(callback, 'udpRecvfromstart', 
    					  [socketid, asstring], multiresponse);
    };

    /**
     * @description This function cancels the callbacks previously
     * installed via recvfromstart().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    multicast.recvfromstop = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvfromstop', [socketid]);
    };

	/**
	 * @description This component provides APIs for communication over
	 * TCP.
	 *
	 * @exports fathom/socket/tcp
	 */
	var tcp = s.tcp = {};
    
    /** 
     * @description This function creates a TCP socket and connects
     * it to the given destination.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  When successful, its only argument
     * is a socket descriptor.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {string} destip  IP address to connect to.
     *
     * @param {integer} destport  Port to connect to.
     */ 
    tcp.openSendSocket = function (callback, destip, destport) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketOpenRequest(callback, 'tcpOpenSendSocket', 
    					 [destip, destport]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						destip, destport, 
    						'socket.tcp');
    };

    /** 
     * @description This function creates a TCP socket, binds it
     * locally to the given port, and listens for connections.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  When successful, its only argument
     * is a socket descriptor.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} port  Port to listen on.
     */ 
    tcp.openReceiveSocket = function (callback, port) {
        return ctx._doSocketOpenRequest(callback, 'tcpOpenReceiveSocket', [port]);
    };

    /*
      acceptstart : function(callback, socketid) {
      var handler = function(resp) {
      // FIXME: broken
      //	  if (resp.socket) {
      // create a new chromeworker for the incoming connection
      //            Logger.debug("connection from " + resp.address);
      //	    ctx.doSocketOpenRequest(callback, 'tcpAcceptSocket', [resp.socket]);
      //	  }
      };
      var multiresponse = true;
      ctx.doSocketUsageRequest(handler, 'tcpAcceptstart', [socketid], multiresponse);
      },

      acceptstop : function(callback, socketid) {
      ctx.doSocketUsageRequest(callback, 'tcpAcceptstop', [socketid]);	
      },
    */

    /**
     * @description This function closes a TCP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @socketid {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     */
    tcp.closeSocket = function (callback, socketid) {
        return ctx._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
    };

    /** 
     * @description This function sends data over the TCP connection
     * identified by the given socket ID.
     *
     * @param {function} callback The callback Fathom invokes once
     * the send call returns.
     *
     * @param {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     *
     * @param {string} data  The data chunk to transmit.
     */ 
    tcp.send = function (callback, socketid, msg) {
        return ctx._doSocketUsageRequest(callback, 'tcpSend', [socketid, msg]);
    };

    /** 
     * @description This function receives data on a TCP connection.
     *
     * @param {function} callback The callback Fathom invokes either
     * when an error has occurred or when data has arrived.  When
     * successful, its only argument is the received data chunk.  On
     * error, its only argument is a dictionary whose member "error"
     * describes the problem that occurred.
     *
     * @param {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     */ 
    tcp.receive = function (callback, socketid, asstring) {
    	if (asstring == undefined) {
    	    asstring = false;
    	}
    	return ctx._doSocketUsageRequest(callback, 'tcpReceive', [socketid, asstring]);
    };

    /** 
     * @description This function returns the IP address of the
     * local endpoint of a given TCP connection.
     *
     * @param {function} callback The callback Fathom invokes either
     * when an error has occurred or when data has arrived.  When
     * successful, its only argument is the local IP address.  On
     * error, its only argument is a dictionary whose member "error"
     * describes the problem that occurred.
     *
     * @param {integer} socketid  The socket handle previously
     * obtained from one of the opening functions.
     */ 
    tcp.getHostIP = function (callback, socketid) {
        return ctx._doSocketUsageRequest(callback, 'tcpGetHostIP', [socketid]);
    };

    /** 
     * @description This function returns the IP address of the
     * remote endpoint of a given TCP connection.
     *
     * @param {function} callback The callback Fathom invokes either
     * when an error has occurred or when data has arrived.  When
     * successful, its only argument is the remote IP address.  On
     * error, its only argument is a dictionary whose member "error"
     * describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained from one of the opening functions.
     */ 
    tcp.getPeerIP = function (callback, socketid) {
        return ctx._doSocketUsageRequest(callback, 'tcpGetPeerIP', [socketid]);
    };
	
	/**
	 * @description This component provides APIs for unicast
	 * communication over UDP.  For multicast and broadcast options,
	 * see the respective namespaces.
	 *
     * @exports fathom/socket/udp
	 */
	var udp = s.udp = {};
    
    /** 
     * @description This function creates a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  When successful, its only argument
     * is a socket descriptor ID.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     */ 
    udp.open = function(callback) {
	return ctx._doSocketOpenRequest(callback, 'udpOpen', []);
    };

    /**
     * @description This function closes a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @socketid {integer} socketid  The socket handle previously
     * obtained for this UDP flow.
     */
    udp.close = function (callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
    };

    /** 
     * @description This function binds a UDP socket to a local IP
     * address and port.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} addr  IP address to bind to.
     *
     * @param {integer} port  Port to listen on.
     */ 
    udp.bind = function(callback, socketid, addr, port) {
	return ctx._doSocketUsageRequest(callback, 'udpBind', [socketid, addr, port]);
    };

    /** 
     * @description This function connects a UDP socket to a remote
     * IP address and port.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} addr  IP address to connect to.
     *
     * @param {integer} port  Port to connect to.
     */ 
    udp.connect = function(callback, socketid, addr, port) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketUsageRequest(callback, 'udpConnect', 
    					  [socketid, addr, port]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						addr, port, 
    						'socket.udp');
    };

    /** 
     * @description This function sends data over a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} data  Data to send.
     */ 
    udp.send = function(callback, socketid, data) {
	return ctx._doSocketUsageRequest(callback, 'udpSend', [socketid, data]);
    };

    /** 
     * @description This function receives data on a UDP socket.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */ 
    udp.recv = function(callback, socketid, length, timeout) {
	return ctx._doSocketUsageRequest(callback, 'udpRecv', 
					 [socketid, length, timeout]);
    };

    /** 
     * @description This function sends data on a UDP socket and
     * reads subsequently returned responses.  This function is an
     * optimization, saving one message-passing roundtrip into the
     * Fathom core to read the response after having sent data.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {string} data  Data to send.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */ 
    udp.sendrecv = function(callback, socketid, data, length) {
	return ctx._doSocketUsageRequest(callback, 'udpSendrecv', 
					 [socketid, data, length]);
    };

    /**
     * @description This function establishes a callback to get
     * invoked automatically whenever data arrive on a given UDP
     * socket.  To stop receiving, call recvstop().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     *
     * @param {integer} length Maximum length of the data chunk to
     * read.  This is an optimization, for cases when you do not
     * care to actually process all of the data received.  To ignore
     * this feature, pass 0.
     */     
    udp.recvstart = function(callback, socketid, length, asstring) {
    	var multiresponse = true;
    	if (asstring == undefined) {
    	    asstring = false;
    	}
    	return ctx._doSocketUsageRequest(callback, 'udpRecvstart',
    					  [socketid, length, asstring], 
    					 multiresponse);
    };

    /**
     * @description This function cancels the callbacks previously
     * installed via recvstart().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    udp.recvstop = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvstop', [socketid]);
    };

    /** 
     * @description This function sends data over a UDP socket, to a
     * specific destination.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes. On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     * @param {string} data  Data to send.
     * @param {string} ip  IP address to send to.
     * @param {integer} port  Port to send to.
     */ 
    udp.sendto = function(callback, socketid, data, ip, port) {
    	function destPermCheckCompleted(result) {
    	    if (result['error']) {
    		result["__exposedProps__"] = { error: "r" };
    		callback(result);
    	    } else {
    		ctx._doSocketUsageRequest(callback, 'udpSendto', 
    					  [socketid, data, ip, port]);
    	    }
    	}
    	return ctx._checkDestinationPermissions(destPermCheckCompleted, 
    						ip, port, 
    						'socket.udp');
    };

    /** 
     * @description This function receives data on a UDP socket,
     * from a specific sender.
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */ 
    udp.recvfrom = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvfrom', [socketid]);
    };

    /**
     * @description This function establishes a callback to get
     * invoked automatically whenever data arrive on a given UDP
     * socket, from a specific sender.  To stop receiving, call
     * recvfromstop().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  If successful, the function
     * receives a dictionary with two members: "data" for the data
     * actually read, and "length" for the full length of the data
     * chunk received.  On error, its only argument is a dictionary
     * whose member "error" describes the problem that occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    udp.recvfromstart = function(callback, socketid, asstring) {
    	var multiresponse = true;
    	if (asstring == undefined) {
    	    asstring = false;
    	}
    	return ctx._doSocketUsageRequest(callback, 'udpRecvfromstart', 
    					  [socketid, asstring], multiresponse);
    };

    /**
     * @description This function cancels the callbacks previously
     * installed via recvfromstart().
     *
     * @param {function} callback The callback Fathom invokes once
     * the operation completes.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     */     
    udp.recvfromstop = function(callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpRecvfromstop', [socketid]);
    };

    /**
     * @description This function sets options on a given UDP socket.
     *
     * @param {function} callback The callback Fathom invokes when
     * the operation complets.  On error, its only argument is a
     * dictionary whose member "error" describes the problem that
     * occurred.
     *
     * @param {integer} socketid The socket handle previously
     * obtained for this UDP flow.
     * 
     * @param {string} name The name of the option.  Currently,
     * Fathom only supports "reuseaddr".
     * 
     * @param {integer} value The option value.  For "reuseaddr", 1
     * requests the option, 0 clears it.
     */
    udp.setsockopt = function(callback, socketid, name, value) {
	return ctx._doSocketUsageRequest(callback, 'udpSetsockopt', 
					 [socketid, name, value]);
    };

    /** 
     * @description This function returns the IP address of the
     * local endpoint of a given UDP flow.
     *
     * @param {function} callback The callback Fathom invokes either
     * when an error has occurred or when data has arrived.  When
     * successful, its only argument is the local IP address.  On
     * error, its only argument is a dictionary whose member "error"
     * describes the problem that occurred.
     *
     * @param {integer} socketid  The socket handle identifying the
     * UDP flow.
     */ 
    udp.getHostIP = function (callback, socketid) {
	return ctx._doSocketUsageRequest(callback, 'udpGetHostIP', [socketid]);
    };

    /** 
     * @description This function returns the IP address of the
     * remote endpoint of a given UDP flow.
     *
     * @param {function} callback The callback Fathom invokes either
     * when an error has occurred or when data has arrived.  When
     * successful, its only argument is the remote IP address.  On
     * error, its only argument is a dictionary whose member "error"
     * describes the problem that occurred.
     *
     * @param {integer} socketid  The socket handle identifying the
     * UDP flow.
     */ 
    udp.getPeerIP = function (callback, socketid) {
        return ctx._doSocketUsageRequest(callback, 'udpGetPeerIP', [socketid]);
    };
    
    return s;
}; // Socket