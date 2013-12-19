// Imports
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://fathom/Logger.jsm");
Components.utils.import("resource://fathom/utils.jsm");

/**
 * Module containing all security related functions.
 */
var EXPORTED_SYMBOLS = ["getClientPolicy","parsePageManifest"];

const Cc = Components.classes;

const valid_apis = ['socket','proto','system','tools'];

/* Read client and server policies and return allowed destionations and actions. */
var parsePolicy = function(json, data) {
    var policy = undefined;
    if (!data || data.length <= 0) {
	return policy;
    }

    if (readjson) {
	// format { domain : { api1 : <true/false>, api2 ... } }
	policy = JSON.parse(data);
    } else {
	var lines = data.split("\n");
	for(var i = 0; i < lines.length - 1; i++) {
	    var line = lines[i];
	    var items = line.split(" ");
	    var allow = (items[0].trim() == "<allow-api-access-from");
	    var domain = items[1].split("=")[1].trim().split('"')[1].trim();
	    var api_list = items[2].split("=")[1].trim().split("/>")[0].split('"')[1].trim();
	    var apis = api_list.split(",");
	    var api = {};
	    for(var k = 0; k < apis.length; k++) {
		api[apis[k].trim()] = allow;
	    }
	    policy[domain] = api;
	}
    }
    Logger.debug(JSON.stringify(policy,null,2));
    return policy;
}

/*
 * Parse client policy. Added support for json format.
 * 
 * TODO: we should save the 'client policies' in a local storage per domain
 * based on the user input and get rid of this file based thing.
 */
var getClientPolicy = function() {
    var policy = undefined;

    try {
	var data = "";
	var readjson = true;

	var file = Cc["@mozilla.org/file/directory_service;1"]
	    .getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
	file.append("client_policy.json");

	if (!file.exists()) { // fallback to xml
	    file = Cc["@mozilla.org/file/directory_service;1"]
		.getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
	    file.append("client_policy.xml"); 
	    readjson = false;
	}

	if (file.exists()) {
	    var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
		.createInstance(Ci.nsIFileInputStream);
	    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
		.createInstance(Ci.nsIConverterInputStream);

	    fstream.init(file, -1, 0, 0);
	    cstream.init(fstream, "UTF-8", 0, 0);
      
	    var read = 0;
	    do { 
		read = cstream.readString(0xffffffff, str);
		data += str.value;
	    } while (read != 0);      
	    cstream.close();
	    policy = parsePolicy(readjson,data);
	}	
    } catch (e) {
	Logger.error("Error reading client policy: "+e);
    }

    if (policy == undefined) {
	Logger.info("No client policy available.");
    }
    return policy;
};

/* Parse and check the page manifest. */
var parsePageManifest = function(manifest) {
    // check API requests
    var requested_apis = {}; // name -> [<methods>]
    if (manifest && manifest['api']) {
      for (var i in manifest['api']) {
        var apiname = manifest['api'][i];
	if (!(apiname in valid_apis)) {
          return {'error': "Unknown API module in manifest: " + apiname, 
		  __exposedProps__: { error: "r" }};
	}
	  
        var parts = apiname.split('.');
        if (parts.length != 2 || !parts[0] || !parts[1]) {
          return {'error': "Invalid API format in manifest: " + apiname,
		  __exposedProps__: { error: "r" }};
        }
	
        if (parts[1] == '*') {
	  requested_apis[parts[0]] = ['*'];
	} else {
	  if (!requested_apis[parts[0]])
	    requested_apis[parts[0]] = [];
	  requested_apis[parts[0]].push(parts[1]);
	}
      }
    }
    manifest['api'] = requested_apis;

    // FIXME: check the destination requests
    var requested_destinations = ((manifest && manifest['destinations']) ? manifest['destinations'] : []);
    
    /*       
    // TODO: are hostnames (including wildcard subdomains) only useful as
    // destinations if we either:
    //   a) do a DNS lookup right now and assume they'll stay the same, or
    //   b) provide higher-level APIs that allow tcp/udp by hostname where
    //      we check the hostname is allowed and then do the dns lookup
    //      ourselves?
    var destination = undefined;
    if (manifest && manifest['destinations']) {
      for (var i in manifest['destinations']) {
        // TODO: sanitize/validate destinations
        // TODO: We should allow:
        // * IPv4 addresses and ranges
        // * IPv6 addresses and ranges
        // * hostnames
        // * hostnames with wildcard subdomains
        // * what about specific ports?
        destination = manifest['destinations'][i];
        requested_destinations.push(destination);
      }
    }
    */
    manifest['destinations'] = requested_destinations;

    // return the parsed manifest
    return manifest;
};

/* Match the manifest requirements to the client policy. */  
var checkClientPolicy = function(policy, manifest) {
    var allowed = manifest;
    return allowed;
};

/* Check the server policy if this web page is allowed to connect to the server. */
var checkServerPolicy = function(callback, allowed_destinations, dst, window) {
    callback({});
    return;

    // FIXME
    /*

    - this should work a bit like CORS I think, just extended to udp/tcp socket
    - server manifest allows domains (or * for any)
    - request the CORS headers in form of manifest
    - match this site origin to the allowed domains
    - match the requested proto:port to the allowed operations (or *)

    var dnsService = Cc["@mozilla.org/network/dns-service;1"]
	.createInstance(Ci.nsIDNSService);
    var selfhostname = dnsService.myHostName;    

    try {
	var selfIP = dnsService.resolve(selfhostname, 
					Ci.nsIDNSService.RESOLVE_CANONICAL_NAME).getNextAddrAsString();
    } catch (e) {
	selfIP = null;
    }
    var hostIP = getIP();

    var checkPermission = function(policy) {
    };

    var url = 'http://' + requested_destination + '/fathom.json';
    getHttpFile(function(res) {
	if (!res.error) {
	    var serverpolicy = parsePolicy(json, res);
	    callback(isAllowed(serverpolicy));
	} else { // fallback to xml
	    url = 'http://' + requested_destination + '/fathom.xml';
	    getHttpFile(function(res) {
		if (!res.error) {
		    var serverpolicy = parsePolicy(json, res);
		    callback(isAllowed(serverpolicy));
		} else {
		    Logger.info("No server policy available.");
		    callback(true); // allow 
		}
	    }, url);
	}	
    }, url);
*/
};