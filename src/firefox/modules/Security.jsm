// Module API
var EXPORTED_SYMBOLS = ["Security"];

// Imports
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://fathom/Logger.jsm");
Components.utils.import("resource://fathom/utils.jsm");

const Cc = Components.classes;
const valid_apis = ['socket','proto','system','tools'];

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
    Logger.debug("init security module on " + os);
    Logger.debug(JSON.stringify(loc,null,2));
    Logger.debug(JSON.stringify(manifest,null,2));

    this.os = os;

    // the page url and requested APIs
    this.url = loc.href;
    this.domain = loc.origin;
    this.manifest = manifest;
    this.ischromepage = false; // TODO: check the loc

    // api -> list of methods or [*]
    var tmp = {};
    if (manifest.api) {
	for (var i = 0; i < valid_apis.length; i++)
	    tmp[valid_apis[i]] = [];

	for (var i = 0; i < manifest.api.length; i++) {
	    var api = manifest.api[i].trim();

	    var parts = api.split('.');
	    if (parts.length<2)
		throw "Invalid API defintion : " + api;

	    var apimodule = parts[0];
	    if (tmp[apimodule] === undefined)
		throw "Invalid API module : " + apimodule;

	    var apifunc = api.replace(apimodule+".","");
	    tmp[apimodule].append(apifunc);
	}
    }
    Logger.debug(JSON.stringify(tmp,null,2));
    this.requested_apis = tmp;
    Logger.debug(JSON.stringify(this.requested_apis,null,2));

    // dst -> type [range|proto|host|ipv4|ipv6]
    this.requested_destinations = {};

    // checked destinations
    this.allowed_destinations = {};

    if (!this.ischromepage) {
	// TODO: check from prefs/local storage if user has already accepted
	// this manifest for the URL (exact matches required)

	this.user_prompt = true; // extension should prompt user about the manifest
	this.manifest_accepted = false;
    } else {
	// don't ask the user on build-in chrome pages
	this.user_prompt = false;
	this.manifest_accepted = true;
    }
};

/**
 * @method askTheUser
 * @description Show a dialog to ask the user to validate the manifest.
 */
Security.prototype.askTheUser = function(cb) {
    Logger.debug("ask user");
    if (!this.user_prompt) {
	Logger.debug("ask user said : " + this.manifest_accepted);
	cb(this.manifest_accepted);
	return;
    }

    // handle response from the user prompt
    var callback = function(res) {
	if (res && res.result && res.result !== 'no')
	    this.manifest_accepted = true;
	else
	    this.manifest_accepted = false;

	if (res && res.result && res.result === 'always') {
	    // TODO: store the user response to prefs/local storage if 'Allow Always'
	}

	this.user_prompt = false;
	cb(this.manifest_accepted);
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

        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
            .getService(Components.interfaces.nsIWindowWatcher);
        var win = ww.openWindow(null, "chrome://fathom/content/page_permissions.html",
                                null, "chrome,centerscreen,modal,dependent,width=600,height=400",
                                windowargs);
    }
};

/**
 * @method setAvailableMethods
 * @description Sets the allowed API methods visible using __exposedProps.
 */
Security.prototype.setAvailableMethods = function(api,apiobj) {
    apiobj.__exposedProps = {};
    if (this.manifest_accepted && 
	this.requested_apis[api] && 
	this.requested_apis[api].length>0) 
    {
	for (var p in apiobj) {
	    if (apiobj.hasOwnProperty(p)) {
		if (p in this.requested_apis[api]) {
		    // asked explicitely
		    apiobj.__exposedProps__[p] = 'r';
		} else if ('*' in this.requested_apis[api]) {
		    // default is to include all
		    apiobj.__exposedProps__[p] = 'r';
		} // else 'p' is not allowed
	    }
	}
    } // manifest disallowed or api not requested at all - allow nothing
    return apiobj;
};

/**
 * @method isDestinationAvailable
 * @description Check if we are allowed to connect to a given destination.
 */
Security.prototype.isDestinationAvailable = function(cb,dst) {
    // User did not allow Fathom to be used in this page - allow nothing
    if (!this.manifest_accepted) {
	cb(false);
	return;
    }    

    // Check if we already verified this dst
    if (dst in this.allowed_destinations) {
	cb(this.allowed_destinations[dst]);
	return;
    }

    // acb[.xyz]+.*
    var subipre = /\d{1,3}.*\.\*/;

    // xxx://
    var protore = /\w+:\/\//;

    var mok = this.ischromepage; // allow any destination from chrome pages
    for (var i = 0; i < this.manifest.destinations.lenght && mok!==true; i++) {
	var d = this.manifest.destinations[i];
	if (subipre.test(d)) {
	    d = d.replace(".*","");
	    // ip subrange match ?
	    mok = (dst.find(d) == 0);

	} else if (protore.test(d)) {
	    // TODO: protocol match, how to store discovered IPs ?

	} else {
	    // exact ip/host string match ?
	    mok = (d === dst);
	}
    }

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
