/*
 * Implementation of udp/tcp ping client/server using NSRP directly.
 */

util.registerAction('ping');
util.registerAction('pingStop');

var debug = function(str) {
    dump("ping: " + JSON.stringify(str) + "\n");
};

// default settings
var settings = {
    client : true,        // flag: are we a client (run server if false)
    proto : 'udp',        // one of UDP, TCP, HTTP
    port : 21314,         // destination port
    count : 3,            // number of packets
    interval : 1.0,       // interval between packets (s)
    timeout : 10.0,       // time to wait for answer (s)
    srciface : undefined, // src IP
    size : 56,            // number of payload bytes to send (except HTTP HEAD)

    pendingStop : false,
    socket : undefined,
};

// default implementation - overriden with NSPR.PR_Now below.
var gettime = function() {return (new Date()).getTime();};
var gettimets = function() {return (new Date()).getTime();};

// cleanup and terminate this worker
var shutdown = function(r) {
    if (settings.socket) {
	util.unregisterSocket();
	NSPR.sockets.PR_Close(settings.socket);
    }
    settings.socket = undefined;

    // post final results and indicate to fathom we're done
    var r = r || {};
    r.done = true; // flag multiresponse done
    r.closed = true; // flag for cleanup inside fathom
    util.postResult(r);

    setTimeout(close, 1); // terminates the worker
};

// Results reporter
var reporter = function() {
    var reports = [];// raw reports
    var times = [];  // rtts
    var upj = [];    // uplink jitter
    var downj = [];  // downlink jitter

    var updv = [];   // uplink delay variation
    var downdv = []; // downlink delay variation

    var minupdv = undefined;
    var mindowndv = undefined;

    var succ = 0;
    var fail = 0;
    var prevreport = undefined;
    
    var add = function(r,s) {
	reports.push(r);
	if (s) {
	    succ += 1;
	    r.upd = r.r - r.s; // uplink delay
	    r.downd = r.rr - r.r; // downlink delay
	    times.push(r.time); // rtt
	    updv.push(r.upd); 
	    downdv.push(r.downd);

	    if (minupdv === undefined)
		minupdv = r.upd;
	    minupdv = Math.min(minupdv,r.upd);

	    if (mindowndv === undefined)
		mindowndv = r.downd;
	    mindowndv = Math.min(mindowndv,r.downd);
	    
	    if (prevreport && prevreport.seq == r.seq-1) {
		// jitter (RFC 1889)
		if (prevreport.upj) {
		    r.upj = 15.0/16.0 * prevreport.upj + 
			1.0/16.0 * Math.abs(r.upd-prevreport.upd)
		    r.downj = 15.0/16.0 * prevreport.downj + 
			1.0/16.0 * Math.abs(r.downd-prevreport.downd)
		} else {
		    r.upj = Math.abs(r.upd-prevreport.upd)
		    r.downj = Math.abs(r.downd-prevreport.downd)
		}
		upj.push(r.upj); 
		downj.push(r.downj);
	    }
	} else {
	    fail += 1;		
	}
	prevreport = r;
    };
    
    var stats = function(data) {
	if (!data || data.length<=0) return {};

	var min = undefined;
	var max = undefined;

	// mean
	var sum = 0;
	for (var v in data) { 
	    sum += v;
	    if (min === undefined)
		min = v;
	    min = Math.min(min,v);
	    if (max === undefined)
		max = v;
	    max = Math.max(max,v);
	};
	var avg = sum / data.length;
	
	// variance
	var v = 0;
	for (var v in data) { 
	    v += (v-avg)*(v-avg); 
	};
	v = v / data.length;
	
	return {
	    min : min,
	    max : max,
	    avg : avg,
	    variance : v,
	    mdev : Math.sqrt(v),
	};
    };

    var get = function() {
	// this will be called only when everything is sent?
	// TODO : may not always be true?
	var sent = settings.count;
	fail = sent - succ; // not all failures get reported...
	
	// scale one-way-delays so that min is 0
	// measures variation with respect to the 
	// fastest one-way-delay (could think of as buffering!)
	var tmp = [];
	for (var v in updv)
	    tmp.push(v - minupdv);
	updv = tmp;

	tmp = [];
	for (var v in downdv)
	    tmp.push(v - mindowndv);
	downdv = tmp;

	var res = {
	    proto : settings.proto,
	    domain : settings.dst,
	    ip : settings.dst || undefined,
	    port : settings.port || 80,
	    pings : reports,
	    stats : {
		packets : {
		    sent : sent,
		    received : succ,
		    lost : fail,
		    lossrate : (fail*100.0) / sent,
		    succrate : (succ*100.0) / sent,
		},
		rtt : stats(times),
		upjitter : stats(upj),
		downjitter : stats(downj),
		updv : stats(updv),
		downdv : stats(downdv),
	    },
	};		
	return res;
    };
	
    // reporter API
    return {
	addreport : add,
	getlen : function() { return reports.length;},
	getreport : get
    };
};

var cli = function() {
    var payload = undefined;
    if (settings.size && settings.size>0) {
	var stats = {
	    seq:0,
	    s:gettimets(),
	    payload:""
	};
		
	var i = 0;
	for (i = 0; i < settings.size; i++) {
	    if (JSON.stringify(stats).length * 2 >= settings.size)
		break;
	    stats.payload += ['1','2','3','4'][i%4];
	}
	payload = stats.payload;
    };

    // reporting
    var rep = reporter(true);
    var sent = 0;

    var done = function() {
	shutdown(rep.getreport());
    };

    // Practical limit for IPv4 TCP/UDP packet data length is 65,507 bytes.
    // (65,535 - 8 byte TCP header - 20 byte IP header)
    var bufsize = 8096;
    var buf = new ArrayBuffer(bufsize);

    // request sender
    var reqs = {}; 
    var pd = new NSPR.types.PRPollDesc();
    var f = function() {		    
	var time = gettime(); 
	var stats = { 
	    seq:sent,
	    s:gettimets(),
	};
	if (payload)
	    stats.payload = payload;

	var str = JSON.stringify(stats);
	if (settings.proto === "tcp")
	    str += "\n\n";
	
	debug("req " + str);

	var bufView = new Uint16Array(buf);
	for (var i=0; i<str.length; i++) {
	    bufView[i] = str.charCodeAt(i);
	}
	bufView[i] = 0;
	NSPR.sockets.PR_Send(settings.socket, buf, str.length*2, 0, NSPR.sockets.PR_INTERVAL_NO_TIMEOUT);
	sent += 1;

	var time2 = gettime();		
	stats.time = time;
	reqs[stats.seq] = stats;

	var sleep = settings.interval*1000 - (time2 - time);
	if (sleep < 0)
	    sleep = 0;

	// now block in Poll for the interval (or until we get an answer back from the receiver)
	pd.fd = settings.socket;
	pd.in_flags = NSPR.sockets.PR_POLL_READ;

	var prv = NSPR.sockets.PR_Poll(pd.address(), 1, Math.floor(sleep));

	time2 = gettime();	
	if (prv < 0) {
	    // Failure in polling
	    done();
	    return;
	} else if (prv > 0) {
	    d(true);
	} // else timeout

	sleep = settings.interval*1000 - (time2 - time);
	if (sleep < 0)
	    sleep = 0;	

	// schedule next round ?
	if (sent < settings.count) {
	    // how long should we sleep (ms)?
	    setTimeout(f, sleep);
	} else {
	    d(false); // make sure we have all answers
	}
    };

//    var recvbuf = newBuffer(bufsize);
    var strbuf = '';

    // incoming data handler
    var d = function(noloop) {
	var rv = NSPR.sockets.PR_Recv(settings.socket, buf, bufsize, 0, NSPR.sockets.PR_INTERVAL_NO_WAIT);
	var hts = gettime();
	var ts = gettimets();

	if (rv == -1) {
	    // Failure. We should check the reason but for now we assume it was a timeout.
	    done();
	    return;
	} else if (rv == 0) {
	    shutdown({error: 'Network connection is closed'});
	    return;
	}

	// make sure the string terminates at correct place as buffer reused
	buf[rv] = 0; 
//	var data = recvbuf.readString();
	var data = String.fromCharCode.apply(null, new Uint16Array(buf));
	debug("resp " + data);

	if (settings.proto === "udp") {
	    try {
		var obj = JSON.parse(data);
		debug(obj);
		if (obj && obj.seq!==undefined && obj.seq>=0) {
		    stats = reqs[obj.seq];
		    var ms = hts - stats.time;
			
		    stats.time = ms;
		    stats.rr = ts;
		    stats.s = obj.s;
		    stats.r = obj.r;
		    rep.addreport(stats, true);
		}
	    } catch (e) {
		debug('malformed ping response: '+e);
	    }
	} else {
	    var delim = data.indexOf('\n\n');
	    while (delim>=0) {
		strbuf += data.substring(0,delim);
		try {
		    var obj = JSON.parse(strbuf);
		    if (obj && obj.seq!==undefined && obj.seq>=0) {
			stats = reqs[obj.seq];
			var ms = hts - stats.time;
			
			stats.time = ms;
			stats.rr = ts;
			stats.s = obj.s;
			stats.r = obj.r;
			rep.addreport(stats, true);
		    }
		} catch (e) {
		}
		data = data.substring(delim+2);
		delim = data.indexOf('\n\n');
		strbuf = '';
	    } // end while

	    strbuf += data;
	}

	if (rep.getlen() === settings.count) {
	    done();
	} else if (!noloop) {
	    setTimeout(d,0); // keep reading
	}
    }; // end d

    // create and connect the socket
    if (settings.proto === 'tcp') {
	settings.socket = NSPR.sockets.PR_OpenTCPSocket(NSPR.sockets.PR_AF_INET);
    } else {
	settings.socket = NSPR.sockets.PR_OpenUDPSocket(NSPR.sockets.PR_AF_INET);
    }
    util.registerSocket(settings.socket);

    var addr = new NSPR.types.PRNetAddr();
    addr.ip = NSPR.util.StringToNetAddr(settings.dst);
    NSPR.sockets.PR_SetNetAddr(NSPR.sockets.PR_IpAddrNull, 
			       NSPR.sockets.PR_AF_INET, 
			       settings.port, addr.address());

    if (NSPR.sockets.PR_Connect(settings.socket, addr.address(), settings.timeout*1000) < 0) {
	shutdown({error : "Error connecting : code = " + NSPR.errors.PR_GetError()});
	return {ignore : true}; // async results
    }

    setTimeout(f,0); // start sending pings

    return {ignore : true}; // async results
};

var serv = function(args) {
    return {ignore : true}; // async results
};

/* Exported method: stop running ping server. */
function pingStop() {
    settings.pendingStop = true;
    return {ignore : true};
};

/* Exported method: start ping client/server. */
function ping(args) {
    // NSPR is only available now, re-declare the timestamp func
    gettime = function() { return NSPR.util.PR_Now()/1000.0; };

    // override default settings with given arguments
    var args = args || {};
    for (var k in args) {
	if (args.hasOwnProperty(k))
	    settings[k] = args[k];
    }

    debug(settings);

    if (settings.client) {
	cli();
    } else {
	serv();
    }
};
