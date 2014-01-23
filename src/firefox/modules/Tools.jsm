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
	 * @description ping (udp/tcp/http) implementation in nspr directly
	 *
	 * @param {function} func The callback function to invoke when
	 * results are available.
	 *
	 * @param {object} args command line arguments, these match more or less
	 * the arguments (naming and values) that you can give to commandline
	 * ping.
	 */
	ping : function(callback, args) {
	    // create new multiresponse worker and return the id for stop calls
	    return ctx._doSocketOpenRequest(callback, 'ping', [args], true);
	},

	/**
	 * @method iperfStop
	 * @static
	 *
	 * @description stop running iperf server
	 */
	pingStop : function(callback, id) {
	    ctx._doSocketUsageRequest(callback, 'pingStop', [id]);
	},

	/**
	 * @method iperf
	 * @static
	 *
	 * @description iperf (client/server) implementation in nspr directly.
	 *
	 * @param {function} func The callback function to invoke when
	 * results are available.
	 *
	 * @param {object} args command line arguments, these match more or less
	 * the arguments (naming and values) that you can give to commandline
	 * iperf.
	 */
	iperf : function(callback, args) {
	    // create new multiresponse worker and return the id for stop calls
	    return ctx._doSocketOpenRequest(callback, 'iperf', [args], true);
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
