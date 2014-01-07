// Module API
var EXPORTED_SYMBOLS = ["Tools"];

/**
 * @class Tools
 * @description This module provides the build-in measurements tools API.
 *
 * @param {object} ctx        extension context
 * @param {object} methods    list of requested api methods or ['*'] for all
 */
var Tools = function(ctx,methods) {
    // from extension context
    this._doSyncSocketOpenRequest = ctx._doSyncSocketOpenRequest;
    this._doSocketUsageRequest = ctx._doSocketUsageRequest;
};

// This is the API available to the web pages via the extension
Tools.prototype = {
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
	return this._doSyncSocketOpenRequest(callback, 'ping', [args], true);
    },

    /**
     * @method iperfStop
     * @static
     *
     * @description stop running iperf server
     */
    pingStop : function(callback, id) {
	this._doSocketUsageRequest(callback, 'pingStop', [id]);
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
	return this._doSyncSocketOpenRequest(callback, 'iperf', [args], true);
    },

    /**
     * @method iperfStop
     * @static
     *
     * @description stop running iperf server
     */
    iperfStop : function(callback, id) {
	this._doSocketUsageRequest(callback, 'iperfStop', [id]);
    },
};
