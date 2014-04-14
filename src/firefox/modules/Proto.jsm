/** 
 * @author Anna-Kaisa Pietilainen <anna-kaisa.pietilainen@inria.fr>
 */

/** Module API 
 * @private
 */
var EXPORTED_SYMBOLS = ["Proto"];

Components.utils.import("resource://fathom/http.jsm");
Components.utils.import("resource://fathom/DNS/dns.jsm");
Components.utils.import("resource://fathom/DNS/mdns.jsm");
Components.utils.import("resource://fathom/upnp.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

var Proto = function(ctx) {
    /**
     * @description fathom.proto.* namespace. Javascript implementations of various application level protocols.
     * @exports fathom/proto
     */
    var proto = {};
    
    /**
     * @exports fathom/proto/http
     */
    var http = proto.http = {};
	    
    /**
     * @description  This function creates and returns an HTTP object.
     */
	http.create = function() {
		return new HTTPRequest(ctx.api);
	};
	    
    /**
     * @description  This function opens an HTTP connection to the specified URI/IP.
     *
     * @param {object} httpObj  This is the HTTP object created using the 'create' API.
     * @param {string} url  This is the URL to be fetched.
     * @param {function} lookup    This is a lookup function to resolve the domain of the given url and return the associated IP address.
     * @param {string} IP    This is the IP address of the host. If the IP address is provided then url and lookup function are not used. IP address can be nullbut then both the url and lookup functions must be provided to establish the conenction. 
     */   
    http.open = function(httpObj, url, lookup, ip) {
        httpObj.httpOpen(url, lookup, ip);
    };

    /**
     * @description  This function sends an HTTP request to the the specified host.
     *
     * @param {object} httpObj  This is the HTTP object created using the 'create' API.
     * @param {string} method  This is the HTTP method to be used -- GET, POST, etc.
     * @param {string} data    This is the query string for the request. It can null in case of GET.
     * @param {object} headers    This represents the HTTP headers associated with the request. 
     */     	
    http.send = function(httpObj, method, data, headers) {
	    httpObj.httpSend(method, data, headers);
    };
	    
    /**
     * @description  This function gets an HTTP response.
     *
     * @param {object} httpObj  This is the HTTP object created using the 'create' API.
     * @param {function} recvCallback    This function is invoked when the response headers are available or chunked (or complete) response is available. This callback's signature is callback(type, data), where type can be 1 for HTTP headers, 3 for chunked response and 4 for complete response.
     */     	
	http.receive = function(httpObj, recvCallback) {
		httpObj.httpRecv(recvCallback);
	};
	    
    /**
     * @description  This function gets a certificate chain information for the specified uri.
     *
     * @param {string} uri  This is uri for which certificate information is desired.
     * @param {function} callback    This is a callback that is invoked when then complete certificate chain information is available. The information is available as a JSON string.
     */ 	
	 http.getCertificateChain = function(uri, callback) {
		var makeURI = function(aURL, aOriginCharset, aBaseURI) {  
	        var ioService = Cc["@mozilla.org/network/io-service;1"]
                .getService(Ci.nsIIOService);  
	            return ioService.newURI(aURL, aOriginCharset, aBaseURI);  
         }; 
        var getSecurityInfo = function(channel) {
            var certificate = function () {
            };
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
    	}; // get sec info

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
    };
	
	/**
	 * @description This component provides an API for the DNS protocol.
	 *
	 * @exports fathom/proto/dns
	 */
	var dns = proto.dns = {};
    
    /**
     * @description  This function implements an asynchronous DNS lookup.
     *
     * @param {function} callback Fathom invokes this callback upon
     * arrival of the DNS response.  If successful, the callback
     * receives a dictionary whose members convey the DNS response.
     *
     * @param {string} url  URL containing the name to look up.
     */
    dns.lookup = function(callback, url) {
    	// XXX A URL as argument? --cpk
    	if (url == "about:blank" || url == "about:home")
    	    url = "http://www.google.com/";
	
    	var ioService = Cc["@mozilla.org/network/io-service;1"]
    	    .getService(Ci.nsIIOService);
    	var service = Cc["@mozilla.org/network/dns-service;1"]
    	    .getService(Ci.nsIDNSService);
    	var flag = Ci.nsIDNSService.RESOLVE_BYPASS_CACHE | Ci.nsIDNSService.RESOLVE_CANONICAL_NAME;

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

    	var thread = Cc["@mozilla.org/thread-manager;1"]
    	    .getService(Ci.nsIThreadManager).currentThread;
    	if (aURI && aURI.host)
    	    service.asyncResolve(aURI.host, flag, dnsCallback, thread);
    }; // lookup
    
    // lower level DNS APIs which can be used to build higher functionalities
    // create, query, response, sendRecv
    
    /**
     * @description  This function creates and returns a DNS object.
     *
     * @param {string} proto  Indicates the protocol to be used for communication with the resolver, i.e., either 'udp' or 'tcp'.
     * @param {string} server  This is the IP for the DNS resolver (optional).
     * @param {integer} port  This the port to be used on the resolver (optional).
     */
    dns.create = function(proto, server, port) {
  		return new DNS(proto, ctx.api, server, port);
    };
    
    /**
     * @description  This function creates a DNS query.
     *
     * @param {object} dnsObj  This is the DNS object created using the 'create' API.
     * @param {string} domain  This is the domain to be resolved.
     * @param {integer} type    This is the DNS record type, e.g., 1 for 'A' as mentioned in RFC1035 (and other RFCs), etc.
     * @param {integer} recordClass    This is the DNS record class, e.g., 1 for 'IN', 2 for 'CS', 3 for 'CH', 4 for 'HS', etc.
     * @param {integer} flags    This is the DNS flag options, e.g., '0x0100' for query.
     */      
    dns.query = function(dnsObj, domain, type, recordClass, flags) {
    	if (!dnsObj || !dnsObj.query)
    	    throw "Expected DNS object as first argument!";
    	return dnsObj.query(domain, type, recordClass, flags);
    };
    
    /**
     * @description  This function creates a DNS response from the data received.
     *
     * @param {object} dnsObj  This is the DNS object created using the 'create' API.
     * @param {array} buf  This is a buffer for the response received.
     * @param {string} domain    This is the domain to be resolved.
     * @param {function} callback    This is a callback to be invoked on receiveing a valid DNS response.
     */        
    dns.response = function(dnsObj, buf, domain, callback) {
    	if (!dnsObj || !dnsObj.response)
    	    throw "Expected DNS object as first argument!";
    	dnsObj.response(buf, domain, callback);
    };
    
    /**
     * @description  This API performs low-level socket operations based on the protocol selected and sends and receives data.
     *
     * @param {object} dnsObj  This is the DNS object created using the 'create' API.
     * @param {string} server  This is the IP for the DNS resolver.
     * @param {integer} port  This the port to be used on the resolver.
     * @param {array} data    This is typically the return value of the query API.
     * @param {function} sendCallback    This is a callback to be invoked on a socket send operation.
     * @param {function} receiveCallback    This is a callback to be invoked on a socket receive operation. Typically, it should invoke the response API to parse the response into a DNS response.
     */      
    dns.sendRecv = function(dnsObj, server, port, data, sendCallback, receiveCallback, timeout) {
    	if (!dnsObj || !dnsObj.sendRecv)
    	    throw "Expected DNS object as first argument!";

    	dnsObj.proto.sendRecv(server, port, data, sendCallback, receiveCallback, timeout);
    };

    /** Cleanup and close any pending receive sockets 
     *  (created by sendRecv -functions). 
     *
     * @param {function} cb    Callback on close (optional).
     */
    dns.close = function(dnsObj, cb) {
    	if (!dnsObj || !dnsObj.close)
    	    throw "Expected DNS object as first argument!";

    	dnsObj.proto.close(cb);
    };

	/**
	 * @description This module provides an API for the mDNS protocol.
	 * @exports fathom/proto/mdns
	 */
	var mdns = proto.mdns = {};

    /**
     * @description  This function creates and returns a mDNS object.
     */
    mdns.create = function() {
  		return new mDNS(ctx);
    };

    /** 
     * @description Perform mDNS service search.
     * @param {function} cb    Callback to return mDNS responses
     */
    mdns.discovery = function(mdnsObj, cb) {
    	if (!mdnsObj || !mdnsObj.discovery)
    	    throw "Expected mDNS object as first argument!";
    	mdnsObj.discovery(cb);
    };

    /** 
     * Cleanup and close any pending receive sockets 
     *  (created by sendRecv -functions). 
     * @param {function} cb    Callback on close (optional).
     */
    mdns.close = function(mdnsObj, cb) {
    	if (!mdnsObj || !mdnsObj.close)
    	    throw "Expected mDNS object as first argument!";
    	mdnsObj.close(cb);
    };
	
	/**
	 * @description This module provides an API for the UPnP protocol.
	 * @exports fathom/proto/upnp
	 */
	var upnp = proto.upnp = {};
    
    /**
     * @description  This function creates and returns a upnp object.
     */
    upnp.create = function() {
  		return new Upnp(ctx);
    };

    /** 
     * @description Perform UPnP service discovery.
     * @param {function} cb    Callback to return UPnP responses
     */
    upnp.discovery = function(upnpObj, cb) {
    	if (!upnpObj || !upnpObj.discovery)
    	    throw "Expected upnp object as first argument!";
    	upnpObj.discovery(cb);
    };

    /** @description Cleanup and close any pending receive sockets 
     *  (created by sendRecv -functions). 
     *
     * @param {function} cb    Callback on close (optional).
     */
    upnp.close = function(upnpObj, cb) {
    	if (!upnpObj || !upnpObj.close)
    	    throw "Expected upnp object as first argument!";
    	upnpObj.close(cb);
    };
    
    return proto;
}; // Proto 