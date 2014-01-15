// Module API
var EXPORTED_SYMBOLS = ["Proto"];

Components.utils.import("resource://fathom/http.jsm");
Components.utils.import("resource://fathom/DNS/dns.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

/**
 * @class Proto
 * @description This module provides the application protocol API.
 *
 * @param {object} ctx        extension context
 */
var Proto = function(ctx) {
    // from extension context
    this._api = ctx.api; // fathom api for sockets etc.
    this._doSocketOpenRequest = ctx._doSocketOpenRequest.bind(ctx);

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
Proto.prototype = {
    /**
     * @class http
     *
     * @description This component provides an API for the HTTP protocol.
     *
     * @namespace fathom.proto
     */
    http : {
	
	/**
	 * @method create
	 * @static
	 *
	 * @description  This function creates and returns an HTTP object.
	 *
	 */
    	create: function() {
    	    return new HTTPRequest(this._api);
    	},
    	
	/**
	 * @method open
	 * @static
	 *
	 * @description  This function opens an HTTP connection to the specified URI/IP.
	 *
	 * @param {object} httpObj  This is the HTTP object created using the 'create' API.
	 * @param {string} url  This is the URL to be fetched.
	 * @param {function} lookup    This is a lookup function to resolve the domain of the given url and return the associated IP address.
	 * @param {string} IP    This is the IP address of the host. If the IP address is provided then url and lookup function are not used. IP address can be nullbut then both the url and lookup functions must be provided to establish the conenction. 
	 */   
    	open: function(httpObj, url, lookup, ip) {
    	    httpObj.httpOpen(url, lookup, ip);
    	},

	/**
	 * @method send
	 * @static
	 *
	 * @description  This function sends an HTTP request to the the specified host.
	 *
	 * @param {object} httpObj  This is the HTTP object created using the 'create' API.
	 * @param {string} method  This is the HTTP method to be used -- GET, POST, etc.
	 * @param {string} data    This is the query string for the request. It can null in case of GET.
	 * @param {object} headers    This represents the HTTP headers associated with the request. 
	 */     	
    	send: function(httpObj, method, data, headers) {
    	    httpObj.httpSend(method, data, headers);
    	},
    	
	/**
	 * @method receive
	 * @static
	 *
	 * @description  This function gets an HTTP response.
	 *
	 * @param {object} httpObj  This is the HTTP object created using the 'create' API.
	 * @param {function} recvCallback    This function is invoked when the response headers are available or chunked (or complete) response is available. This callback's signature is callback(type, data), where type can be 1 for HTTP headers, 3 for chunked response and 4 for complete response.
	 */     	
    	receive: function(httpObj, recvCallback) {
    	    httpObj.httpRecv(recvCallback);
    	},
    	
	/**
	 * @method getCertificateChain
	 * @static
	 *
	 * @description  This function gets a certificate chain information for the specified uri.
	 *
	 * @param {string} uri  This is uri for which certificate information is desired.
	 * @param {function} callback    This is a callback that is invoked when then complete certificate chain information is available. The information is available as a JSON string.
	 */ 	
    	getCertificateChain: function(uri, callback) {
    	    function makeURI(aURL, aOriginCharset, aBaseURI) {  
		var ioService = Cc["@mozilla.org/network/io-service;1"]
		    .getService(Ci.nsIIOService);  
		return ioService.newURI(aURL, aOriginCharset, aBaseURI);  
	    } 

	    function getSecurityInfo(channel) {

		var certificate = function () {
		}
		certificate.prototype = {
		    nickname: null,
		    emailAddress: null,
		    subjectName: null,
		    commonName: null,
		    organization: null,
		    organizationalUnit: null,
		    sha1Fingerprint: null,
		    md5Fingerprint: null,
		    tokenName: null,
		    issuerName: null,
		    serialNumber: null,
		    issuerCommonName: null,
		    issuerOrganization: null,
		    issuerOrganizationUnit: null,
		    validity: null,
		    dbKey: null
		};

		var info = {
		    security: {
			state: null,
			description: null,
			errorMsg: null
		    },
		    certs: []
		};

		try {
		    if (! channel instanceof  Ci.nsIChannel) {
			info = null;
			return;
		    }
		    
		    var secInfo = channel.securityInfo;
		    if (secInfo instanceof Ci.nsITransportSecurityInfo) {
			secInfo.QueryInterface(Ci.nsITransportSecurityInfo);
			
			if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_SECURE) == Ci.nsIWebProgressListener.STATE_IS_SECURE)
			    info.security.state = "Secure";
			
			else if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_INSECURE) == Ci.nsIWebProgressListener.STATE_IS_INSECURE)
			    info.security.state = "Insecure";
			
			else if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_BROKEN) == Ci.nsIWebProgressListener.STATE_IS_BROKEN)
			    info.security.state = "Unknown";
			
			info.security.description = secInfo.shortSecurityDescription;
			info.security.errorMsg = secInfo.errorMessage;
		    }
		    else
			info.security = null;
		    
		    // Get SSL certificate details
		    if (secInfo instanceof Ci.nsISSLStatusProvider) {
			
			var status = secInfo.QueryInterface(Ci.nsISSLStatusProvider).SSLStatus.QueryInterface(Ci.nsISSLStatus);
			
			var serverCert = status.serverCert;
			if (serverCert instanceof Ci.nsIX509Cert) {
			    var certChain = serverCert.getChain().enumerate();

			    while (certChain.hasMoreElements()) {
				var cert = certChain.getNext().QueryInterface(Ci.nsIX509Cert2);
				
				var tmp = new certificate();
				for(var i in tmp)
				    if(cert[i])
					tmp[i] = cert[i];
				
				info.certs.push(tmp);
			    }
			}
		    }
		    return info;
		} catch(e) {
		    return null;
		}
	    }

	    var httpRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
	    httpRequest.mozBackgroundRequest = true;
	    httpRequest.open("GET", makeURI(uri, null, null).prePath, true); 
	    httpRequest.onreadystatechange = function (aEvt) {  
		if (httpRequest.readyState == 4) {
		    var info = getSecurityInfo(httpRequest.channel);
		    callback(JSON.stringify(info));
		}
	    };
	    httpRequest.send(null);
    	}
    }, // http
    
    /**
     * @class dns
     *
     * @description This component provides an API for the DNS protocol.
     *
     * @namespace fathom.proto
     */
    dns : {
	// XXX This is supposed to open an mDNS listening socket.  We
	// bumped into problems here when a host-local mDNS daemon is
	// already listening.  Resolve?
	open : function(callback, ip, port, ttl) {
	    this._doSocketOpenRequest(callback, 'dnsOpen', [ip, port, ttl]);
	},      

	/**
	 * @method lookup
	 * @static
	 *
	 * @description  This function implements an asynchronous DNS lookup.
	 *
	 * [% INCLUDE todo.tmpl msg='(1) Needing to provide a URL is cumbersome and unintuitive.  (2) Error semantics are missing.' %]
	 *
	 * @param {function} callback Fathom invokes this callback upon
	 * arrival of the DNS response.  If successful, the callback
	 * receives a dictionary whose members convey the DNS response.
	 *
	 * @param {string} url  URL containing the name to look up.
	 */
	lookup : function(callback, url) {
	    // XXX A URL as argument? --cpk
	    if (url == "about:blank" || url == "about:home")
		url = "http://www.google.com/";
	    
	    var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	    var service = Components.classes["@mozilla.org/network/dns-service;1"].getService(Components.interfaces.nsIDNSService);
	    var flag = Components.interfaces.nsIDNSService.RESOLVE_BYPASS_CACHE | Components.interfaces.nsIDNSService.RESOLVE_CANONICAL_NAME;

	    try {
		var aURI = ioService.newURI(url, null, null);
	    } catch (e) {
		// FIXME: return error?!?
		url = "http://www.google.com/";
		aURI = ioService.newURI(url, null, null);
	    }

	    var dns = {
		uri : url,
		ip : [],
		cname : null,
		__exposedProps__: {
		    uri: "r",
		    ip: "r",
		    cname: "r"
		}
	    }

	    var dnsCallback = {
		onLookupComplete: function(request, record, status){
		    if (record != null){
			while (record.hasMore()) {
			    dns.ip.push(record.getNextAddrAsString());
			}
			dns.cname = record.canonicalName;
		    }
		    callback(dns);
		}
	    };

	    var thread = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager).currentThread;

	    if (aURI && aURI.host)
		service.asyncResolve(aURI.host, flag, dnsCallback, thread);

	}, // lookup
	
	// lower level DNS APIs which can be used to build higher functionalities
	// create, query, response, sendRecv
	
	// returns a DNS object;
	/**
	 * @method create
	 * @static
	 *
	 * @description  This function creates and returns a DNS object.
	 *
	 * @param {string} proto  Indicates the protocol to be used for communication with the resolver, i.e., either 'udp' or 'tcp'.
	 */
	create: function(proto) {
      	    return new DNS(proto, this._api);
	},
	
	// returns a DNS query;
	/**
	 * @method query
	 * @static
	 *
	 * @description  This function creates a DNS query.
	 *
	 * @param {object} dnsObj  This is the DNS object created using the 'create' API.
	 * @param {string} domain  This is the domain to be resolved.
	 * @param {integer} type    This is the DNS record type, e.g., 1 for 'A' as mentioned in RFC1035 (and other RFCs), etc.
	 * @param {integer} recordClass    This is the DNS record class, e.g., 1 for 'IN', 2 for 'CS', 3 for 'CH', 4 for 'HS', etc.
	 * @param {integer} flags    This is the DNS flag options, e.g., '0x0100' for query.
	 */      
	query: function(dnsObj, domain, type, recordClass, flags) {
	    return dnsObj.query(domain, type, recordClass, flags);
	},
	
	// invokes a callback once a complete DNS response is received;
	/**
	 * @method response
	 * @static
	 *
	 * @description  This function creates a DNS response from the data received.
	 *
	 * @param {object} dnsObj  This is the DNS object created using the 'create' API.
	 * @param {array} buf  This is a buffer for the response received.
	 * @param {string} domain    This is the domain to be resolved.
	 * @param {function} callback    This is a callback to be invoked on receiveing a valid DNS response.
	 */        
	response: function(dnsObj, buf, domain, callback) {
	    dnsObj.response(buf, domain, callback);
	},
	
	// sends a DNS query and receives its response;
	/**
	 * @method sendRecv
	 * @static
	 *
	 * @description  This API performs low-level socket operations based on the protocol selected and sends and receives data.
	 *
	 * @param {object} dnsObj  This is the DNS object created using the 'create' API.
	 * @param {string} server  This is the IP for the DNS resolver.
	 * @param {integer} port  This the port to be used on the resolver.
	 * @param {array} data    This is typically the return value of the query API.
	 * @param {function} sendCallback    This is a callback to be invoked on a socket send operation.
	 * @param {function} receiveCallback    This is a callback to be invoked on a socket receive operation. Typically, it should invoke the response API to parse the response into a DNS response.
	 */      
	sendRecv: function(dnsObj, server, port, data, sendCallback, receiveCallback) {
	    dnsObj.proto.sendRecv(server, port, data, sendCallback, receiveCallback);
	}	
    }, // dns
    
    /**
     * @class upnp
     *
     * @description This module provides an API for the UPnP protocol.
     *
     * @module fathom.upnp
     */
    upnp : {
	/**
	 * @method open
	 * @static
	 *
	 * @description This function opens a multicast listening socket
	 * suitable for initiating the UPnP discovery phase.
	 *
	 * [% INCLUDE todo.tmpl msg='(1) Seems the IP and port should have default values.  (2) Why the argument?' %]
	 *
	 * @param {function} callback The callback Fathom invokes once
	 * the operation completes.  When successful, its only argument
	 * is a socket descriptor.  On error, its only argument is a
	 * dictionary whose member "error" describes the problem that
	 * occurred.
	 *
	 * @param {string} ip The IP address to listen on.
	 *
	 * @param {integer} port The port to listen on.
	 *
	 * @param {integer} ttl The IP TTL to set on the socket.
	 */
	open : function(callback, ip, port, ttl) {
	    this._doSocketOpenRequest(callback, 'upnpOpen', [ip, port, ttl]);
	},
    }, // upnp
};