// Module API
var EXPORTED_SYMBOLS = ["Tools"];

/**
 * @class Tools
 * @description This module provides the build-in measurements tools API.
 *
 * @param {object} ctx - The Fathom extension object. Use this module as 
 *                       'var a = System(ctx); a.getOS();.
 */
var Tools = function(ctx) {
    return {
	/**
	 * @method ping
	 * @static
	 *
	 * @description ping (udp/tcp/http) client/server implementation in 
	 * using nspr API directly
	 *
	 * @param {function} func The callback function to invoke when
	 * results are available.
	 * @param {string} dst The destination host IP.
	 * @param {object} args command line arguments, these match more or less
	 * the arguments (naming and values) that you can give to commandline
	 * ping.
	 */
	pingStart : function(callback, dst, args) {
	    // create new multiresponse worker and return the id for stop calls
	    var id = ctx._doSocketWorkerOpenRequest();
	    ctx._doSocketUsageRequest(callback, 'pingStart', 
				      [id, dst, args], true);
	    return id;
	},

	/**
	 * @method iperfStop
	 * @static
	 *
	 * @description stop running ping server
	 */
	pingStop : function(callback, id) {
	    ctx._doSocketUsageRequest(callback, 'pingStop', [id]);
	},

	/**
	 * @method iperf
	 * @static
	 *
	 * @description iperf (client/server) implementation using nspr API
	 * directly.
	 *
	 * @param {function} func The callback function to invoke when
	 * results are available.
	 * @param {object} args command line arguments, these match more or less
	 * the arguments (naming and values) that you can give to commandline
	 * iperf.
	 */
	iperfStart : function(callback, args) {
	    // create new multiresponse worker and return the id for stop calls
	    var id = ctx._doSocketWorkerOpenRequest();
	    ctx._doSocketUsageRequest(callback, 'iperfStart', 
				      [id, args], true);
	    return id;
	},

	/**
	 * @method iperfStop
	 * @static
	 *
	 * @description stop running iperf server
	 */
	iperfStop : function(callback, id) {
	    ctx._doSocketUsageRequest(callback, 'iperfStop', [id]);
	},
    }; // The API object
}; // Tools
