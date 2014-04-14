/** 
 * @author Anna-Kaisa Pietilainen <anna-kaisa.pietilainen@inria.fr>
 */

/** Module API 
 * @private
 */
var EXPORTED_SYMBOLS = ["Tools"];

var Tools = function(ctx) {
    /** 
     * @description fathom.tools.* namespace. Javascript implementations of measurement tools.
     * @exports fathom/tools
     */
    var tools = {};
    
	/**
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
	tools.pingStart = function(callback, dst, args) {
	    // create new multiresponse worker and return the id for stop calls
	    var id = ctx._doSocketWorkerOpenRequest();
	    ctx._doSocketUsageRequest(callback, 'pingStart', 
				      [id, dst, args], true);
	    return id;
	};

	/**
	 * @description stop running ping server
	 */
	tools.pingStop = function(callback, id) {
	    ctx._doSocketUsageRequest(callback, 'pingStop', [id]);
	};

	/**
	 * @description iperf (client/server) implementation using nspr API
	 * directly.
	 *
	 * @param {function} func The callback function to invoke when
	 * results are available.
	 * @param {object} args command line arguments, these match more or less
	 * the arguments (naming and values) that you can give to commandline
	 * iperf.
	 */
	tools.iperfStart = function(callback, args) {
	    // create new multiresponse worker and return the id for stop calls
	    var id = ctx._doSocketWorkerOpenRequest();
	    ctx._doSocketUsageRequest(callback, 'iperfStart', 
				      [id, args], true);
	    return id;
	};

	/**
	 * @description stop running iperf server
	 */
	tools.iperfStop = function(callback, id) {
	    ctx._doSocketUsageRequest(callback, 'iperfStop', [id]);
	};
    
    return tools;
}; // Tools
