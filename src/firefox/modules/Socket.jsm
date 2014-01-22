// Module API
var EXPORTED_SYMBOLS = ["Socket"];

// Imports
Components.utils.import("resource://fathom/Logger.jsm");

/**
 * @class Socket
 * @description This module provides the socket API.
 *
 * @param {object} ctx        extension context
 */
var Socket = function(ctx) {
    // from extension context
    this._doSocketOpenRequest = ctx._doSocketOpenRequest.bind(ctx);
    this._doSyncSocketOpenRequest = ctx._doSyncSocketOpenRequest.bind(ctx);
    this._doSocketUsageRequest = ctx._doSocketUsageRequest.bind(ctx);
    this._checkDestinationPermissions = ctx.security.isDestinationAvailable.bind(ctx);

    // need to bind the sub-namespaces to 'this' object so that we can access
    // the above helpers - a bit ugly
    for (var subns in this) {
	if (subns.indexOf('_')==0)
	    continue;
	for (var method in this[subns]) {
	    if (typeof this[subns][method] === 'function')
		this[subns][method] = this[subns][method].bind(this); 
	}
    }
};

// This is the API available to the web pages via the extension
Socket.prototype = {

    /**
     * @class broadcast
     *
     * @description This component provides functions for sending and
     * receiving broadcast messages using UDP over IPv4.
     *
     * @namespace fathom.socket
     */
    broadcast : {
	/**
	 * @method openSendSocket
	 * @static
	 *
	 * @description This function opens a socket suitable for
	 * transmitting broadcast messages.
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the operation completes.  If successful, its only argument is
	 * a numerical socket ID.  On error, its only argument is a
	 * dictionary whose member "error" describes the problem that
	 * occurred.
	 */	
	openSendSocket : function (callback) {
	    return this._doSocketOpenRequest(callback, 'broadcastOpenSendSocket', []);
	},

	/**
	 * @method openReceiveSocket
	 * @static
	 *
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
	openReceiveSocket : function (callback, port) {
	    return this._doSocketOpenRequest(callback, 'broadcastOpenReceiveSocket', [port]);
	},

	/**
	 * @method closeSocket
	 * @static
	 *
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
	closeSocket : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
	},

	/**
	 * @method send
	 * @static
	 *
	 * @description This function transmits data on a broadcast socket.
	 *
	 * [% INCLUDE todo.tmpl msg='This function should report the number of bytes successfully transmitted to the callback.' %]
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the operation completes. On error, its only argument is a
	 * dictionary whose member "error" describes the problem that
	 * occurred.
	 * 
	 * @param {integer} socketid  The socket handle previously
	 * obtained from one of the opening functions.
	 * 
	 * @param {string} msg  The message to transmit.
	 *
	 * @param {string} ip The broadcast IPv4 address to send to.
	 *
	 * @param {integer} port  The (UDP) port to send to.
	 */
	send : function (callback, socketid, msg, ip, port) {
	    return this._doSocketUsageRequest(callback, 'broadcastSend', [socketid, msg, ip, port]);
	},

	/**
	 * @method receive
	 * @static
	 * 
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
	receive : function (callback, socketid) {
	    return this.doSocketUsageRequest(callback, 'broadcastReceive', [socketid]);
	},
    }, // broadcast
    
    /**
     * @class multicast
     *
     * @description This component provides functions for sending and
     * receiving multicast messages using UDP over IPv4.
     *
     * @namespace fathom.socket
     */
    multicast : {

	/**
	 * @method openSocket
	 * @static
	 *
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
	open : function (callback, ttl, loopback) {
	    return this._doSocketOpenRequest(callback, 
					     'multicastOpenSocket', [ttl,loopback]);
	},

	/**
	 * @method join
	 * @static
	 *
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
	join : function (callback, socketid, ip) {
	    return this._doSocketUsageRequest(callback, 
					      'multicastJoin', 
					      [socketid, ip]);
	},

	/** 
	 * @method bind
	 * @static
	 *
	 * @description This function binds a multicast socket to a local IP
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
	 * @param {string} addr  IP address to bind to (not supported yet!).
	 *
	 * @param {integer} port  Port to listen on.
	 */ 
	bind : function(callback, socketid, addr, port, reuse) {
	    return this._doSocketUsageRequest(callback, 'udpBind', [socketid, addr, port, reuse]);
	},

	/**
	 * @method close
	 * @static
	 *
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
	close : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
	},

	/** 
	 * @method send
	 * @static
	 *
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
	send : function(callback, socketid, data) {
	    return this._doSocketUsageRequest(callback, 'udpSend', [socketid, data]);
	},

	/** 
	 * @method recv
	 * @static
	 *
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
	recv : function(callback, socketid, length, timeout) {
	    return this._doSocketUsageRequest(callback, 'udpRecv', [socketid, length, timeout]);
	},

	/** 
	 * @method sendrecv
	 * @static
	 *
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
	sendrecv : function(callback, socketid, data, length) {
	    return this._doSocketUsageRequest(callback, 'udpSendrecv', [socketid, data, length]);
	},

	/**
	 * @method recvstart
	 * @static 
	 *
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
	recvstart : function(callback, socketid, length, asstring) {
	    var multiresponse = true;
	    if (asstring == undefined) {
		asstring = false;
	    }
	    return this._doSocketUsageRequest(callback, 'udpRecvstart',
				       [socketid, length, asstring], multiresponse);
	},

	/**
	 * @method recvstop
	 * @static 
	 *
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
	recvstop : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvstop', [socketid]);
	},

	/** 
	 * @method sendto
	 * @static
	 *
	 * @description This function sends data over a UDP socket, to a
	 * specific destination.
	 *
	 * [% INCLUDE todo.tmpl msg='This function should report back the number of bytes sent successfully, and also needs error semantics.' %]
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
	sendto : function(callback, socketid, data, ip, port) {
	    return this._doSocketUsageRequest(callback, 'udpSendto', [socketid, data, ip, port]);
	},

	/** 
	 * @method recv
	 * @static
	 *
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
	recvfrom : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvfrom', [socketid]);
	},

	/**
	 * @method recvfromstart
	 * @static 
	 *
	 * @description This function establishes a callback to get
	 * invoked automatically whenever data arrive on a given UDP
	 * socket, from a specific sender.  To stop receiving, call
	 * recvfromstop().
	 *
	 * [% INCLUDE todo.tmpl msg='This function is not complete. It still needs the IP address and port we want to receive from.' %]
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
	recvfromstart : function(callback, socketid, asstring) {
	    var multiresponse = true;
	    if (asstring == undefined) {
		asstring = false;
	    }
	    return this._doSocketUsageRequest(callback, 'udpRecvfromstart', 
				       [socketid, asstring], multiresponse);
	},

	/**
	 * @method recvfromstop
	 * @static 
	 *
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
	recvfromstop : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvfromstop', [socketid]);
	},

    }, // multicast

    /**
     * @class tcp
     *
     * @description This component provides APIs for communication over
     * TCP.
     *
     * @namespace fathom.socket
     */
    tcp : {
	/** 
	 * @method openSendSocket
	 * @static
	 *
	 * @description This function creates a TCP socket and connects
	 * it to the given destination.
	 *
	 * [% INCLUDE todo.tmpl msg='Rename to openConnectSocket or some such, to avoid the impression that this socket is useful for sending only.' %]
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
	openSendSocket : function (callback, destip, destport) {
	    var self = this;
	    function destPermCheckCompleted(result) {
		if (result['error']) {
		    result["__exposedProps__"] = { error: "r" };
		    // TODO: use setTimeout instead of calling callback() directly.
		    callback(result);
		} else {
		    self._doSocketOpenRequest(callback, 'tcpOpenSendSocket', 
					      [destip, destport]);
		}
	    }
	    return this._checkDestinationPermissions(destPermCheckCompleted, destip);
	},

	/** 
	 * @method  openReceiveSocket
	 * @static
	 *
	 * @description This function creates a TCP socket, binds it
	 * locally to the given port, and listens for connections.
	 *
	 * [% INCLUDE todo.tmpl msg='(1) Rename to openListenSocket or some such, to avoid the impression that this socket is useful for receiving only. (2) What interface does this bind to on a multihomed host?  (3) How does one accept() connections?' %]
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the operation completes.  When successful, its only argument
	 * is a socket descriptor.  On error, its only argument is a
	 * dictionary whose member "error" describes the problem that
	 * occurred.
	 *
	 * @param {integer} port  Port to listen on.
	 */ 
	openReceiveSocket : function (callback, port) {
	    return this._doSocketOpenRequest(callback, 'tcpOpenReceiveSocket', [port]);
	},

	/*
	acceptstart : function(callback, socketid) {
	    var handler = function(resp) {
		// FIXME: broken
		//	  if (resp.socket) {
		// create a new chromeworker for the incoming connection
		//            Logger.debug("connection from " + resp.address);
		//	    this.doSocketOpenRequest(callback, 'tcpAcceptSocket', [resp.socket]);
		//	  }
	    };
	    var multiresponse = true;
	    this.doSocketUsageRequest(handler, 'tcpAcceptstart', [socketid], multiresponse);
	},

	acceptstop : function(callback, socketid) {
	    this.doSocketUsageRequest(callback, 'tcpAcceptstop', [socketid]);	
	},
	*/

	/**
	 * @method closeSocket
	 * @static
	 *
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
	closeSocket : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
	},

	/** 
	 * @method send
	 * @static
	 *
	 * @description This function sends data over the TCP connection
	 * identified by the given socket ID.
	 *
	 * [% INCLUDE todo.tmpl msg='This function should report back the number of bytes sent successfully, and also needs error semantics.' %]
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the send call returns.
	 *
	 * @param {integer} socketid  The socket handle previously
	 * obtained from one of the opening functions.
	 *
	 * @param {string} data  The data chunk to transmit.
	 */ 
	send : function (callback, socketid, msg) {
	    return this._doSocketUsageRequest(callback, 'tcpSend', [socketid, msg]);
	},

	/** 
	 * @method receive
	 * @static
	 *
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
	receive : function (callback, socketid, asstring) {
	    if (asstring == undefined) {
		asstring = false;
	    }
	    return this._doSocketUsageRequest(callback, 'tcpReceive', [socketid, asstring]);
	},

	/** 
	 * @method getHostIP
	 * @static
	 *
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
	getHostIP : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'tcpGetHostIP', [socketid]);
	},

	/** 
	 * @method getPeerIP
	 * @static
	 *
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
	getPeerIP : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'tcpGetPeerIP', [socketid]);
	},
    }, // tcp
    
    /**
     * @class udp
     *
     * @description This component provides APIs for unicast
     * communication over UDP.  For multicast and broadcast options,
     * see the respective namespaces.
     *
     * @namespace fathom.socket
     */
    udp : {
	/** 
	 * @method open
	 * @static
	 *
	 * @description This function creates a UDP socket.
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the operation completes.  When successful, its only argument
	 * is a socket descriptor ID.  On error, its only argument is a
	 * dictionary whose member "error" describes the problem that
	 * occurred.
	 */ 
	open : function(callback) {
	    return this._doSocketOpenRequest(callback, 'udpOpen', []);
	},

	/**
	 * @method close
	 * @static
	 *
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
	close : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'closeSocket', [socketid]);	
	},

	/** 
	 * @method bind
	 * @static
	 *
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
	bind : function(callback, socketid, addr, port) {
	    return this._doSocketUsageRequest(callback, 'udpBind', [socketid, addr, port]);
	},

	/** 
	 * @method bind
	 * @static
	 *
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
	connect : function(callback, socketid, addr, port) {
	    return this._doSocketUsageRequest(callback, 'udpConnect', [socketid, addr, port]);
	},

	/** 
	 * @method send
	 * @static
	 *
	 * @description This function sends data over a UDP socket.
	 *
	 * [% INCLUDE todo.tmpl msg='This function should report back the number of bytes sent successfully, and also needs error semantics.' %]
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
	send : function(callback, socketid, data) {
	    return this._doSocketUsageRequest(callback, 'udpSend', [socketid, data]);
	},

	/** 
	 * @method recv
	 * @static
	 *
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
	recv : function(callback, socketid, length, timeout) {
	    return this._doSocketUsageRequest(callback, 'udpRecv', [socketid, length, timeout]);
	},

	/** 
	 * @method sendrecv
	 * @static
	 *
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
	sendrecv : function(callback, socketid, data, length) {
	    return this._doSocketUsageRequest(callback, 'udpSendrecv', [socketid, data, length]);
	},

	/**
	 * @method recvstart
	 * @static 
	 *
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
	recvstart : function(callback, socketid, length, asstring) {
	    var multiresponse = true;
	    if (asstring == undefined) {
		asstring = false;
	    }
	    return this._doSocketUsageRequest(callback, 'udpRecvstart',
				       [socketid, length, asstring], multiresponse);
	},

	/**
	 * @method recvstop
	 * @static 
	 *
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
	recvstop : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvstop', [socketid]);
	},

	/** 
	 * @method sendto
	 * @static
	 *
	 * @description This function sends data over a UDP socket, to a
	 * specific destination.
	 *
	 * [% INCLUDE todo.tmpl msg='This function should report back the number of bytes sent successfully, and also needs error semantics.' %]
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
	sendto : function(callback, socketid, data, ip, port) {
	    return this._doSocketUsageRequest(callback, 'udpSendto', [socketid, data, ip, port]);
	},

	/** 
	 * @method recv
	 * @static
	 *
	 * @description This function receives data on a UDP socket,
	 * from a specific sender.
	 *
	 * [% INCLUDE todo.tmpl msg='This function is not complete. It still needs the IP address and port we want to receive from.' %]
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
	recvfrom : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvfrom', [socketid]);
	},

	/**
	 * @method recvfromstart
	 * @static 
	 *
	 * @description This function establishes a callback to get
	 * invoked automatically whenever data arrive on a given UDP
	 * socket, from a specific sender.  To stop receiving, call
	 * recvfromstop().
	 *
	 * [% INCLUDE todo.tmpl msg='This function is not complete. It still needs the IP address and port we want to receive from.' %]
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
	recvfromstart : function(callback, socketid, asstring) {
	    var multiresponse = true;
	    if (asstring == undefined) {
		asstring = false;
	    }
	    return this._doSocketUsageRequest(callback, 'udpRecvfromstart', 
				       [socketid, asstring], multiresponse);
	},

	/**
	 * @method recvfromstop
	 * @static 
	 *
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
	recvfromstop : function(callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpRecvfromstop', [socketid]);
	},

	/**
	 * @method setsockopt
	 * @static
	 *
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
	setsockopt : function(callback, socketid, name, value) {
	    return this._doSocketUsageRequest(callback, 'udpSetsockopt', [socketid, name, value]);
	},

	/** 
	 * @method getHostIP
	 * @static
	 *
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
	getHostIP : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpGetHostIP', [socketid]);
	},

	/** 
	 * @method getPeerIP
	 * @static
	 *
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
	getPeerIP : function (callback, socketid) {
	    return this._doSocketUsageRequest(callback, 'udpGetPeerIP', [socketid]);
	},
    } // udp
};