// Imports
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/ctypes.jsm");

Components.utils.import("resource://fathom/Logger.jsm");

/**
 * Collection of utility functions.
 */
var EXPORTED_SYMBOLS = ["getLocalFile","getNsprLibFile","getNsprLibName","getTempDir","deleteFile","readFile","getCommandWrapperPath","getHttpFile","setTimeoutTimer"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const os = Cc["@mozilla.org/xre/app-info;1"]
    .getService(Ci.nsIXULRuntime).OS.toLowerCase();

// initialized upon first request
var nspr_file = undefined;
var nspr_libname = undefined;
var cmd_wrapper = undefined;

/* nsITimer based setTimeout helper. */
var setTimeoutTimer = function(cb,delay,args) {
    var event = {
	observe: function(subject, topic, data) {
	    Logger.debug("one-shot timer: " + topic);
	    if (args)
		cb.apply(args);
	    else
		cb();
	}
    }
    Logger.debug("create one-shot timer, expire in " + delay);
    var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.init(event, delay, Ci.nsITimer.TYPE_ONE_SHOT);
    return timer;
};

/**
 * Temporary files directory.
 */
var getTempDir = function() {
    var dirservice = Cc["@mozilla.org/file/directory_service;1"]
	.getService(Ci.nsIProperties); 
    return dirservice.get("TmpD", Ci.nsIFile);
};

/** Get the contents of a http file or error if not available. */
var getHttpFile = function(callback, url) {
    function stateChanged() {
        if (req.readyState === 4) {
	    if (req.status === 200) {
		callback(req.responseText);
	    } else {
		callback({error: "Error while downloading " + url + 
			  ": code=" + req.status,
			  __exposedProps__: { error: "r" }});
	    }
        }
    }

    var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
        .createInstance(Ci.nsIXMLHttpRequest);
    req.onreadystatechange = stateChanged;
    req.open("GET", url);
    req.send(null);
};

/** 
 * Writes the wrapper if it doesn't exist.
 * TODO: We should probably do this once the first time fathom is used in
 * each session and only worry about cleaning up the wrapper file when
 * fathom is uninstalled.
 * Note that here we are writing the file syncronously on the main thread
 * which is something we generally shouldn't be doing.
 */
var getCommandWrapperPath = function() {
    if (cmd_wrapper !== undefined)
	return cmd_wrapper;

    // write data to a file
    function write(name,data) {
	var profdir = getTempDir();
	var tmpfile = profdir.clone();	
	tmpfile.append(name);

	var foStream = Cc["@mozilla.org/network/file-output-stream;1"]
	    .createInstance(Ci.nsIFileOutputStream);
	// write, create, truncate
	foStream.init(tmpfile, 0x02 | 0x08 | 0x20, 0755, 0); 
	
	// "if you are sure there will never ever be any non-ascii text in data you
	// can  also call foStream.writeData directly" --- To be safe, we'll use
	// the converter.
	var converter = Cc["@mozilla.org/intl/converter-output-stream;1"]
	    .createInstance(Ci.nsIConverterOutputStream);
	converter.init(foStream, "UTF-8", 0, 0);
	converter.writeString(data);
	converter.close(); // this also closes foStream
	return tmpfile.path;
    }

    if (os == "winnt") {
	var wrappername = "cmdwrapper.bat";
	var wrapperlines = ['@ECHO OFF',
                        'set errorlevel=',
                        '%3 %4 %5 %6 %7 %8 %9 > %~s1 2> %~s2',
                        'exit /b %errorlevel%'];
	cmd_wrapper = write(wrappername,wrapperlines.join('\r\n') + '\r\n');

	wrappername = "hidecmd.js";
	wrapperlines = ['var dir = WScript.ScriptFullName.replace(/[\\/\\\\]+[^\\/\\\\]*$/, "");',
			'var Shell = WScript.CreateObject("Wscript.Shell");',
			'Shell.CurrentDirectory = dir;',
			'var objArgs = WScript.Arguments;',
			'var arg = "";',
			'for(var i = 0; i < objArgs.length; i++) {',
			'	arg = arg + " " + objArgs(i);',
			'}',
			'Shell.Run("cmdwrapper.bat " + arg, 0, true);'];
	cmd_wrapper = write(wrappername,wrapperlines.join('\r\n') + '\r\n');
	
    } else if (os == "linux" || os == "android" || os == "darwin") {
	var wrappername = "cmdwrapper.sh";
	var wrapperlines = ['#!/bin/sh',
			'OUTFILE="$1"',
			'ERRFILE="$2"',
			'shift',
			'shift',
			'$@ >"$OUTFILE" 2>"$ERRFILE"'];
	var contents = wrapperlines.join('\n') + '\n';
	cmd_wrapper = write(wrappername,contents);

    } else {
	throw 'Unhandled OS: ' + os;
    }

    return cmd_wrapper;
};

/* Create a local file object. */
var getLocalFile = function(path) {
    var file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
    if (path) {
	try {
	    file.initWithPath(path);
	} catch (exc) {
	    return { error : "getLocalFile: init exception on '" + path + "': " + exc , 
		     __exposedProps__: { error: "r" }};
	}
    }
    return file;
};

/**
 * Read contents of a given file.
 */
var readFile = function(fileobj, datacallback) {
    if (!fileobj.exists()) {
        datacallback({error: 'reading file failed: no such file ' + fileobj.path, 
		      __exposedProps__: { error: "r" }});
        return;
    };

    NetUtil.asyncFetch(fileobj, function(inputStream, status) {
	if (!Components.isSuccessCode(status)) {
            datacallback({error: 'reading file failed: ' + status, 
			  __exposedProps__: { error: "r" }});
            return;
	}

	var data = "";
	try {
            data = NetUtil.readInputStreamToString(inputStream, inputStream.available());
	} catch (e) {
            if (e.name !== "NS_BASE_STREAM_CLOSED") {
		datacallback({error: e, 
			      __exposedProps__: { error: "r" }});
		return;
	    } // else empty file
	}
	datacallback(data);
    }); // asyncFetch
};

/**
 * Delete given file.
 */
var deleteFile = function(fileobj) {
    try {
	fileobj.remove(false);
    } catch (e) {
    }
};

/**
 * NSPR library name.
 */
var getNsprLibName = function() {
    if (nspr_libname === undefined)
	getNsprLibFile(); // populate all variables
    return nspr_libname;
};

/**
 * Try to locate the NSPR library file. We do this only once
 * and remember the result. It usually, but not always, lives
 * in the XulRunner runtime directory. We try others too. In
 * Fedora 16 as of Feb'12 nspr.so sits in /lib64 or /lib.
 */
var getNsprLibFile = function() {
    if (nspr_file!==undefined)
	return nspr_file;

    // init empty file object
    nspr_file = getLocalFile();

    var libd = "LibD";
    if(os == "android" || os == "linux")
	libd = "LibD";
    else if (os == "darwin")
	libd = "ULibDir";
    else if(os == "winnt")
	libd = "CurProcD";

    var xulAppInfo = Cc["@mozilla.org/xre/app-info;1"]
	.getService(Ci.nsIXULAppInfo);
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"]
	.getService(Ci.nsIVersionComparator);

    Logger.info("platformversion: " + xulAppInfo.platformVersion);
    Logger.info("appversion: " + xulAppInfo.version);

    nspr_libname = "nspr4";
    if(versionChecker.compare(xulAppInfo.version, "22.0") >= 0) {
	// running under Firefox 22.0 or later
	nspr_libname = "nss3";
	Logger.info("libName: " + nspr_libname);
    }
  
    var found = false;
    if (os !== "android") {
	var dirs = [Services.dirsvc.get("GreD", Ci.nsILocalFile),
		    Services.dirsvc.get(libd, Ci.nsILocalFile)];
	if (os == "linux") {
	    dirs.push(getLocalFile('/lib64'));
	    dirs.push(getLocalFile('/lib'));
	}

	for (var i in dirs) {
	    if (! dirs[i])
		continue;
	    Logger.debug("nspr4 candidate dir: " + dirs[i].path);

	    if (!dirs[i].exists())
		continue;

	    nspr_file = dirs[i].clone();
	    nspr_file.append(ctypes.libraryName(nspr_libname));
	    if (nspr_file.exists()) {
		found = true;
		break;
	    }
	}
    } else {
	// FIXME: figure out how android names the apks, at least -1 and -2
	// seen on test devices...
	for (var j = 0; j < 3; j++) {
	    try {
		var tmpfile = getLocalFile();
		if (j == 0)
		    tmpfile.initWithPath("/data/app/org.mozilla.firefox.apk");
		else
		    tmpfile.initWithPath("/data/app/org.mozilla.firefox-"+j+".apk");

		Logger.debug("nspr4 candidate dir: " + tmpfile.path);

		if (tmpfile.exists()) {
		    if(versionChecker.compare(xulAppInfo.version, "24.0") >= 0) {
			// Starting from 24.0 the libs are moved to another directory ..
			nspr_file.initWithPath("/data/app/org.mozilla.firefox-"+j+".apk!/assets/lib"+nspr_libname+".so");
		    } else {
			nspr_file.initWithPath("/data/app/org.mozilla.firefox-"+j+".apk!/lib"+nspr_libname+".so");
		    }

		    if (nspr_file.exists()) {
			found = true;
			break;
		    }
		}
	    } catch (e) {
		continue;
	    }
	}
    }

    if (!found) {
	AddonManager.getAddonByID("fathom@icir.org", function (addon) {
	    var uri = addon.getResourceURI("content/libs/" + os + "/libnspr4.so");
	    if (uri instanceof Ci.nsIFileURL) {
		nspr_file = uri.file;
	    }
	});
    }

    Logger.info("nspr4 location: " + nspr_file.path);
    return nspr_file;
};
