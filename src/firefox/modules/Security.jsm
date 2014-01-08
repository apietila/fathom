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
 * initialized its own security object.
 *
 * @param {object} loc      The window location object
 * @param {object} manifest The manifest of the page requesting Fathom API access
 */
var Security = function(loc, os, manifest) {
    this.os = os;

    // the page url and requested APIs
    this.url = loc.href;
    this.domain = loc.origin;
    this.manifest = manifest;
    this.ischromepage = false; // TODO: check the loc

    Logger.info("security : parsing manifest for page " + 
		this.url + " [" + this.domain + "]");

    // api -> list of methods or [*]
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
	}
    }

    // dst -> type [range|proto|ipv4|ipv6|other]
    this.requested_destinations = {};

    // acb[.xyz]+.*
    var subipre = /\d{1,3}.*\.\*/;

    // xxx://
    var protore = /\w+:\/\//;

    // ip address
    var ipv4re = /\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}/;
    var ipv6re = /([0-9a-f]:)+/;

    if (manifest.destinations) {
	for (var i = 0; i < manifest.destinations.length; i++) {
	    var d = manifest.destinations[i].trim();
	    if (subipre.test(d)) {
		this.requested_destinations[d] = 'range';
	    } else if (protore.test(d)) {
		this.requested_destinations[d] = 'proto';
	    } else if (ipv4re.test(d)) {
		this.requested_destinations[d] = 'ipv4';
	    } else if (ipv6re.test(d)) {
		this.requested_destinations[d] = 'ipv6';
	    } else {
		this.requested_destinations[d] = 'other';
	    }
	}
    }

    // checked destinations
    this.allowed_destinations = {};

    if (!this.ischromepage) {
	// TODO: check from prefs/local storage if user has already accepted
	// this manifest for the URL (exact matches required)

	this.user_prompt = true; // extension should prompt user about the manifest
	this.manifest_accepted = false;
	Logger.info("security : manifest requires user confirmation");

    } else {
	// don't ask the user on build-in chrome pages
	this.user_prompt = false;
	this.manifest_accepted = true;
	Logger.info("security : manifest requires no user confirmation");
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
	var dest = this.requested_destinations.join(",");
	
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
	    .getService(Ci.nsIPromptService);
	var result = 
	    prompts.confirm(null, 
			    "A web page is requesting Fathom privileges.", 
			    "Url: " + this.url + "\nAPIs: " + privs + "\nDestination: " + dest + "\n\nWould you like to grant access to Fathom APIs.");

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
    apiobj['__exposedProps__'] = {};
    Logger.info("security : api check for " + api);

    if (this.manifest_accepted) {
	if (this.requested_apis[api] && 
	    this.requested_apis[api].length>0) {
	    for (var p in apiobj) {
		if (p.indexOf('_') === 0) {
		    continue; // never expose methods starting with _
		}

		if (_contains(this.requested_apis[api],p)) {
		    // method requested explicitely
		    apiobj['__exposedProps__'][p] = 'r';
		} else if (_contains(this.requested_apis[api],'*')) {
		    // all methods requested
		    apiobj['__exposedProps__'][p] = 'r';
		} // else 'p' is not requested - do not set visible
	    }
	} else {
 	    // else nothing requested
	    Logger.warning("security : manifest did not request any methods for this api");
	}
    } else {	
 	// else manifest disallowed - allow nothing
	Logger.warning("security : manifest not accepted by user");
    }
    return apiobj;
};

/**
 * @method isDestinationAvailable
 * @description Check if we are allowed to connect to a given destination.
 */
Security.prototype.isDestinationAvailable = function(cb,dst) {
    // User did not allow Fathom to be used in this page - allow nothing
    if (!this.manifest_accepted) {
	Logger.warning("security : manifest not accepted by user, no allowed destinations");
	cb(false);
	return;
    }    

    // Check if we already verified this dst
    if (dst in this.allowed_destinations) {
	cb(this.allowed_destinations[dst]);
	return;
    }

    var mok = this.ischromepage; // allow any destination from chrome pages
    // TODO test match

    if (mok) {
	// TODO: check if the dst serverPolicy allows connection from this url or domain

	this.allowed_destinations[dst] = true;
	cb(this.allowed_destinations[dst]);
	return;

    } else {
	// did not check against the manifest
	this.allowed_destinations[dst] = false;
	cb(this.allowed_destinations[dst]);
	return;
    }
};
