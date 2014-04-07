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
Cu.import("resource://fathom/utils.jsm");

// Resolve these only once (methods in utils.jsm)
var nsprfile = getNsprLibFile();
var nsprlibname = getNsprLibName();

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

  _init : function() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;

    try {
      this._loadLibraries();
      this._register();
      this._initializePrefSystem();
      // Note that we don't load user preferences at this point because the user
      // preferences may not be ready. If we tried right now, we may get the
      // default preferences.
    } catch (e) {
      dump("exception from FathomService._init(): " + e);
    }
  },

  _syncFromPrefs : function() {
    // Load the logging preferences before the others.
    this._updateLoggingSettings();
  },

  _updateLoggingSettings : function() {
    Logger.enabled = this.prefs.getBoolPref("log");
    Logger.level = this.prefs.getIntPref("log.level");
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
    os.addObserver(this, "xpcom-shutdown", false);
    os.addObserver(this, "profile-after-change", false);
    os.addObserver(this, "quit-application", false);
    this._registerAddonListener();
  },

  _unregister : function() {
    try {
      var os = Cc['@mozilla.org/observer-service;1']
          .getService(Ci.nsIObserverService);
      os.removeObserver(this, "xpcom-shutdown");
      os.removeObserver(this, "profile-after-change");
      os.removeObserver(this, "quit-application");
    } catch (e) {
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
    var modules = ["Logger", "Security", "Tools", "Socket", "System", "Proto"];
    for (var i in modules) {
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

  // security
  security : null,

  // /////////////////////////////////////////////////////////////////////////
  // Internal utilities
  // /////////////////////////////////////////////////////////////////////////

  _initChromeWorker : function(workername) {
    const that = this;
    Cu.import("resource://gre/modules/Services.jsm");
    Cu.import("resource://gre/modules/ctypes.jsm");

    var worker = new ChromeWorker("chrome://fathom/content/workers/chromeworker.js");
    worker.name = workername;
    Logger.debug("[" + this.windowid + "] Create worker " + worker.name);

    try {

      worker.onerror = function(event) {
        msg = event.message + ' [' + event.filename + ':' + event.lineno + ']';
        Logger.error("[" + that.windowid + "] Worker error: " + msg);
      };

      worker.onmessage = function(event) {
        var data = JSON.parse(event.data);

        if (data.logmsg !== undefined) {
          Logger.info("[" + that.windowid + "] Worker log: " + data.logmsg);
          return;
        }

        var result = data.result;
        var requestid = data.requestid;
        var requestinfo = that.requests[requestid];

        if (!requestinfo) {
          Logger.warning("[" + that.windowid + "] " + 
			 "Received response from worker for unknown requestid: "
			 + requestid);
	  return;
	}

        Logger.info("[" + that.windowid + 
		    "] Received response for requestid: " + requestid);

        if (result) {
	  if (result.error && !result.__exposedProps__) {
	    // make sure error is visible
	    result.__exposedProps__ = { error : 'r'};
	  }
	    
	  try {
	    if (requestinfo['callback'] && 
		typeof requestinfo['callback'] === 'function') {
	      requestinfo['callback'](result);
	    } else {
              Logger.debug("[" + that.windowid + "] No callback found ");
	    }
          } catch (e) {
            // TODO: decide on a good way to send this error back to the document.
            Logger.error("[" + that.windowid + "] Error when calling user-provide callback: " + e);
	    Logger.error(e.stack);
          }
	} else {
          Logger.warning("[" + that.windowid + 
			 "] Received empty response for requestid: " + 
			 requestid);
	}

	// one time request or multiresponse is done ?
	if ((requestinfo && !requestinfo['multiresponse']) || 
	    (result && result.done)) {
          delete that.requests[requestid];
          Logger.info("[" + that.windowid + "] Request done: " + requestid);
	}

	// Anna: adding a way to clean things up inside fathom
	// if the worker closes itself
	if (result && result.closed) {
	  // the worker has closed itself, remove any references
	  // so this worker object gets garbage collected
	  delete that.chromeworkers[workername];
          Logger.info("[" + that.windowid + "] Worker closed: " + workername);
	}
      }; // onmessage

      // initialize the worker
      var obj = {'init' : true, 
		 'nsprpath' : nsprfile.path,
		 'nsprname' : nsprlibname,  
		 'arch' : this.arch, 
		 'os' : this.os,
		 'windowid' : this.windowid};
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

    Logger.info("[" + this.windowid + "] Performing request for action: " + 
		action + ' (requestid: ' +
                requestid + ', worker: ' + worker.name+ ')');

    var obj = {action: action, requestid: requestid, args: args};
    worker.postMessage(JSON.stringify(obj));
  },

  _doNonSocketRequest : function(callback, action, args, multiresponse) {
    var multiresponse = multiresponse || false;
    var workername = 'nonsocketworker';
    var worker = this.chromeworkers[workername];    
    if (!worker) {
      worker = this._initChromeWorker(workername);
    }
    this._performRequest(worker, callback, action, args, multiresponse);
  },

  _doSocketUsageRequest : function(callback, action, args, multiresponse) {
    // Assume socketid will be the first argument.
    var socketid = args[0];
    if (!socketid) {
      Logger.error("[" + this.windowid + 
		   "] Expected socket as the first argument for action "+
		   action+".");
      callback({error:"Expected socket as the first argument.", 
		__exposedProps__: { error: "r" }});
      return;
    }

    Logger.info("[" + this.windowid + "] Looking up socket " + 
		socketid + " for action " + action);

    var worker = this.chromeworkers['socketworker'+socketid];
    if (!worker) {
      Logger.error("[" + this.windowid + 
		   "] Could not find the worker for this socket.");
      callback({error:"Could not find the worker for this socket.", 
		__exposedProps__: { error: "r" }});
      return;
    }
    this._performRequest(worker, callback, action, args, multiresponse);
  },

  /*
   * Create a new socket worker thread.
   */
  _doSocketWorkerOpenRequest : function() {
    var socketid = this.nextsocketid++;
    var workername = 'socketworker' + socketid;
    var worker = this._initChromeWorker(workername);
    return socketid;
  },

  /*
   * Each socket gets its own worker (thread). This function will create a new
   * worker and will intercept the callback to the user code in order to
   * provide the socketid (assigned here, not in the chromeworker) back to the
   * user as well as to do some accounting so that future requests for this
   * same socketid can be invoked on the same chromeworker.
   */
  _doSocketOpenRequest : function(callback, action, args) {
    var that = this;
    var socketid = this.nextsocketid++;
    var workername = 'socketworker' + socketid;
    var worker = this._initChromeWorker(workername);

    function socketRegistrationCallback(result) {
      if (result && !result['error']) {
        Logger.info("[" + that.windowid + "] Registered socket worker " + 
		    worker.name + " for socketid " + socketid);
        callback(socketid);
      } else {
        Logger.error("[" + that.windowid + "] Socket open request failed: " + 
		     worker.name);
	if (!result.__exposedProps__) // make sure the error is visible
          result.__exposedProps__ = { error: "r" };
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

    Logger.debug("[" + this.windowid + "] _executeCommandAsync : " + cmd);

    if (!args) {
      args = []; 
      // Anna: not sure why this limit is imposed ? Remove for now for iperf
//    } else {
//      // TODO: make sure args is an array
//      if (args.length > 4) {
//        throw 'At the moment you cannot pass more than 4 arguments to a command';
//      }
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

    var that = this;
    var observer = {
      observe: function(subject, topic, data) {
        if (topic != "process-finished" && topic != "process-failed") {
          throw 'Unexpected topic observed by process observer: ' + topic;
        }
        
        var exitstatus = subject.exitValue;
	Logger.debug("[" + that.windowid + "] async command " + commandid + " ready :  " + topic + " [" + exitstatus + "]");

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
    	    	Logger.error("[" + that.windowid + "] Error executing the callback function: " + e);
		Logger.error(e.stack);
    	      }
	    }

	    // cleanup
            try{
              if (subject.isRunning) {
		subject.kill();
	      }
	    } catch (e) {
      	      Logger.warning("[" + that.windowid + "] Failed to kill process: " + e);
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
    Logger.debug("[" + this.windowid + "] make the async command " + commandid + ": " + wrapperargs.join(' '));

    process.runAsync(wrapperargs, wrapperargs.length, observer);

    /* incremental output for traceroute & ping */
    if (incrementalCallback == true) {
      var file = FileUtils.getFile("TmpD", [outfile.leafName]);
      var index = 0, timeout = 250, count = 120;
      Logger.debug("[" + that.windowid + "] sending incremental updates for results every 250ms");

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
			__exposedProps__: { 
			  exitstatus: "r", 
			  stdout: "r", 
			  stderr: "r" }});
	    });
	  } catch(e) {
	    Logger.error("[" + that.windowid + "] Error executing the NetUtil.asyncFetch callback function: " + e);
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
  _addNewDiscoveredDevice : function(dobj, proto) {
    this.security.addNewDiscoveredDevice(dobj,proto);
  },

  /*
   * Check if given proto://destination:port is allowed (proto and port can be 
   * undefined and map to * in manifest.
   */
  _checkDestinationPermissions : function(cb, dst, port, proto) {
    this.security.checkDestinationPermissions(cb, dst, port, proto);
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
	  Logger.info("[" + this.windowid + "] Calling shutdown()");
	  this.shutdown("inner-window-destroyed");
	  delete this.window; // Anna: ???
	  Services.obs.removeObserver(this, "inner-window-destroyed");
	}
      } catch(e) {
	Logger.error("[" + this.windowid + "] Inner-window-destroyed: " + e);
      }
      break;
    default:
      Logger.error("[" + this.windowid + "] unknown topic observed: " + topic);
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
    var jsonobj = JSON.stringify({action: 'shutdown'});

    // With the requests object reset, from this moment on we will not call the
    // page's callbacks for any pending requests that complete.
    this.requests = {};	

    for (var name in this.chromeworkers) {
      Logger.info("[" + this.windowid + 
		  "] [shutdown] Sending shutdown message to chromeworker: " + 
		  name);
      this.chromeworkers[name].postMessage(jsonobj);
      delete this.chromeworkers[name];
    }
    this.chromeworkers = {};

    Logger.debug("[" + this.windowid + "] shutdown ready");
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
    var that = this;
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
            Logger.info("[" + that.windowid + "] page hidden:" + 
			doc.location.href + "\n");
            that.shutdown("pagehide");
          }
        } catch(e) {
          Logger.error("[" + that.windowid + "] PAGEHIDE: " + e);
        }
      }
      this.window.addEventListener("pagehide", onPageHide, false);
    } else {
      Logger.debug("[" + this.windowid + "] init() called on window that has already been initialized");
    }

    // Initial dummy Fathom API
    var pref = Cc["@mozilla.org/preferences-service;1"]
	.getService(Ci.nsIPrefBranch);

    this.api = {
      build: pref.getCharPref("extensions.fathom.build"),
      version: pref.getCharPref("extensions.fathom.version"),
      init : that.api_init.bind(that),

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

    Logger.debug("[" + this.windowid + "] init version="+
		 this.api.version+", build="+this.api.build+ 
		 ", nsprfile="+nsprfile.path);
    return this.api;
  }, // init

  /* Enable the Fathom API based on the page manifest and user preferences. */
  api_init : function (callback, manifest, win) {      
    // check if the extension is enabled ?
    var prefFathom = Cc["@mozilla.org/preferences-service;1"]
	.getService(Ci.nsIPrefBranch);

    if (!prefFathom.getBoolPref("extensions.fathom.status")) {
      callback({'error': 'extension is disabled by the user',
		__exposedProps__: { error: "r" }});
      return;
    }
    Logger.info("[" + this.windowid + "] API init");

    var that = this;
    var sys = System(that); // preinit sys module
    var f = function(ifaces) {
      // local interfaces
      var ifacelist = ((ifaces && ifaces.interfaces) ? ifaces.interfaces : []);

      // initialize the page security helper
      that.security = new Security(win.location, that.os, ifacelist, manifest);

      // ask the user to accept the manifest
      that.security.askTheUser(function(allowed) {
	Logger.info("[" + that.windowid + "] Manifest ok ? " + allowed);

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
	      apiobj = sys;
	      break;
	    case "tools":
	      apiobj = Tools(that);
	      break;
	    default:
	      break;
	    };

	    that.api[apiname] = that.security.setAvailableMethods(apiname,apiobj);
	  } // end for

	  // add all baseline apis for chrome pages
	  if (that.security.ischromepage)
	    that.api["baseline"] = new Baseline(that);

	  Logger.info("[" + that.windowid + "] all done");

	  // done
	  callback({});

	} else {
	  // else user did not accept the manifest
	  callback({'error': 'user did not accept the manifest',
		    __exposedProps__: { error: "r" }});
	}
      }); // askTheUser
    }; // f

    // start by getting interfaces (needed for the security module)
    sys.getActiveInterfaces(f);

  }, // api_init
}; // FathomAPI

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FathomService, FathomAPI]);
