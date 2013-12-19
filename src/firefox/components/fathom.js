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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const Ci = Components.interfaces;
const Cc = Components.classes;

const EXTENSION_ID = "fathom@icir.org";

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
	dump("created service instance\n");
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
      Logger.error("exception from _init(): " + e);
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
    Components.utils.import("resource://gre/modules/AddonManager.jsm");
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
      Logger.dump(e + " while unregistering.");
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
    var modules = ["Logger", "utils", "security", "Tools", "Socket", "System", "Proto"];
    for (var i in modules) {
      filename = modules[i];
      try {
        Components.utils.import("resource://fathom/" + filename + ".jsm");
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
    default:
      Logger.error("uknown topic observed: " + topic);
    }
  }
}; // FathomService

/**
 * FathomAPI provides the objects that are added to DOM windows. A separate
 * FathomAPI object is created for each window and then the value returned
 * from the init() function is added to the window's properties.
 */
function FathomAPI() {
  this.os = Cc["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).OS.toLowerCase();
  this.arch = Cc["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).XPCOMABI;
  this.initialized = false;

  // internal data
  this.chromeworkers = {};
  this.requests = {};
  this.nextrequestid = 1;
  this.nextsocketid = 1;
  this.scriptworkers = {};
  this.nextscriptid = 1;
  this.commands = {};

  this.allowed_destinations = {};
  this.client_policy = {};
}

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
  client_policy : null,
  allowed_destinations : null,

  // /////////////////////////////////////////////////////////////////////////
  // Internal utilities
  // /////////////////////////////////////////////////////////////////////////

  _initChromeWorker : function(workername, workerscript) {
    Components.utils.import("resource://gre/modules/Services.jsm");
    Components.utils.import("resource://gre/modules/ctypes.jsm");

    var worker = new ChromeWorker("chrome://fathom/content/workers/" + workerscript + ".js");
    worker.name = workername;

    try {
      worker.onerror = function(event) {
        msg = event.message + ' [' + event.filename + ':' + event.lineno + ']';
        Logger.error('Worker error: ' + msg);
      };

      const fathomapi = this;
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
			 requestid);
	  Logger.warning('Data ' + JSON.stringify(result,null,2));
        } else {
          // TODO: possibly make sure the worker is the one we expect (the one
          // stored in the requestinfo).
          try {
            if(result) {
	      // TODO: call the callback async using setTimeout.

	      // Anna: recursively mark everything visible
	      var recur = function(o) {
		var exp = {};
		for(var props in o) {
		  if (!o.hasOwnProperty(props))
		    continue;

		  exp[props] = "r";
		  if (o[props] instanceof Array) {
		    for (var i = 0; i < o[props].length; i++) {
		      recur(o[props][i]);
		    }
		  } else if (o[props] instanceof Object) {
		    recur(o[props]);
		  }
		}
		o["__exposedProps__"] = exp;
	      };
	      recur(result);
	      requestinfo['callback'](result);
	    }
          } catch (e) {
            // TODO: decide on a good way to send this error back to the document.
            Logger.error('Error when calling user-provide callback: ' + e);
	    Logger.error(e.stack);
          }
	}

	// one time request or multiresponse is done ?
        if ((requestinfo && !requestinfo['multiresponse']) || 
	    (result && result['done'])) 
	{
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
      worker.postMessage(JSON.stringify(obj));

    } catch (exc) {
      worker.terminate();
      throw exc;
    }

    this.chromeworkers[workername] = worker;
    return worker;
  },

  _performRequest : function(worker, callback, action, args, multiresponse) {
    var requestid = this.nextrequestid++;
    this.requests[requestid] = {worker : worker, 
				callback : callback,
                                multiresponse : multiresponse};

    Logger.info('Performing request for action: ' + action + ' (requestid: ' +
                requestid + ', worker: ' + worker.name + ')');

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
      Logger.info("Expected socket as the first argument.");
      callback({error:"Expected socket as the first argument.", 
		__exposedProps__: { error: "r" }});
      return;
    }

    Logger.info("Looking up socket " + socketid + " for action " + action);
    var worker = this.chromeworkers['socketworker'+socketid];
    if (!worker) {
      Logger.info("Could not find the worker for this socket.");
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
        Logger.info("Socket open request failed: " + worker.name);
        result["__exposedProps__"] = { error: "r" };
        callback(result);
      }
    }
    this._performRequest(worker, socketRegistrationCallback, action, args);
  },

  /* @deprecated
   * Same as above but return the id to the client right away without
   * callbacks.
   */
  _doSyncSocketOpenRequest : function(callback, action, args, multiresponse) {    
    var multiresponse = multiresponse || false;
    var socketid = this.nextsocketid++;
    var workername = 'socketworker' + socketid;
    var workerscript = 'chromeworker';
    var worker = this._initChromeWorker(workername, workerscript);
    this._performRequest(worker, callback, action, args, multiresponse);
    return socketid;
  },

  /*
   * Run a cmd line program.
   */
  _executeCommandAsync : function(callback, cmd, args, incrementalCallback) {
    Components.utils.import("resource://gre/modules/FileUtils.jsm");
    Components.utils.import("resource://gre/modules/NetUtil.jsm");

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
    var outfile = tmpdir.clone()
    outfile.append('fathom-command.' + commandid + '.out');
    var errfile = tmpdir.clone()
    errfile.append('fathom-command.' + commandid + '.err');

//    Logger.debug("outfile: " + outfile.path);
//    Logger.debug("errfile: " + errfile.path);

    const fathomapi = this;
    var observer = {
      observe: function(subject, topic, data) {
        if (topic != "process-finished" && topic != "process-failed") {
          dump("\n" + 'Unexpected topic observed by process observer: ' + topic + "\n");
          throw 'Unexpected topic observed by process observer: ' + topic;
        }
        
        var exitstatus = subject.exitValue;

        function handleOutfileData(outdata) {
          function handleErrfileData(errdata) {
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
    	    	dump("\n" + "Error executing the callback function: " + e + "\n");
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
    var wrapperfile = getCommandWrapper();
    var wrapperargs = undefined;
    if (this.os == "android") {
      // get sh executable
      var shPath = getLocalFile("/system/bin/");
      var sh = shPath.clone();
      sh.append('sh');
      process.init(sh);
      wrapperargs = [wrapperfile.path, outfile.path, errfile.path, cmd].concat(args);
    } else {
      process.init(wrapperfile);
      wrapperargs = [outfile.path, errfile.path, cmd].concat(args);
    }
    process.runAsync(wrapperargs, wrapperargs.length, observer);

    /* incremental output for traceroute & ping */
    if (incrementalCallback == true) {
      var file = FileUtils.getFile("TmpD", [outfile.leafName]);
      var index = 0, timeout = 250, count = 120;
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
	      callback({exitstatus: null, stdout: outdata, stderr: null, __exposedProps__: { exitstatus: "r", stdout: "r", stderr: "r" }});
	    });
	  }catch(e){
	    dump("\n" + "Error executing the NetUtil.asyncFetch callback function: " + e + "\n");
	  }
	}  
      }  
      var timers = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);  
      const TYPE_REPEATING_PRECISE = Components.interfaces.nsITimer.TYPE_REPEATING_PRECISE;
      timers.init(event, timeout, TYPE_REPEATING_PRECISE);
    } // incremental output    
  },

  /* Check if we are allowed to connect to the given IP */
  _checkDestinationPermissions : function (callback, requested_destination) {
    // already checked?
    if (this.allowed_destination.hasOwnProperty(requested_destinations)) {
      callback({});
      return;
    }

    var checkServer = function() {
      checkServerPolicy(function(allow) {
	if (allow) {
	  // ok to proceed
	  this.allowed_destination[requested_destination] = {};
	} else {
	  this.allowed_destination[requested_destination] = 
	      {error : "Server " + requested_destination + " denies access",
	       __exposedProps__: { error: "r" }};	  
          callback();
	}
	callback({});

      }, this.allowed_destinations, requested_destination);
    };

    var src = this.window.content.location.href;
    if (this.window.content instanceof Ci.nsIDOMWindow && 
	(src.substring(0, 9) == "chrome://" || //src.substring(0, 7) == "file://" ||
	 this.window.content.document.documentURI.match(/^about:neterror/) ||
	 this.window.content.document.documentURI.match(/^about:certerror/))) 
    {
      // special access to any destination for chrome pages
      checkServer();
    } else {
      // check that dst conforms to client policy
      if (checkClientDstPolicy(requested_destination)) {
	checkServer();
      } else {
        callback({error : "User denies access to " + requested_destination,
		  __exposedProps__: { error: "r" }});

      }
    }

  }, // _checkDestinationPermissions

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
    Components.utils.import("resource://gre/modules/Services.jsm");
    switch (topic) {
    case "inner-window-destroyed":
      try{
	var windowID = subject.QueryInterface(Ci.nsISupportsPRUint64).data;
	var innerWindowID = this.window.QueryInterface(Ci.nsIInterfaceRequestor).
	    getInterface(Ci.nsIDOMWindowUtils).currentInnerWindowID;
	if (windowID == innerWindowID) {
	  Logger.info("Calling shutdown()");
	  this.shutdown("inner-window-destroyed");
	  delete this.window;
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
    Components.utils.import("resource://gre/modules/Services.jsm");

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

    var dnsService = Cc["@mozilla.org/network/dns-service;1"]
	.createInstance(Ci.nsIDNSService);
    var hostname = dnsService.myHostName;
    Logger.debug(hostname);

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
            Logger.dump("page hidden:" + doc.location.href + "\n");
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

    // Initial dummy API
    this.api = {
      init : self.api_init.bind(self),
      build: pref.getCharPref("extensions.fathom.build"),
      version: pref.getCharPref("extensions.fathom.version"),

      proto: {},
      socket: {},
      system: {},
      tools: {},

      __exposedProps__: {
        init: "r",
        version : "r",
        build : "r",
	proto: "r",
	socket: "r",
	system: "r",
	tools: "r"
      }
    };

    return this.api;
  }, // init

  /* Enable the Fathom API based on the page manifest and current policies. */
  api_init : function (callback, manifest, win) {      
    var that = this;

    // helper to initialize selected API modules
    var enableapis = function(manifest) {
      for (var apiname in manifest.api) {
	switch (apiname) {
	case "socket":
	  that.api[apiname] = new Socket(that, manifest[apiname]);
	  break;
	case "proto":
	  that.api[apiname] = new Proto(that, manifest[apiname]);
	  break;
	case "system":
	  that.api[apiname] = new System(that, manifest[apiname]);
	  break;
	case "tools":
	  that.api[apiname] = new Tools(that, manifest[apiname]);
	  break;
	default:
	  break;
	};
	// add all baseline apis always
	that.api["baseline"] = new Baseline(that, ['*']);
      }
    };

    // check if the extension is enabled
    var prefFathom = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    if (!prefFathom.getBoolPref("extensions.fathom.status")) {
      callback({'error': 'extension is disabled by the user',
		__exposedProps__: { error: "r" }});
      return false;
    }

    // Parse manifest to more usable format
    manifest = parsePageManifest(manifest);
    if (manifest.error) {
      // something wrong with the format
      callback(manifest);
      return false;
    };

    // Special treatment for chrome pages:
    // - allow all requested apis + baseline
    // - allow any destination (unless server limited)
    var src = win.location.href;
    if (win instanceof Ci.nsIDOMWindow && 
	(src == "about:blank" ||
	 win.document.documentURI.match(/^about:neterror/) ||
	 win.document.documentURI.match(/^about:certerror/) ||
	 src.substring(0, 9) == "chrome://")) 
    {
      enableapis(manifest);
      callback({});
      return true;
    }

    // Get the client policy for this domain (win.location.origin)
    var client_policy = getClientPolicy(win.location);

    // If the full manifest is not covered, prompt the user
    if (!manifestCovered(manifest,client_policy)) {      
      // TODO: ask user

      // TODO: save user prefs to db

      // If the full manifest is still not covered, error
      // TODO : should we enable the subset of allowed APIs in this case ?
      if (!manifestCovered(manifest,user_policy)) {
	callback({'error': 'following APIs were not available : ' + [],
		  __exposedProps__: { error: "r" }});
	return false;	
      }
    }
    
    // passed all the checks - enable the api and return success
    enableapis(manifest);
    callback({});
    return true;

    var windowargs = {
      host: this.window.content.location.host, 
      url: this.window.content.location.href,
      callback: callback,
      requested_apis: requested_apis,
      requested_destinations: requested_destinations,
      api: this.api,
//      fullapi: this.fullapi,
      allowed_destinations: this.allowed_destinations,
    };
    windowargs.wrappedJSObject = windowargs;    
    
    var api_flag = true;

    // check for client policy
    (function() {      
      var api = windowargs['api'];
      var fullapi = windowargs['fullapi'];
      var host = windowargs.host ? windowargs.host : windowargs.url;
      
      var requested_policy_apis = [];
      for(var domain in client_policy) {
	var str = "." + domain;
	var re = new RegExp(str, "ig");
	if(host.match(re)) {
	  Logger.debug("Matched == " + host + " :: " + domain );
	  // get the apis
	  var policy_apis = client_policy[domain][1];
	  for (var i = 0; i < policy_apis.length; i++) {
	    apiname = policy_apis[i];
	    var parts = apiname.split('.');
	    if (parts.length != 2 || !parts[0] || !parts[1]) {
	      callback({'error': "Invalid API format in manifest: " + apiname, __exposedProps__: { error: "r" }});
	    }
	    if (!fullapi[parts[0]]) {
	      callback({'error': "Unknown API module in manifest: " + parts[0], __exposedProps__: { error: "r" }});
	    }
	    if(parts[1] == '*') {
	      //this.api[parts[0]] = this.fullapi[parts[0]];
	    } else {
	      if (!fullapi[parts[0]][parts[1]]) {
		callback({'error': "Unknown API function in manifest: " + apiname, __exposedProps__: { error: "r" }});
	      }
	      //this.api[parts[0]][parts[1]] = this.fullapi[parts[0]][parts[1]];
	    }
	    requested_policy_apis.push([parts[0], parts[1]]);
	  }
	  
	  // fix the apis
	  var allow = client_policy[domain][0];
	  for (var i=0; i<requested_policy_apis.length; i++) {
	    var apimodule = requested_policy_apis[i][0];
	    var apifunc = requested_policy_apis[i][1];
	    Logger.debug(apimodule + " :: " + apifunc)
	    if (apifunc == '*') {
	      api[apimodule] = (allow ? fullapi[apimodule] : null);
	    } else {
	      api[apimodule][apifunc] = (allow ? fullapi[apimodule][apifunc] : null);
	    }
	  }
	}
      }

      /* if all manifest apis are covered then do nothing, else invoke the security dialog for the requested apis */
      for(var j = 0; j < requested_apis.length; j++) {
	var temp0 = requested_apis[j];
	var requested_api = temp0[0] + "." + temp0[1];
	var temp_flag = false;
	for(var i = 0; i < requested_policy_apis.length; i++) {
	  var temp1 = requested_policy_apis[i];
	  var client_policy_api = temp1[0] + "." + temp1[1];
	  if(requested_api == client_policy_api) {
	    temp_flag = true;
	    break;
	  }
	}
	api_flag &= temp_flag;
      }		
    })();
    
    if(!api_flag) {
      // all apis are not covered, invoke the security dialog
      //			dump("APIs not covered.");
    } else {
      // all apis are covered, do nothing
      //			dump("APIs covered.");
      callback({});
      return;
    }
    
    try {
      if (os == "android") {
        var dest = "", privs = "";
	(function writeBody() {
	  if (requested_apis.length > 0) {
	    for (var i=0; i<requested_apis.length; i++) {
	      apimodule = requested_apis[i][0];
	      apifunc = requested_apis[i][1];
	      privs += apimodule + '.' + apifunc + ",";
	    }
	  }

	  if (requested_destinations.length > 0) {
	    for (var i=0; i<requested_destinations.length; i++) {
	      dest += requested_destinations[i] + ",";
	    }
	  }
	})();
	
	var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
	var result = prompts.confirm(null, "A web page is requesting Fathom privileges.", "Url: " + windowargs.url + "\nAPIs: " + privs + "\nDestination: " + dest + "\n\nWould you like to grant access to Fathom APIs.");
	
	if(result) {
	  var requested_apis = windowargs['requested_apis'];
	  var api = windowargs['api'];
	  var fullapi = windowargs['fullapi'];

	  for (var i = 0; i < requested_apis.length; i++) {
	    var apimodule = requested_apis[i][0];
	    var apifunc = requested_apis[i][1];
	    if (apifunc == '*') {
	      api[apimodule] = fullapi[apimodule];
	    } else {
	      api[apimodule][apifunc] = fullapi[apimodule][apifunc];
	    }
	  }
	  // need to check this
	  callback({});
	}
      } else {
        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
            .getService(Components.interfaces.nsIWindowWatcher);
        var win = ww.openWindow(null, "chrome://fathom/content/page_permissions.html",
                                null, "chrome,centerscreen,modal,dependent,width=600,height=400",
                                windowargs);
      }
    } catch (e) {
      var result = {'error': e.toString(), __exposedProps__: { error: "r" }}
      callback(result);
    }
  }, // api_init

}; //FathomAPI

var NSGetFactory = XPCOMUtils.generateNSGetFactory([FathomService, FathomAPI]);
