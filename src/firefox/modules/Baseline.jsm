// Module API
var EXPORTED_SYMBOLS = ["Baseline"];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");

// TODO: test that this actually works!!

/**
 * @class Baseline
 * @description This module provides the baseline measurement API.
 *
 * @param {object} ctx        extension context
 */
var Baseline = function(ctx) {
    // TODO: add all methods to the exportProps
};

// This is the API available to the web pages via the extension
Baseline.prototype = {

    /**
     * @method baseline
     * @static
     *
     * @description This function returns baseline values for a given metric.
     *
     * [% INCLUDE todo.tmpl msg='(1) Suboptimal naming.  (2) The ffxMemory baseline should get renamed to browserMemory.' %]
     *
     * @param {string} metric The metric to query.  Supported metrics
     * include "cpu", "ffxMemory", "traffic", and "wifi".
     */       
    baseline : function (metric) {
	var file = FileUtils.getFile("ProfD", ["baseline_" + metric + ".sqlite"]);
	var db = Services.storage.openDatabase(file);      
	var data = "";
	
	try {
	    var q1 = "SELECT * FROM " + metric;
      	    var statement = db.createStatement(q1);
	    while (statement.executeStep()) {
		data += statement.getString(1);
	    }
	} catch(e) {
	    dump(e);
	} finally {
	    statement.reset();
	}
	
	//dump("\nRETVAL == " + data + "\n");
	return data;
    },
    
    insertTables: function(table, field, value) {
    	var HISTORY_LENGTH = 100;
    	var file = FileUtils.getFile("ProfD", ["baseline_" + table + ".sqlite"]);
      	var db = Services.storage.openDatabase(file);
      	try {
      	    if(table == "debugConnection")
		var q1 = 'INSERT INTO ' + table + ' VALUES (NULL, "' + value + '", "", "", "", "", "", "", "", "", "")';
	    else if(table == "netError")
		var q1 = 'INSERT INTO ' + table + ' VALUES (NULL, "' + value + '", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "")';
	    //dump("\nSQL insert === " + q1 + "\n");
	    var statement = db.createStatement(q1);
	    statement.executeStep();
	    
	    var q4 = "DELETE FROM " + table + " WHERE id NOT IN (SELECT id FROM " + table + " ORDER BY id DESC LIMIT " + HISTORY_LENGTH + ")";
	    var statement = db.createStatement(q1);
	    statement.executeStep();
	    
	} catch(e) {
	    dump(e);
	} finally {
	    statement.reset();
	}
    },
    
    updateTables: function(testID, table, field, value) {
    
    	function isPrivateBrowsing() {
	    try {
		// Firefox 20+
		Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
		return PrivateBrowsingUtils.isWindowPrivate(window);
	    } catch(e) {
		// pre Firefox 20
		try {
		    return Components.classes["@mozilla.org/privatebrowsing;1"].getService(Components.interfaces.nsIPrivateBrowsingService).privateBrowsingEnabled;
		} catch(e) {
		    Components.utils.reportError(e);
		    return false;
		}
	    }
	}
	
	function maskValues(table, val, field) {
	    // get the saved preferences
	    var pref = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	    var value = pref.getCharPref("extensions.fathom.dataUploadPreferences");
	    if(value) {
		var json = JSON.parse(value)[table];
		// update the val
		if(table == "debugConnection") {
		    if(!json[field + "0"])
			return JSON.stringify("");
		} else if(!json[field])
		    return JSON.stringify("");
		return val;
	    }
	    return JSON.stringify("");
	}
	
    	value = maskValues(table, value, field);
	if(!value || isPrivateBrowsing())
	    return;
	
    	//dump("\n#### " + field + " :: " + value);
    	var file = FileUtils.getFile("ProfD", ["baseline_" + table + ".sqlite"]);
      	var db = Services.storage.openDatabase(file);
      	try {
	    var q1 = 'UPDATE ' + table + ' SET ' + field + ' = \'' + value + '\' WHERE testid = "' + testID + '"';
	    //dump("\nSQL update === " + q1 + "\n");
	    var statement = db.createStatement(q1);
	    statement.executeStep();
	} catch(e) {
	    dump(e);
	} finally {
	    statement.reset();
	}
    },
    
    getIP : function() {
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
	
	if (data && data.length > 0) {
	    try{
		// get the top most entry in the db
		var dataobj = JSON.parse(data);
		if (dataobj.interface)
		    return dataobj.interface.ip;
	    } catch(e) {
	    }
	}
	return null;
    },

    getLastKnownInterface: function() {
	var file = FileUtils.getFile("ProfD", ["baseline_endhost.sqlite"]);
	var db = Services.storage.openDatabase(file);	
	var data = "";

	try {
	    var q1 = "SELECT * FROM endhost ORDER BY id DESC";
	    var statement = db.createStatement(q1);
	    while(statement.executeStep()) {
		data = statement.getString(1);
		if (data && data.length>0) {
		    var dataobj = JSON.parse(data);
		    if (dataobj.interface && dataobj.interface.current && dataobj.interface.ip)
			return dataobj.interface.current + ", IP = " + dataobj.interface.ip;
		}
	    }
	} catch(e) {
	    dump(e);
	} finally {
	    statement.reset();
	}	
	return false;
    },

}; // Baseline.prototype