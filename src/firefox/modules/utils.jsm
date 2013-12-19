// Imports
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource://fathom/Logger.jsm");

/**
 * Collection of utility functions.
 */
var EXPORTED_SYMBOLS = ["getLocalFile","getNsprLibFile","getNsprLibName","getTempDir","deleteFile","readFile","getCommandWrapper","getHttpFile"];

var nspr_file = undefined;
var nspr_libname = undefined;
var cmd_wrapper = undefined;

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

    var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        .createInstance(Components.interfaces.nsIXMLHttpRequest);
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
var getCommandWrapper = function(os) {
    if (cmd_wrapper !== undefined)
	return cmd_wrapper;

    // write data to a file
    function write(name,data) {
	var profdir = getTmpDir();
	var tmpfile = profdir.clone();	
	tmpfile.append(name);

	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
	    createInstance(Ci.nsIFileOutputStream);
	// write, create, truncate
	foStream.init(tmpfile, 0x02 | 0x08 | 0x20, 0755, 0); 
	
	// "if you are sure there will never ever be any non-ascii text in data you
	// can  also call foStream.writeData directly" --- To be safe, we'll use
	// the converter.
	var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
	    createInstance(Components.interfaces.nsIConverterOutputStream);
	converter.init(foStream, "UTF-8", 0, 0);
	converter.writeString(data);
	converter.close(); // this also closes foStream
	return tmpfile;
    }

    if (os == "winnt") {
	var wrappername = "cmdwrapper.bat";
	var wrapperlines = ['@ECHO OFF',
                        'set errorlevel=',
                        '%3 %4 %5 %6 %7 %8 %9 > %~s1 2> %~s2',
                        'exit /b %errorlevel%'];
	cmd_wrapper = write(wrappername,wrapperlines.join('\r\n') + '\r\n');

	wrappername = "hidecmd.js";
	wrapperlines = [	'var dir = WScript.ScriptFullName.replace(/[\\/\\\\]+[^\\/\\\\]*$/, "");',
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
	cmd_wrapper = write(wrappername,wrapperlines.join('\n') + '\n');

    } else {
	throw 'Unhandled OS: ' + os;
    }

    return cmd_wrapper;
};

/* A shortcut for instantiating a local file object. */
var getLocalFile = function(path) {
    var file = Components.classes['@mozilla.org/file/local;1']
        .createInstance(Components.interfaces.nsILocalFile);

    if (path) {
	try {
	    file.initWithPath(path);
	} catch (exc) {
	    return { error : "getLocalFile: init exception on '" + path + "': " + exc };
	}
    }

    return file;
};

/**
 * Temporary files directory.
 */
var getTempDir = function() {
    var dirservice = Components.classes["@mozilla.org/file/directory_service;1"]
	.getService(Ci.nsIProperties); 
    return dirservice.get("TmpD", Ci.nsIFile);
};

/**
 * Read contents of a given file.
 */
var readFile = function(fileobj, datacallbacke) {
    NetUtil.asyncFetch(fileobj, function(inputStream, status) {
	if (!Components.isSuccessCode(status)) {
            datacallback({error: 'reading file failed: ' + status, 
			  __exposedProps__: { error: "r" }});
            return;
	}

	try {
            var data = NetUtil.readInputStreamToString(inputStream, inputStream.available());
	} catch (e) {
            if (e.name == "NS_BASE_STREAM_CLOSED") {
		// The file is empty.
		data = "";
            } else {
		Logger.error("Failed reading file " + fileobj.path + " : " + e);
		datacallback({error: e, 
			      __exposedProps__: { error: "r" }});
		return;
            }
	}

	// return data
	datacallback(data);
    });
};

/**
 * Delete given file.
 */
var deleteFile = function(fileobj) {
    try {
	fileobj.remove(false);
    } catch (e) {
	Logger.warning("Unable to delete file " + fileobj.path + " : " + e);
    }
};

/**
 * NSPR library name.
 */
var getNsprLibName = function(os) {
    if (nspr_libname === undefined)
	getNsprLibFile(os);
    return nspr_libname;
};

/**
 * Try to locate the NSPR library file. We do this only once
 * and remember the result. It usually, but not always, lives
 * in the XulRunner runtime directory. We try others too. In
 * Fedora 16 as of Feb'12 nspr.so sits in /lib64 or /lib.
 */
var getNsprLibFile = function(os) {
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

    var xulAppInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"].getService(Components.interfaces.nsIVersionComparator);

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
	    Logger.info("nspr4 candidate dir: " + dirs[i].path);

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
	for (var j = 1; j < 3; j++) {
	    try {
		var tmpfile = getLocalFile();
		tmpfile.initWithPath("/data/app/org.mozilla.firefox-"+j+".apk");
		Logger.info("nspr4 candidate dir: " + tmpfile.path);

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
		Logger.error(e);
		continue;
	    }
	}
    }

    if (!found) {
	AddonManager.getAddonByID("fathom@icir.org", function (addon) {
	    var uri = addon.getResourceURI("content/libs/" + os + "/libnspr4.so");
	    if (uri instanceof Components.interfaces.nsIFileURL) {
		nspr_file = uri.file;
	    }
	});
    }

    Logger.info("nspr4 location: " + nspr_file.path);
    return nspr_file;
};
