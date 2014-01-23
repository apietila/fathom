/* -*- mode: javascript; js-indent-level: 2; js-expr-indent-offset: 2; -*-
 * ***** BEGIN LICENSE BLOCK *****
 *
 * Copyright (c) 2011-2012 International Computer Science Institute (ICSI).
 * All rights reserved.
 *
 * See LICENSE for license and terms of usage. 
 *
 * ***** END LICENSE BLOCK *****
 */

const Cu = Components.utils;
const Ci = Components.interfaces;
const Cc = Components.classes;
const EXTENSION_ID = "fathom@icir.org";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/*
 * FathomService keeps track of preferences, loads our own modules once they
 * become available, and handles other administrative work.
 */
function FathomService() {
  this.wrappedJSObject = this;
}

FathomService.prototype = {
  classDescription : "Fathom JavaScript XPCOM Component",
  classID : Components.ID("{0e524489-5086-4791-b0c8-99fd7f3f76be}"),
  contractID : "@icir.org/fathom-service;1",
  _xpcom_categories : [ {
    category : "profile-after-change"
  } ],
  QueryInterface : XPCOMUtils.generateQI([ Ci.nsIFathom, Ci.nsIObserver ]),

  /* Factory that creates a singleton instance of the component */
  _xpcom_factory : {
    createInstance : function() {
      if (FathomService.instance == null) {
	dump("[FathomService] : created service instance\n");
        FathomService.instance = new FathomService();
      }
      return FathomService.instance;
    }
  },

  // /////////////////////////////////////////////////////////////////////////
  // Internal Data
  // /////////////////////////////////////////////////////////////////////////

  _initialized : false,
  _profileAfterChangeCompleted : false,

  _prefService : null,
  _rootPrefs : null,

  _requestObservers : [],

  _prefNameToObjectMap : null,

  _compatibilityRules : [],
  _topLevelDocTranslationRules : [],

  _uninstall : false,

  // /////////////////////////////////////////////////////////////////////////
  // Utility
  // /////////////////////////////////////////////////////////////////////////

  _log : function(str) {
    dump("[FathomService] : " + str + "\n");
  },

  _init : function() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    this._log("init service instance");

    try {
      this._loadLibraries();
      this._register();
      this._initializePrefSystem();
      // Note that we don't load user preferences at this point because the user
      // preferences may not be ready. If we tried right now, we may get the
      // default preferences.
    } catch (e) {
      this._log("exception from _init(): " + e);
    }
  },

  _syncFromPrefs : function() {
    // Load the logging preferences before the others.
    this._updateLoggingSettings();
  },

  _updateLoggingSettings : function() {
    Logger.enabled = this.prefs.getBoolPref("log");
    Logger.level = this.prefs.getIntPref("log.level");
    this._log("Logger " + (Logger.enabled ? "enabled" : "disabled") + " level=" + Logger.level);
  },

  _registerAddonListener : function() {
    Cu.import("resource://gre/modules/AddonManager.jsm");
    const fathomSrvc = this;

    var addonListener = {
      onDisabling : function(addon, needsRestart) {
        if (addon.id != EXTENSION_ID) {
          return;
        }
        Logger.debug("Addon set to be disabled.");
        fathomSrvc._uninstall = true;
      },
      onUninstalling : function(addon, needsRestart) {
        if (addon.id != EXTENSION_ID) {
          return;
        }
        Logger.debug("Addon set to be uninstalled.");
        fathomSrvc._uninstall = true;
      },
      onOperationCancelled : function(addon, needsRestart) {
        if (addon.id != EXTENSION_ID) {
          return;
        }
        Logger.debug("Addon operation cancelled.");
        // Just because an operation was cancelled doesn't mean there isn't
        // a pending operation we care about. For example, a user can choose
        // disable and then uninstall, then clicking "undo" once will cancel
        // the uninstall but not the disable.
        var pending = addon.pendingOperations
            & (AddonManager.PENDING_DISABLE | AddonManager.PENDING_UNINSTALL);
        if (!pending) {
          Logger.debug("No pending uninstall or disable.");
          fathomSrvc._uninstall = false;
        }
      }
    };
    AddonManager.addAddonListener(addonListener);
  },

  _register : function() {
    var os = Cc['@mozilla.org/observer-service;1']
        .getService(Ci.nsIObserverService);

    this._log("Service register.");

    os.addObserver(this, "xpcom-shutdown", false);
    os.addObserver(this, "profile-after-change", false);
    os.addObserver(this, "quit-application", false);
    this._registerAddonListener();
  },

  _unregister : function() {
    try {
      var os = Cc['@mozilla.org/observer-service;1']
          .getService(Ci.nsIObserverService);
      
      this._log("Service unregister.");

      os.removeObserver(this, "xpcom-shutdown");
      os.removeObserver(this, "profile-after-change");
      os.removeObserver(this, "quit-application");
    } catch (e) {
      this._log(e + " while unregistering.");
    }
  },

  _shutdown : function() {
    this._unregister();
  },

  _initializePrefSystem : function() {
    // Get the preferences branch and setup the preferences observer.
    this._prefService = Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefService);

    this.prefs = this._prefService.getBranch("extensions.fathom.")
        .QueryInterface(Ci.nsIPrefBranch2);
    this.prefs.addObserver("", this, false);

    this._rootPrefs = this._prefService.getBranch("").QueryInterface(
      Ci.nsIPrefBranch2);
  },

  /*
   * Take necessary actions when preferences are updated.
   * 
   * prefName Name of the preference that was updated.
   */
  _updatePref : function(prefName) {
    switch (prefName) {
    case "log":
    case "log.level":
      this._updateLoggingSettings();
      break;
    default:
      break;
    }
  },

  _loadLibraries : function() {
    // javascript modules used by the extension
    var modules = ["Logger", "utils", "Security", "Tools", "Socket", "System", "Proto"];
    for (var i in modules) {
      this._log("load " + modules[i]);
      filename = modules[i];
      try {
        Cu.import("resource://fathom/" + filename + ".jsm");
      } catch (e) {
        // Indicate the filename because the exception doesn't have that
        // in the string.
        var msg = "Failed to load module " + filename + ": " + e;
        
        // TODO: catch errors from here and _init and, if detected, set a
        // flag that the extension is broken and indicate that to the user.
        throw msg;
      }
    }
  },

  // /////////////////////////////////////////////////////////////////////////
  // nsIFathom interface
  // /////////////////////////////////////////////////////////////////////////

  prefs : null,

  // /////////////////////////////////////////////////////////////////////////
  // nsIObserver interface
  // /////////////////////////////////////////////////////////////////////////

  observe : function(subject, topic, data) {
    this._log("service observed: " + subject + " on " + topic);

    switch (topic) {
    case "nsPref:changed":
      this._updatePref(data);
      break;
    case "profile-after-change":
      this._init();
      // "profile-after-change" means that user preferences are now
      // accessible. If we tried to load preferences before this, we would get
      // default preferences rather than user preferences.
      this._syncFromPrefs();
      break;
    case "xpcom-shutdown":
      this._shutdown();
      break;
    case "quit-application":
      if (this._uninstall) {
        this._handleUninstallOrDisable();
      }
      break;
    default:
      this._log("uknown topic observed: " + topic);
    }
  }
}; // FathomService

/**
 * FathomAPI provides the objects that are added to DOM windows. A separate
 * FathomAPI object is created for each window and then the value returned
 * from the init() function is added to the window's properties.
 */
function FathomAPI() {
  this.os = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime).OS.toLowerCase();
  this.arch = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime).XPCOMABI;
  this.initialized = false;

  // internal data
  this.chromeworkers = {};
  this.requests = {};
  this.nextrequestid = 1;
  this.nextsocketid = 1;
  this.scriptworkers = {};
  this.nextscriptid = 1;
  this.commands = {};

  Logger.debug("Created new FathomAPI object");
};

FathomAPI.prototype = {
  classID: Components.ID("{b5f42951-9a05-47ee-8fa8-bb7a16e48335}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer,
                                         Ci.nsIObserver]),

  // /////////////////////////////////////////////////////////////////////////
  // Internal data 
  // /////////////////////////////////////////////////////////////////////////

  os : undefined,
  arch : undefined,
  windowid : undefined,
  initialized : undefined,

  // api method handling
  chromeworkers : null,
  requests : null,
  nextrequestid : null,
  nextsocketid : null,
  commands : null,

  // security
  security : null,

  // /////////////////////////////////////////////////////////////////////////
  // Internal utilities
  // /////////////////////////////////////////////////////////////////////////

  _initChromeWorker : function(workername, workerscript) {
    const fathomapi = this;
    Cu.import("resource://gre/modules/Services.jsm");
    Cu.import("resource://gre/modules/ctypes.jsm");

    var worker = new ChromeWorker("chrome://fathom/content/workers/" + workerscript + ".js");
    worker.name = workername;
    Logger.debug("Create worker " + worker.name + " for window " + this.windowid);

    try {
      worker.onerror = function(event) {
        msg = event.message + ' [' + event.filename + ':' + event.lineno + ']';
        Logger.error('Worker error: ' + msg);
      };

      worker.onmessage = function(event) {
        var data = JSON.parse(event.data);        

        if (typeof(data.logmsg) != "undefined") {
          Logger.info("ChromeWorker: " + data.logmsg);
          return;
        }

        var result = data.result;
        var requestid = data.requestid;
        var requestinfo = fathomapi.requests[requestid];
        Logger.info('Received response for requestid: ' + requestid);

        if (!requestinfo) {
          Logger.warning('Received response from worker for unknown requestid: ' + 
			 requestid + ", window " + fathomapi.windowid);

	  Logger.warning('Has data? ' + (event.data.length>0));
	  return;
	}

        if (result) {
          // TODO: possibly make sure the worker is the one we expect (the one
          // stored in the requestinfo).
          try {
	    // TODO: call the callback async using setTimeout.
	    
	    // Anna: recursively mark everything visible
	    var recur = function(o) {
	      var exp = {};
	      for(var props in o) {
		if (!o.hasOwnProperty(props))
		  continue;
		
		exp[props] = "r";

		if (o[props] instanceof Array) {
		  // recurse into array elements
		  for (var i = 0; i < o[props].length; i++) {
		    recur(o[props][i]);
		  }
		} else if (o[props] instanceof Object) {
		  // recurse to object
		  recur(o[props]);
		}
	      }
	      o["__exposedProps__"] = exp;
	    };
	    recur(result);
	    requestinfo['callback'](result);
          } catch (e) {
            // TODO: decide on a good way to send this error back to the document.
            Logger.error('Error when calling user-provide callback: ' + e);
	    Logger.error(e.stack);
          }
	} else {
          Logger.warning('Received empty response for requestid: ' + 
			 requestid);
	}

	// one time request or multiresponse is done ?
	if ((requestinfo && !requestinfo['multiresponse']) || 
	    (result && result['done'])) {
          delete fathomapi.requests[requestid];
          Logger.info('Request done: ' + requestid);
	}

	// Anna: adding a way to clean things up inside fathom
	// if the worker closes itself
	if (result && result['closed']) {
	  // the worker has closed itself, remove any references
	  // so this worker object gets garbage collected
	  delete fathomapi.chromeworkers[workername];
          Logger.info('Worker closed: ' + workername);
	}
      }; // onmessage

      // initialize the worker
      var obj = {'init' : true, 
		 'nsprpath' : getNsprLibFile().path,
		 'nsprname' : getNsprLibName(),  
		 'arch' : this.arch, 
		 'os' : this.os};

      Logger.debug(obj);
      worker.postMessage(JSON.stringify(obj));

    } catch (exc) {
      worker.terminate();
      throw exc;
    }

    this.chromeworkers[workername] = worker;
    return worker;

  }, //_initChromeWorker

  _performRequest : function(worker, callback, action, args, multiresponse) {
    var requestid = this.nextrequestid++;
    this.requests[requestid] = {worker : worker, 
				callback : callback,
                                multiresponse : multiresponse};

    Logger.info('Performing request for action: ' + action + ' (requestid: ' +
                requestid + ', worker: ' + worker.name+ ', window: ' + this.windowid + ')');

    var obj = {action: action, requestid: requestid, args: args};
    worker.postMessage(JSON.stringify(obj));
  },

  _doNonSocketRequest : function(callback, action, args, multiresponse) {
    var multiresponse = multiresponse || false;
    var workername = 'nonsocketworker';
    var workerscript = 'chromeworker';

    var worker = this.chromeworkers[workername];    
    if (!worker) {
      worker = this._initChromeWorker(workername, workerscript);
    }

    this._performRequest(worker, callback, action, args, multiresponse);
  },

  _doSocketUsageRequest : function(callback, action, args, multiresponse) {
    // Assume socketid will be the first argument.
    var socketid = args[0];
    if (!socketid) {
      Logger.error("Expected socket as the first argument.");
      callback({error:"Expected socket as the first argument.", 
		__exposedProps__: { error: "r" }});
      return;
    }

    Logger.info("Looking up socket " + socketid + " for action " + action);

    var worker = this.chromeworkers['socketworker'+socketid];

    if (!worker) {
      Logger.error("Could not find the worker for this socket.");
      callback({error:"Could not find the worker for this socket.", 
		__exposedProps__: { error: "r" }});
      return;
    }

    this._performRequest(worker, callback, action, args, multiresponse);
  },

  /*
   * Each socket gets its own worker (thread). This function will create a new
   * worker and will intercept the callback to the user code in order to
   * provide the socketid (assigned here, not in the chromeworker) back to the
   * user as well as to do some accounting so that future requests for this
   * same socketid can be invoked on the same chromeworker.
   */
  _doSocketOpenRequest : function(callback, action, args) {
    var socketid = this.nextsocketid++;
    var workername = 'socketworker' + socketid;
    var workerscript = 'chromeworker';
    var worker = this._initChromeWorker(workername, workerscript);

    function socketRegistrationCallback(result) {
      if (result && !result['error']) {
        Logger.info("Registered socket worker " + worker.name + " for socketid " + socketid);
        callback(socketid);
      } else {
        Logger.error("Socket open request failed: " + worker.name);
        result["__exposedProps__"] = { error: "r" };
        callback(result);
      }
    }
    this._performRequest(worker, socketRegistrationCallback, action, args);
  },

  /*
   * Run a cmd line program.
   */
  _executeCommandAsync : function(callback, cmd, args, incrementalCallback) {
    Cu.import("resource://gre/modules/FileUtils.jsm");
    Cu.import("resource://gre/modules/NetUtil.jsm");

    Logger.debug("_executeCommandAsync : " + cmd + " in window " + this.windowid);

    if (!args) {
      args = []; 
    } else {
      // TODO: make sure args is an array
      if (args.length > 4) {
        throw 'At the moment you cannot pass more than 4 arguments to a command';
      }
    }

    var commandid = Math.random().toString();

    var tmpdir = getTempDir();
    if (!tmpdir)
      throw "failed to get temp directory object";

    var outfile = tmpdir.clone()
    outfile.append('fathom-command.' + commandid + '.out');
    var errfile = tmpdir.clone()
    errfile.append('fathom-command.' + commandid + '.err');

//    Logger.debug("outfile: " + outfile.path);
//    Logger.debug("errfile: " + errfile.path);

    var observer = {
      observe: function(subject, topic, data) {
        if (topic != "process-finished" && topic != "process-failed") {
          throw 'Unexpected topic observed by process observer: ' + topic;
        }
        
        var exitstatus = subject.exitValue;
	Logger.debug("async command " + commandid + " ready :  " + topic + " [" + exitstatus + "]");

        function handleOutfileData(outdata) {
          function handleErrfileData(errdata) { 
	    if (callback) { 
              try {
		callback({exitstatus: exitstatus, 
			  stdout: outdata, 
			  stderr: errdata,
			  __exposedProps__: { 
			    exitstatus: "r", 
			    stdout: "r", 
			    stderr: "r" }});
    		callback = null;
    		incrementalCallback = false;
    	      } catch(e) {
    	    	Logger.error("Error executing the callback function: " + e);
		Logger.error(e.stack);
    	      }
	    }

	    // cleanup
            try{
              if (subject.isRunning) {
		subject.kill();
	      }
	    } catch (e) {
      	      Logger.warning("Failed to kill process: " + e);
    	    }

	    deleteFile(outfile);
	    deleteFile(errfile);

          } // handleErrfile
          readFile(errfile, handleErrfileData);

        } // handleOutfile
	readFile(outfile, handleOutfileData);
      }
    }; // observer

    var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    var wrapperfilepath = getCommandWrapperPath(); // creates the wrapper upon first call
    var wrapperargs = undefined;

    if (this.os == "android") {
      // get sh executable
      var shPath = getLocalFile("/system/bin/");
      if (shPath.error)
	throw "failed to get localfile object : /system/bin " + shPath.error;

      var sh = shPath.clone();
      sh.append('sh');
      process.init(sh);
      wrapperargs = [wrapperfilepath, outfile.path, errfile.path, cmd].concat(args);

    } else {
      var wrapperfile = getLocalFile(wrapperfilepath);
      if (wrapperfile.error)
	throw "failed to get localfile object : " + 
	  wrapperfilepath + " " + wrapperfile.error;

      process.init(wrapperfile);
      wrapperargs = [outfile.path, errfile.path, cmd].concat(args);
    }

    // call the cmd
    Logger.debug("make the async command " + commandid + ": " + wrapperargs.join(' '));
    process.runAsync(wrapperargs, wrapperargs.length, observer);

    /* incremental output for traceroute & ping */
    if (incrementalCallback == true) {
      var file = FileUtils.getFile("TmpD", [outfile.leafName]);
      var index = 0, timeout = 250, count = 120;
      Logger.debug("sending incremental updates for results every 250ms");

      var event = {  
	observe: function(subject, topic, data) {  
	  index++;
	  if (index >= count || !incrementalCallback)
	    timers.cancel();

	  try{
	    NetUtil.asyncFetch(file, function(inputStream, status) {
	      if (!Components.isSuccessCode(status)) {  
		// Handle error!  
		return;  
	      }  
	      
	      // The file data is contained within inputStream.  
	      // You can read it into a string with  
	      var outdata = NetUtil.readInputStreamToString(inputStream, inputStream.available());
	      //dump(outdata);
	      callback({exitstatus: null, 
			stdout: outdata, 
			stderr: null, 
			__exposedProps__: { exitstatus: "r", 
					    stdout: "r", 
					    stderr: "r" }});
	    });
	  } catch(e) {
	    Logger.error("Error executing the NetUtil.asyncFetch callback function: " + e);
	  }
	}  
      }; // event
  
      var timers = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);  
      const TYPE_REPEATING_PRECISE = Ci.nsITimer.TYPE_REPEATING_PRECISE;
      timers.init(event, timeout, TYPE_REPEATING_PRECISE);
    } // incremental output    
  },

  /* 
   * Some protocols (e.g. mdns, upnp) are used to discover nearby devices. Fathom
   * scripts can request permission to connect to these devices via special 
   * destination url scheme such as mdns://*. 
   * 
   * To enable this functionality, this method should be called when 
   * a protocol discovers a new device so that the extension can authorize
   * later socket connections to the device based on the requested and allowed 
   * destinations of the page manifest.
   */
  _addNewDiscoveredDevice : function(dobj) {
    // FIXME : implement -> add dev to security obj allowed devices
    // if it conforms to the accepted page manifest
    Logger.info("New neighbour device registered " + dobj.ipv4 + " by " + dobj.proto);
  },

  /*
   * We listen for "inner-window-destroyed" which means this window will never
   * be used again, even for history navigation. However, we still need to deal
   * with the case where the page is frozen and put in the back-forward cache.
   * In that situation, scripts will continue executing from where they were.
   * Also, the page in the bfcache can still be interacted with as long as the
   * interaction is initiated externally (afaict). So, its own timers won't run
   * but any callbacks from that page which get called should run.
   *
   * More info on the back-forward cache:
   * https://developer.mozilla.org/En/Working_with_BFCache
   *
   * So, what should we do with open sockets when a page is put in the bfcache?
   * Just leaving any fathom scripts running and sockets open seems like a bad
   * idea for the user because of the chance of such running code eating up
   * bandwidth, CPU, and memory without the user having any indication this is
   * still happening or a way to stop it. The best solution is probably for
   * concerned pages to listen for pagehide/pageshow events and take action
   * accordingly. For example, when the page gets a pagehide event it can
   * close sockets, record the time at which it is stopping the measurements it
   * was doing, and generally stop using fathom. Then, when the page gets a
   * pageshow event, it can open up whatever sockets it wants to open and
   * continue its measurements. However, enforcing this by cleaning up the
   * page's fathom state on pagehide events may be messy.
   *
   * For now, there's some commented out code in init() which adds a listener
   * for pagehide that in turn calls shutdown().
   */
  observe : function(subject, topic, data) {
    Cu.import("resource://gre/modules/Services.jsm");
    switch (topic) {
    case "inner-window-destroyed":
      try{
	var windowID = subject.QueryInterface(Ci.nsISupportsPRUint64).data;
	var innerWindowID = this.window.QueryInterface(Ci.nsIInterfaceRequestor).
	    getInterface(Ci.nsIDOMWindowUtils).currentInnerWindowID;
	if (windowID == innerWindowID) {
	  Logger.info("Calling shutdown()");
	  this.shutdown("inner-window-destroyed");
	  delete this.window; // Anna: ???
	  Services.obs.removeObserver(this, "inner-window-destroyed");
	}
      } catch(e) {
	Logger.error("Inner-window-destroyed: " + e);
      }
      break;
    default:
      Logger.error("unknown topic observed: " + topic);
    }
  },

  /*
   * The shutdown function should clean up any state that couldn't be
   * automatically garbage collected but it should also leave the fathom
   * instance in a working state. The reason fathom still needs to work is that
   * we are using shutdown() to also handle the case where the page is
   * navigated away from (i.e. pagehide) rather than being completely closed.
   * If the user goes back/forward in their history to this same page, we want
   * fathom to work the same as if the page had first loaded.
   */
  shutdown : function(cause) {
    try {
      var util = this.window.QueryInterface(Ci.nsIInterfaceRequestor).
          getInterface(Ci.nsIDOMWindowUtils);
      var windowid = util.currentInnerWindowID;
      Logger.debug(cause + " :: shutdown() called for window: " + windowid);
    } catch (e) {
      Logger.error("Failed to log shutdown() message: " + e);
    }

    var jsonobj = JSON.stringify({action: 'shutdown'});

    // With the requests object reset, from this moment on we will not call the
    // page's callbacks for any pending requests that complete.
    this.requests = {};	

    for (var name in this.chromeworkers) {
      Logger.info("[shutdown] Sending shutdown message to chromeworker: " + name);
      this.chromeworkers[name].postMessage(jsonobj);
      delete this.chromeworkers[name];
    }

    for (var name in this.commands) {
      // TODO: may want to do process killing and file deletion async.
      if (this.commands[name].process.isRunning) {
        Logger.info("[shutdown] Killing command process: " + name + " (" +
		    this.commands[name].cmd + " " + this.commands[name].args + ")");
        try {
          // TODO: This is only killing the wrapper process, not the process
          // started by the wrapper (which is really what we want to kill).
          this.commands[name].process.kill();
        } catch (e) {
          Logger.warning("Failed to kill process: " + e);
          continue;
        }
      }
      if (this.commands[name].outfile.exists()) {
        this._deleteFile(this.commands[name].outfile);
      }
      if (this.commands[name].errfile.exists()) {
        this._deleteFile(this.commands[name].errfile);
      }
      delete this.commands[name];
    }

    this.chromeworkers = {};
    this.commands = {};
    this.scriptworkers = {};

    Logger.debug("shutdown ready");
  },

  // /////////////////////////////////////////////////////////////////////////
  // Webpage API
  // /////////////////////////////////////////////////////////////////////////

  /*
   * The object returned from the init method is the object lazily added to
   * each web page. The init() method accepts an nsIDOMWindow argument which
   * provides access to the window.
   */
  init: function(aWindow) {
    Cu.import("resource://gre/modules/Services.jsm");
    this.window = XPCNativeWrapper.unwrap(aWindow);

    try {
      var util = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).
	  getInterface(Ci.nsIDOMWindowUtils);
      this.windowid = util.currentInnerWindowID;

      Logger.debug("init() called for window: " + this.windowid + " (" +
		   this.window.document.location.href + ") initialized=" + 
		   (this.initialized == true));
    } catch (e) {
      Logger.error("Failed to log init() message: " + e);
    }

    // It's possible to have init() called more than once for the same window.
    // I don't have a reliable test for this, but I was able to do it killing
    // Firefox, doing a "start new session" at the restore tabs screen,
    // clicking "back" to go back to the restore session page and again
    // clicking "start new session". Doing this over and over again resulted in
    // init() sometimes being called for the same window id.
    var self = this;
    if (!this.initialized) {
      this.initialized = true;
      Services.obs.addObserver(this, "inner-window-destroyed", false);

      // A pagehide event is where the user navigates away from the page but it
      // is still in the bfcache. We clean up all fathom resources when the page
      // is hidden. If sites using fathom want to handle this gracefully, they
      // should also listen for pagehide events.
      function onPageHide(aEvent) {
        try{
          if (aEvent.originalTarget instanceof Ci.nsIDOMHTMLDocument) {
            var doc = aEvent.originalTarget;
            Logger.info("page hidden:" + doc.location.href + "\n");
            self.shutdown("pagehide");
          }
        } catch(e) {
          Logger.error("PAGEHIDE: " + e);
        }
      }
      this.window.addEventListener("pagehide", onPageHide, false);
    } else {
      Logger.debug("init() called on window that has already been initialized");
    }

    var pref = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

    // Initial dummy Fathom API
    this.api = {
      build: pref.getCharPref("extensions.fathom.build"),
      version: pref.getCharPref("extensions.fathom.version"),
      init : self.api_init.bind(self),

      // populated by api_init
      proto: {},
      socket: {},
      system: {},
      tools: {},

      __exposedProps__: {
        version : "r",
        build : "r",
        init: "r",
	proto: "r",
	socket: "r",
	system: "r",
	tools: "r"
      }
    };

    return this.api;
  }, // init

  /* Enable the Fathom API based on the page manifest and user preferences. */
  api_init : function (callback, manifest, win) {      
    // check if the extension is enabled ?
    var prefFathom = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    if (!prefFathom.getBoolPref("extensions.fathom.status")) {
      callback({'error': 'extension is disabled by the user',
		__exposedProps__: { error: "r" }});
      return false;
    }

    var that = this;

    // initialize the page security helper
    this.security = new Security(win.location, this.os, manifest);

    // ask the user to accept the manifest
    this.security.askTheUser(function(allowed) {
      if (allowed) {
	// initialize the fathom API
	for (var apiname in that.security.requested_apis) {
	  var apiobj = undefined;
	  switch (apiname) {
	  case "socket":
	    apiobj = Socket(that);
	    break;
	  case "proto":
	    apiobj = Proto(that);
	    break;
	  case "system":
	    apiobj = System(that);
	    break;
	  case "tools":
	    apiobj = Tools(that);
	    break;
	  default:
	    break;
	  };

	  // set the allowed methods visible and replace the dummy api with the full
	  // implementation
	  that.api[apiname] = that.security.setAvailableMethods(apiname,apiobj);
	} // end for

	// add all baseline apis for chrome pages
	if (that.security.ischromepage)
	  that.api["baseline"] = new Baseline(that);

	// done
	callback({});

      } else {
	// else user did not accept the manifest
	callback({'error': 'user did not accept the manifest',
		  __exposedProps__: { error: "r" }});
      }
    }); // askTheUser
  }, // api_init



  // ################ API modules #############################
  // TODO: find a way to put these in separate files
  // 

  /**
   * The socket module provides APIs for basic TCP and UDP socket
   * I/O.  For specific app-layer protocols, take a look at the
   * proto module instead.
   *
   * @module fathom.socket
   */
  socket : {
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
  }, // socket

 /**
   * The system module provides APIs for invoking specific commands on
   * the host and retrieveing configuration and status information.
   *
   * @module fathom.system
   */
  system : function(self) {
    return {
    /**
     * @method getOS
     * @static
     *
     * @description  This function returns client OS information.
     * 
     * @return {string} OS.
     */
    getOS : function () {
      Logger.debug("getOS in window " + self.windowid);
      return self.os;
    },

    /** 
     * @method doTraceroute
     * @static
     *
     * @description This function runs a traceroute to the given
     * destination and, upon completion, returns the textual results.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {string} host The host (name or IP address) to run a
     * traceroute to.
     */
    doTraceroute : function(callback, host, incrementaloutput, iface, fast) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      // do incremental output? default false
      var inc = false;
      if (incrementaloutput !== undefined)
	inc = incrementaloutput; 
      if (!host)
	callback({error: "doTraceroute: missing host argument"});

      if (os == winnt) {
        cmd = "tracert";
	if (fast) {
	  args.push("-w 1000");
	}
	args.push(host);

      } else if (os == linux || os == darwin || os == android) {
	cmd = "traceroute";
	if (iface!==undefined) {
	  args.push("-i"+iface);
	}
	if (fast) {
	  args.push("-w1");
	  args.push("-q1");
	} else {
	  args.push("-q3");
	  args.push("-m30");
	}
	args.push(host);

      } else {
	callback({error: "doTraceroute: not available on " + os, __exposedProps__: {error: "r"}});
	return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "traceroute",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	  params: [host]
      	};
      	var data = libParse2(output, info);
      	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args, inc);

    }, // traceroute

    /** 
     * @method doPing
     * @static
     *
     * @description This function runs an ICMP ping to the given
     * destination and, upon completion, returns the textual results.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {string} host The host (name or IP address) to ping.
     * @param {integer} count The number of pings to attempt.
     * @param {number} interval The interval between pings.
     * @param {boolean} bcast Ping broadcast address.
     * @param {boolean} incrementaloutput Send incremental output.
     */
    doPing : function(callback, host, count, iface, interval, bcast, incrementaloutput) {
      var os = this.os;
      var cmd = 'ping';
      var args = [];

      if (host === undefined) {
	callback({error: "doPing: missing host argument", 
		  __exposedProps__: {error: "r"}});
	return;
      }

      // do incremental output? default false
      var inc = false;
      if (incrementaloutput !== undefined)
	inc = incrementaloutput; 

      if (os == winnt) {
	if (count) {
	  args.push("-n " + count);
	} else {
	  args.push("-n 5");
	}

	if (iface) {
	  args.push("-S "+iface); // must be IP address ... -I does not work..
	}

      } else if (os == linux || os == darwin || os == android) {
	if (count) {
	  args.push("-c" + count);
	} else {
	  args.push("-c 5");
	}

	if (iface) {
	  if (os == darwin) {
	    args.push("-S"+iface); // must be IP address ... -I does not work..
	  } else {
	    args.push("-I"+iface);
	  }	
	}

	if (interval) {
	  args.push("-i " + interval);
	}

	if (bcast !== undefined && bcast==true && 
	    (os == android || os == linux)) 
	{
	  args.push("-b");
	}
      } else {
	callback({error: "doPing: not available on " + os,
		  __exposedProps__: {error: "r"}});
        return;
      }
      args.push(host);
      
      function cbk(info) {
      	var output = {
      	  name: "ping",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};
      	var data = libParse2(output, info);
      	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args, inc);
    }, // doPing

    /** 
     * @method getNameservers
     * @static
     *
     * @description This function retrieves information about the
     * client's DNS resolver configuration.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */
    getNameservers : function(callback) {
      var that = this;
      var os = this.os;
      var cmd = undefined;
      var args = [];
      var idx = 1;
      var tmp = [];

      if (os == winnt) {
        cmd = "ipconfig";
        args = ["/all"];

      } else if (os == linux || os == darwin) {
        cmd = "cat";
        args = ["/etc/resolv.conf"];

      } else if (os == android) {
	// must request server at the time ..
	cmd = "getprop";
	args = ["net.dns"+idx];

      } else {
	callback({error: "getNameservers not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "nameserver",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};

      	var data = libParse2(output, info);

	if (os === android) {
	  if (data && !data.error && data.list.length > 0) { 
	    // we can only get single nameserver at the time
	    tmp.push(data.list[0]);
	    idx += 1
	    cmd = "getprop";
	    args = ["net.dns"+idx];
	    that._executeCommandAsync(cbk, cmd, args);

	  } else if (data.error) {
	    callback(data);
	  } else {
	    // done
      	    callback(tmp);
	  }

	} else {
	  // all nameservers returned in one call
      	  callback(data);
	}
      }	
      this._executeCommandAsync(cbk, cmd, args);
    }, // getNameservers

    /** 
     * @method getHostname
     * @static
     *
     * @description Get hostname
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */
    getHostname : function(callback) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == linux || os == darwin || os == winnt) {
        cmd = "hostname";
      } else if (os == android) {
	cmd = "getprop";
	args = ["net.hostname"];
      } else {
	callback({error: "getHostname not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "hostname",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};

      	var data = libParse2(output, info);
	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getHostname

    /**
     * @method getActiveInterfaces
     * @static
     *
     * @description This function retrieves the current status of the
     * clients' network interfaces.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */       
    getActiveInterfaces : function(callback) {
      var that = this;
      var os = this.os;
      var cmd = undefined;
      var args = [];

      // ifconfig or netstat -i
      if (os == winnt) {
        cmd = "ipconfig";
        args = ["/all"];

      } else if (os == linux || os == darwin) {
        cmd = "ifconfig";

      } else if (os == android) {
	cmd = "ip";
	args = ['-o','addr','show','up'];

      } else {
	callback({error: "getActiveInterfaces not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "activeInterfaces",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};
      	var data = libParse2(output, info);

	if (os == android && data.error && 
	    data.error.indexOf('not found')>=0 && cmd !== 'netcfg') 
	{
	  // ip was not available, fallback to netcfg
	  Logger.info("\'ip\' not available, fallback to netcfg");
	  cmd = "netcfg";
	  args = [];
	  that._executeCommandAsync(cbk, cmd, args);
	} else {
      	  callback(data);
	}
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    },

    /**
     * @method getActiveWifiInterface
     * @static
     *
     * @description This function retrieves the current status of the
     * clients' wireless network interface (iwconfig and friends).
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */       
    getActiveWifiInterface : function(callback) {
      var that = this;
      var os = this.os;
      var cmd = undefined;
      var args = [];
      
      if (os == linux) {
        cmd = "iwconfig";

      } else if (os == darwin) {
	cmd = airport;
        args = ["-I"];

      } else if (os == android) {
	cmd = "getprop";
	args = ['wifi.interface'];

      } else if (os == winnt) {
	cmd = "netsh";
	args = ['wlan','show','interfaces'];

      } else {
	callback({error: "getActiveWifiInterface not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "activeWifiInterface",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};
      	var data = libParse2(output, info);

	if (os == darwin && !data.error) {
	  // get the name (and mac) of the wifi interface on OS X
	  cmd = "networksetup";
	  args = ["-listallhardwareports"];

	  that._executeCommandAsync(function(info2) {
      	    var data2 = libParse2(output, info2);
	    data.name = data2.name;
	    data.mac = data2.mac;
      	    callback(data);
	  }, cmd, args);

	} else {
      	  callback(data);
	}
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    },

    /**
     * @method getArpCache
     * @static
     *
     * @description This function retrieves the current contents of the ARP cache.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {string} hostname - Get the arp cache info only for the specified host (optional, default is all).
     */       
    getArpCache : function(callback, hostname) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == winnt || os == linux || os == darwin) {
        cmd = "arp";
	if (hostname)
	  args = [hostname];
	else
	  args = ["-a"];

      } else if (os == android) {
        cmd = "ip";
        args = ['neigh','show'];
	if (hostname) {
	  args.append('to');
	  args.append(hostname);
	}

      } else {
	callback({error: "getArpCache not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }		

      function cbk(info) {
      	var output = {
      	  name: "arpCache",
      	  os: os,
	  cmd : cmd+ " " + args.join(" "),
      	};

      	var data = libParse2(output, info);
	if (!data.error && hostname) {
	  // query was for a single host
	  var h = (data.entries.length == 1 ? data.entries[0] : undefined);
	  if (h) {
	    h.ip = hostname;
	    h.__exposedProps__['ip'] = 'r';
	    h.meta = data.meta;
	    h.__exposedProps__['meta'] = 'r';
	    callback(h);
	  } else {
	    callback({error: "no such host in the arp cache : " + hostname, 
		      __exposedProps__: {error: "r"}});
	  }
	} else {
	  // error or requested all entries
      	  callback(data);
	}
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getArpcache

    /**
     * @method getRoutingTable
     * @static
     *
     * @description This function retrieves the client's current routing table.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */       
    getRoutingTable : function(callback) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == winnt) {
        cmd = "route";
        args = ["print"];

      } else if (os == linux || os == darwin) {
        cmd = "netstat";
        args = ["-rn"];

      } else if(os == android) {
	cmd = "cat";
	args = ["/proc/net/route"];

      } else {
	callback({error: "getRoutingTable not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "routingInfo",
      	  os: os,
	  cmd : cmd+ " " + args.join(" "),
      	};
      	var data = libParse2(output, info);
      	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    },

    /** 
     * @method getWifiInfo
     * @static
     *
     * @description This function gets the list of nearby wireless access points.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {number} timeout The delay between scan start and second call
     * to fetch the results (on most OSs the first scan cmd invocation does not return
     * the full list of nearby cells or as on android we need two separate calls
     * in anycase).
     */
    getWifiInfo : function(callback, timeout) {
      var that = this;
      var os = this.os;
      var cmd = undefined;
      var args = [];
      var timeout = timeout || 2500; // ms

      if (os == winnt) {
        cmd = "netsh";
        args = ["wlan", "show", "networks","bssid"];

      } else if (os == linux) {
        cmd = "iwlist";
        args = ["scan"];

      } else if (os == darwin) {
      	cmd = airport;
        args = ["-s"];

      } else if(os == android) {
	// wpa_cli is available on some devices, trigger new scan, then request the list
        cmd = "wpa_cli";
        args = ["scan"];

      } else {
	callback({error: "getWifiInfo not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }


      var timer = undefined;
      var first = true;
      
      function cbk(info) {
      	var output = {
      	  name: "wifiInfo",
      	  os: os,
	  cmd : cmd + " " + args.join(" "),
      	};

      	var data = libParse2(output, info);
	if (first) {
	  if (data && !data.error) {
	    if (os == android) {
	      // android has a different command to fetch the results
	      cmd = "wpa_cli";
	      args = ["scan_results"];
	    } // on other platforms just re-fetch the updated list

	    first = false;
	    if (timeout>0) {
	      // delay timeout ms to get more scanning results
	      timer = setTimeoutTimer(function() {
		that._executeCommandAsync(cbk, cmd, args);
	      }.bind(that), timeout);
	    } else {
	      that._executeCommandAsync(cbk, cmd, args);
	    }

	  } else {
	    // some error on first call
      	    callback(data);
	    first = false;
	  }
	} else {
	  // 2nd time - final results
      	  callback(data);
	  timer = undefined;
	}
      }; // cbk
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getWifiInfo

    /**
     * @method getIfaceStats
     * @static
     *
     * @description This function retrieves interface performance
     * counters (bytes, packets, errors, etc).
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */       
    getIfaceStats : function(callback, iface) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == winnt) {
        var cmd = "netstat";
        var args = ["-e"];

      } else if (os == linux || os == android) {
        cmd = "cat";
        args = ["/proc/net/dev"];

      } else if (os == darwin) {
        cmd = "netstat";
        args = ["-bi"];
	if (iface) {
	  args.push("-I " + iface);
	}

      } else {
	callback({error: "getIfaceStats not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
	if (!iface) {
	  // check for the last known iface 
	  var file = FileUtils.getFile("ProfD", ["baseline_endhost.sqlite"]);
	  var db = Services.storage.openDatabase(file);		  
	  var data = "";
	  
	  try {
	    var q1 = "SELECT * FROM endhost ORDER BY id DESC LIMIT 1";
	    var statement = db.createStatement(q1);
	    if (statement.executeStep()) {
	      data = statement.getString(1);
	    }
	  } catch(e) {
	    dump(e);
	  } finally {
	    statement.reset();
	  }
	  
	  if (data && data.length>0) {
      	    // get the top most entry in the db
	    var dataobj = JSON.parse(data);
	    if (dataobj.interface) {
      	      iface = dataobj.interface.current;
	    }
	  }

	  if (!iface) {
	    callback({
	      error: "getIfaceStats failed to find active interface, got " + data, 
	      __exposedProps__: {error: "r"}});
	    return;
	  }
	}

	var output = {
	  name: "interfaceStats",
	  os: os,
	  params: [iface],
	  cmd : cmd + " " + args.join(" "),
	};	    
	var data = libParse2(output, info);
	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getIfaceStats

    /**
     * @method getWifiStats
     * @static
     *
     * @description This function retrieves link quality parameters
     * for WiFi interfaces.
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {string} name Optional wireless inteface name if the system
     * has multiple wireless interfaces.
     */   
    getWifiStats : function(callback, name) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      var params = [];
      if (name)
	params.push(name);

      if (os == winnt) {
      	//netsh wlan show networks mode=bssi
        cmd = "netsh";
        args = ["wlan", "show", "interface"];

      } else if (os == linux || os == android) {
        cmd = "cat";
        args = ["/proc/net/wireless"];

      } else if (os == darwin) {
        cmd = airport;
        args = ["-I"];

      } else {
	callback({error: "getWifiStats not available on " + os,
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {      
      	var output = {
	  name: "wifiStats",
	  os: os,
	  params : params,
	  cmd : cmd + " " + args.join(" "),
	};
	var data = libParse2(output, info);
	callback(data);
      }
      this._executeCommandAsync(cbk, cmd, args);
    }, // getWifiStats

    /**
     * @method getLoad
     * @static
     *
     * @description This function retrieves the client's current system load via "top".
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */       
    getLoad : function(callback) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == linux){
        cmd = "top";
        args = ['-b', '-n1'];

      } else if (os == darwin) {
        cmd = "top";
        args = ["-l2", "-n1"];

      } else if (os == android) {
	cmd = "top";
	args = ['-n', '1', '-m', '1'];

      } else {
	callback({error: "getLoad not available on " + os, 
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
      	var output = {
      	  name: "loadInfo",
      	  os: os,
	  cmd : cmd+ " " + args.join(" "),
      	};

      	var data = libParse2(output, info);
      	callback(data);
      };
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getLoad
    
    /**
     * @method getMemInfo
     * @static
     *
     * @description This function retrieves the client's current memory load via "proc".
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */
    getMemInfo: function (callback) {
      var os = this.os;
      var cmd = undefined;
      var args = [];

      if (os == linux || os == android) {
	cmd = "cat";
	args = ['/proc/meminfo'];

      } else if (os == winnt) {
        cmd = "systeminfo";
        args = [];

      } else {
	callback({error: "getMemInfo not available on " + os,
		  __exposedProps__: {error: "r"}});
        return;
      }
      
      function cbk(info) {
	var output = {
	  name: "memInfo",
	  os: os,
	  cmd : cmd + " " + args.join(" "),
	};

	var data = libParse2(output, info);
	callback(data);
      }
      
      this._executeCommandAsync(cbk, cmd, args);
    }, // getMemInfo
    
    /**
     * @method getProxyInfo
     * @static
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     *
     * @param {string} url The URL for which the function looks up the
     * applicable proxy configuration.
     *
     * @return {dictionary} The result describes the proxy.  For
     * explanation of the dictionary keys, see
     * <a href='https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIProxyInfo'>MDN</a>.
     */
    getProxyInfo : function (callback, url) {
      var proxy = {
      	host : null,
      	port : null,
      	type : null,
      	flags : null,
      	next : null,
      	failoverProxy : null,
      	failoverTimeout : null,
      	__exposedProps__: {
	  host : "r",
	  port : "r",
	  type : "r",
	  flags : "r",
	  next : "r",
	  failoverProxy : "r",
	  failoverTimeout : "r"
	}
      };
      var nextproxy = null, failoverproxy = null;
      
      var protocolProxyService = Cc["@mozilla.org/network/protocol-proxy-service;1"]
	  .getService(Ci.nsIProtocolProxyService);
      var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

      try {
	var uri = ioService.newURI(url, null, null);
      } catch (e) {
	return proxy;
      }

      var proxyInfo = protocolProxyService.resolve(uri, 0);
      if (proxyInfo) {	    
	if (proxyInfo.failoverProxy) {
	  failoverproxy = {
	    host : proxyInfo.failoverProxy.host,
	    port : proxyInfo.failoverProxy.port,
	    type : proxyInfo.failoverProxy.type,
	    flags : proxyInfo.failoverProxy.flags,
	    next : proxyInfo.failoverProxy.next ? proxyInfo.failoverProxy.next.host : "null",
	    failoverProxy : proxyInfo.failoverProxy.failoverProxy ? proxyInfo.failoverProxy.failoverProxy.host : "null",
	    failoverTimeout : proxyInfo.failoverProxy.failoverTimeout,
	    __exposedProps__: {
	      host : "r",
	      port : "r",
	      type : "r",
	      flags : "r",
	      next : "r",
	      failoverProxy : "r",
	      failoverTimeout : "r"
	    }
	  };
	}
	
	if (proxyInfo.next) {
	  nextproxy = {
	    host : proxyInfo.next.host,
	    port : proxyInfo.next.port,
	    type : proxyInfo.next.type,
	    flags : proxyInfo.next.flags,
	    next : proxyInfo.next.next ? proxyInfo.next.next.host : "null",
	    failoverProxy : proxyInfo.next.failoverProxy ? proxyInfo.next.failoverProxy.host : "null",
	    failoverTimeout : proxyInfo.next.failoverTimeout,
	    __exposedProps__: {
	      host : "r",
	      port : "r",
	      type : "r",
	      flags : "r",
	      next : "r",
	      failoverProxy : "r",
	      failoverTimeout : "r"
	    }
	  };
	}
	
	proxy.host = proxyInfo.host;
	proxy.port = proxyInfo.port;
	proxy.type = proxyInfo.type;
	proxy.failoverTimeout = proxyInfo.failoverTimeout;
	proxy.flags = proxyInfo.flags;
	proxy.next = nextproxy;
	proxy.failoverProxy = failoverproxy;
      }

      callback(proxy);
    }, // getProxyInfo
    
    /**
     * @method getBrowserMemoryUsage
     * @static
     *
     * @param {function} callback The callback Fathom invokes once the
     * call completes. On error contains "error" member.
     */
    getBrowserMemoryUsage: function(callback) {
      var mgr = Cc["@mozilla.org/memory-reporter-manager;1"]
	  .getService(Ci.nsIMemoryReporterManager);
      var e = mgr.enumerateReporters();
      while (e.hasMoreElements()) {
	var mr = e.getNext().QueryInterface(Ci.nsIMemoryReporter);
	if(mr.path == "resident") {
	  break;
	}
      }
      var val = {
	memoryUsage: (mr.amount/(1024 * 1024)).toFixed(3), 
	time: Date.now(),
	__exposedProps__ : {
	  memoryUsage : 'r',
	  time : 'r',
	}
      };
      callback(val);
    },
    }; // obj
  }, // system

}; // FathomAPI

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FathomService, FathomAPI]);
