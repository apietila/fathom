// Module API
var EXPORTED_SYMBOLS = ["Security"];

// Imports
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://fathom/Logger.jsm");
Components.utils.import("resource://fathom/utils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

const valid_apis = ['socket','proto','system','tools'];

var _contains = function(list,value) {
    for (var i = 0; i < list.length; i++) {
	if (list[i] === value)
	    return true;
    }
    return false;
};

/**
 * @class Security
 *
 * @description This module provides all the security functionality. Each page
 * initialises its own security object.
 *
 * @param {object} loc        window location object
 * @param {string} os         os string
 * @param {array}  subnets    list of local network interface subnet IPs
 * @param {object} manifest   manifest of the page requesting Fathom API access
 */
var Security = function(loc, os, subnets, manifest) {
    this.os = os;
    this.subnets = subnets;
    this.url = loc.href;
    this.origin = loc.origin;
    this.manifest = manifest;

    // Built-in chrome pages have some privilegies
    this.ischromepage = false;
    if (this.origin.indexOf('about')==0)
	this.ischromepage = true;

    Logger.info("security : parsing manifest for page " + 
		this.url + " [" + this.origin + "] chrome=" + this.ischromepage);

    // api -> list of requested methods or [*]
    this.requested_apis = {};
    if (manifest.api) {
	for (var i = 0; i < manifest.api.length; i++) {
	    var api = manifest.api[i].trim();

	    var parts = api.split('.');
	    if (parts.length<2)
		throw "Invalid API defintion : " + api;

	    var apimodule = parts[0];
	    if (!_contains(valid_apis,apimodule))
		throw "Invalid API module : " + apimodule;

	    var apifunc = api.replace(apimodule+".","");

	    if (!(this.requested_apis[apimodule]))
		this.requested_apis[apimodule] = [];
	    this.requested_apis[apimodule].push(apifunc);
	    Logger.info("security : " + apimodule + "." + apifunc + " requested");
	}
    } else {
	Logger.info("security : manifest does not request any method permissions");
    }

    // dst -> parsed spec obj
    this.requested_destinations = {};

    // Helper to parse dst api part
    var parseapi = function(apistr) {
	if (!apistr || apistr === '*') {
	    return '*';
	}

	// socket namespace ?
	if (apistr.indexOf('socket.*')>=0) {
	    return 'socket.*';
	}
	if (apistr.indexOf('udp')>=0) {
	    return 'socket.udp.*';
	}
	if (apistr.indexOf('multicast')>=0) {
	    return 'socket.multicast.*';
	}
	if (apistr.indexOf('broadcast')>=0) {
	    return 'socket.broadcast.*';
	}
	if (apistr.indexOf('tcp')>=0) {
	    return 'socket.tcp.*';
	}

	// proto namespace ?
	if (apistr.indexOf('proto.*')>=0) {
	    return 'proto.*';
	}
	if (apistr.indexOf('http')>=0) {
	    return 'proto.http.*';
	}
	if (apistr.indexOf('dns')>=0) {
	    return 'proto.dns.*';
	}
    }

    // Helper to parse dst port part
    var parseport = function(pstr) {
	if (!pstr || pstr === '*') {
	    return ['*'];
	}
	return pstr.split(',')
    };

    // Helper to parse dst IP part
    var parsedest = function(dststr) {
	if (!dststr || dststr === '*') {
	    return { any : true};
	}
	if (dststr === '{mdns}') {
	    return { mdns : true};
	}
	if (dststr === '{upnp}') {
	    return { upnp : true};
	}
	if (dststr === '<localnet>') {
	    return { lan : true};
	}
	if (dststr === '<origin>') {
	    return { origin : true,
		     host : this.origin};
	}
	return { host : this.dststr};
    };

    if (manifest.destinations) {
	for (var i = 0; i < manifest.destinations.length; i++) {
	    // format Fathom API :// destinations : ports
	    var dst = manifest.destinations[i].trim(); 
	    var d = dst.split(':');	    
	    var obj = { api : null,
		        destination : null,
		        ports : null
		      };

	    switch (d.length) {
	    case 3:
		// API :// destinations : ports
		obj.api = parseapi(d[0]);
		obj.destination = parsedest(d[1].substring(2));
		obj.ports = parseport(d[2]);
		break;
	    case 2:
		if (d[1].indexOf('\/\/')>=0) {
		    // *://destination
		    obj.api = parseapi(d[0]);
		    obj.destination = parsedest(d[1].substring(2));
		    obj.ports = parseport();
		} else {
		    // destination:port
		    obj.api = parseapi();
		    obj.destination = parsedest(d[0].substring(2));
		    obj.ports = parseport(d[1]);
		}
		break;
	    case 1:
		obj.api = parseapi();
		obj.destination = parsedest(d[0]);
		obj.ports = parseport();
		break;
	    default:
		throw "Invalid destination : " + dst;
	    }

	    Logger.info("security : " + dst + " requested");
	}
    } else {
	Logger.info("security : manifest does not request any destinations");
    }

    // checked destinations, filled upon first request for each destination
    this.allowed_destinations = {};

    // discovered destinations
    this.discovered_destinations = [];

    if (!this.ischromepage) {
	// TODO: check from prefs/local storage if user has already accepted
	// this manifest for the URL (exact matches required)

	this.user_prompt = true; // extension should prompt user about the manifest
	this.manifest_accepted = false;
	Logger.info("security : manifest requires user confirmation (web page)");

    } else {
	// don't ask the user on build-in chrome pages
	this.user_prompt = false;
	this.manifest_accepted = true;
	Logger.info("security : manifest requires no user confirmation (chrome page)");
    }
};

/**
 * @method askTheUser
 * @description Show a dialog to ask the user to validate the manifest.
 */
Security.prototype.askTheUser = function(cb) {
    var that = this;

    if (!this.user_prompt) {
	cb(this.manifest_accepted);
	return;
    }

    // handle response from the user prompt
    var callback = function(res) {
	Logger.debug(res);

	if (res && res.result && res.result !== 'no')
	    that.manifest_accepted = true;
	else
	    that.manifest_accepted = false;

	if (res && res.result && res.result === 'always') {
	    // TODO: store the user response to prefs/local storage if 'Allow Always'
	    Logger.debug("ask user result : save to db [TODO]");
	}

	that.user_prompt = false;
	cb(that.manifest_accepted);
    }

    if (this.os == "android") {
        var privs = "";
	for (var apimodule in this.requested_apis) {
	    apifunc = this.requested_apis[apimodule];
	    privs += apimodule + '.' + apifunc + ",";
	}
        var dest = "";
	for (var d in this.requested_destinations) {
	    dest += d + ", ";
	}
	dest = dest.substring(0,dest.length-2);	
	
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
	    .getService(Ci.nsIPromptService);
	var result = 
	    prompts.confirm(null, 
			    "A web page is requesting Fathom privileges.", 
			    "Url: " + this.url + "\nAPI(s): " + privs + "\nDestination(s): " + dest + "\n\nWould you like to grant access to Fathom APIs.");

	// TODO: have three button dialog on Android ?

	if (result) {
	    callback({result : 'once'});
	} else {
	    callback({result : 'no'});
	}
	
    } else {
	// Show dialog page on other platforms
	var windowargs = {
	    url: this.url,
	    callback: callback,
	    requested_apis: this.requested_apis,
	    requested_destinations: this.requested_destinations,
	};
	windowargs.wrappedJSObject = windowargs;    

        var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"]
            .getService(Ci.nsIWindowWatcher);
        ww.openWindow(null, 
		      "chrome://fathom/content/page_permissions.html",
                      null, 
		      "chrome,centerscreen,modal,dependent,width=600,height=400",
                      windowargs);
    }
};

/**
 * @method setAvailableMethods
 * @description Sets the allowed API methods visible using __exposedProps.
 */
Security.prototype.setAvailableMethods = function(api,apiobj) {
    var that = this;
    const probkey = '__exposedProps__';

    var checknset = function(obj,subns) {
	obj[probkey] = {}; // init exposedProps

	for (var p in obj) {
	    if (p.indexOf('_') === 0) {
		continue; // never expose methods starting with _
	    }

	    if (typeof obj[p] === "function") {
		// match function to the page manifest

		if (_contains(that.requested_apis[api],'*')) {
		    // all methods requested
		    obj[probkey][p] = 'r';
		} else if (_contains(that.requested_apis[api],p)) {
		    // method requested explicitely
		    obj[probkey][p] = 'r';
		} else if (subns && _contains(that.requested_apis[api],subns + ".*")) {
		    // all subns methods requested
		    obj[probkey][p] = 'r';
		} else if (subns && _contains(that.requested_apis[api],subns + "." + p)) {
		    // subns method requested explicitely
		    obj[probkey][p] = 'r';
		} // else 'p' is not requested - do not set visible

	    } else if (typeof obj[p] === "object") {
		// recurse to object and check its members
		var newsubns = p+"";
		if (subns)
		    newsubns = subns + "." + p;

		obj[probkey][p] = 'r'; // make p object readable
		obj[p] = checknset(obj[p],newsubns);

	    } // TODO: else can we ignore all other types ?

	} // end for

	Logger.debug(api + (subns ? "." + subns : ""));
	Logger.debug(obj[probkey]);
	return obj;
    };

    Logger.info("security : available methods check for \'" + api + "\' namespace");

    if (this.manifest_accepted) {
	if (this.requested_apis[api] && this.requested_apis[api].length>0) {
	    apiobj = checknset(apiobj);
	} else {
	    Logger.warning("security : manifest did not request any methods for this api");
	}
    } else {	
	Logger.warning("security : manifest not accepted by user");
    }

    return apiobj;
};

/**
 * @method addNewDiscoveredDevice
 * @description Add a new discovered device to the list of allowed destinations depending
 * on the security policy and user consent.
 */
Security.prototype.addNewDiscoveredDevice = function(dobj, proto) {
    Logger.info("security : new device " + dobj.ipv4 + " by " + proto.name);

    // check if the policy allows this discovery protocol
    var ok = false;
    for (var dst in this.requested_destinations) {
	if (dst[proto.name]) {
	    // ok found in the manifest
	    ok = true;
	    break;
	}
    }
    if (ok)
	this.discovered_destinations.push(dobj.ipv4);
    return ok;
},

/**
 * @method isDestinationAvailable
 * @description Check if we are allowed to connect to a given destination:port using 
*  the proto (proto and port can be undefined and allowed if '*' requested).
 */
Security.prototype.checkDestinationPermissions = function(cb, dst, port, proto) {
    Logger.info("security : check permission for " + dst + " by " + proto);

    if (!this.manifest_accepted) {
	// User did not allow Fathom to be used in this page - allow nothing
	Logger.warning("security : manifest not accepted by user, no allowed destinations");
	cb({error : "User did not not accept the page manifest."});
	return;
    }

    // check the manifest policy
    if (this.allowed_destinations[dst] === undefined) {
	if (this.ischromepage) {
	    this.allowed_destinations[dst] = true;
	} else {
	    var allowed = false;
	    // now compare the required proto://dst:port to each 
	    // requested destination in the manifest
	    for (var dst in this.requested_destinations) {
		var spec = this.requested_destinations[dst];

		// protocol match?
		var protook = false;
		if (proto) {
		    var re = new RegExp(spec.api);
		    protook = re.test(proto);
		} else {
		    protook = (spec.api === '*');
		}

		// port match ?
		var portok = false;
		if (!port) port = '*';
		portok = _contains(spec.ports,port);
		
		// dst match ?
		var dstok = false;
		if (spec.any) {
		    dstok = true;
		} else if ((spec.mdns || spec.upnp) && 
			   _contains(this.discovered_destinations, dst)) {
		    dstok = true;
		} else if (spec.lan && this.subnets) {
		    // dst should be in our lan subnet
		    for (var sb in this.subnets) {
		    }
		} else if (spec.host) {
		    // TODO: does not allow url wildcards.. *.google.com etc
		    dstok = (spec.host == dst);
		}

		if (protook && portok && dstok) {
		    // found a match, we're done
		    allowed = true;
		    break;
		}
	    } // for
	    this.allowed_destinations[dst] = allowed;
	}
    }
    Logger.info("security : result " + this.allowed_destinations[dst]);
    
    if (this.allowed_destinations[dst])
	cb({});
    else
	cb({error : "Connection to " + proto + "://" + dst + ":" + port + 
	    " not allowed"});
};
