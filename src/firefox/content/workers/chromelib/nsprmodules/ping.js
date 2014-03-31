/*
 * Implementation of udp/tcp ping client/server using NSRP directly.
 */
util.registerAction('ping');
util.registerAction('pingStop');

// default settings
var settings = {
    id : -1,
    client : true,        // flag: are we a client (run server if false)
    proto : 'udp',        // one of UDP, TCP, HTTP
    port : 5200,          // destination port
    count : 5,            // number of packets
    interval : 1.0,       // interval between packets (s)
    timeout : 10.0,       // time to wait for answer (s)
    srciface : undefined, // src IP
    size : 56,            // number of payload bytes to send (except HTTP HEAD)

    reports : false,      // periodic reports
    socket : undefined,   // active socket
};

var debug = function(str) {
    dump("ping [" + settings.id + "] " + JSON.stringify(str) + "\n");
};

// default implementation - overriden with NSPR.PR_Now below.
var gettime = function() {return (new Date()).getTime();};
// time since epoch in ms
var gettimets = function() {return (new Date()).getTime();};

/** Helper to get high-res timestamps */
var timestamper = function() {
    // current time is calculated as baseTime + (process.hrtime() - baseTimeHr)
    var baseTime = gettimets()*1.0; // milliseconds since epoch
    var baseTimeHr = gettime(); // high-res timestamp

    // get base reference time
    this.getbasets = function() {
	return baseTime + 0.0;
    };
    
    // get current time
    this.getts = function() {
	var hrt = gettime();
	var diff = hrt-baseTimeHr;
	return baseTime + diff;	
    };

    // diff between now and ts
    this.diff = function(ts) {
	return Math.abs(ts - this.getts());
    };
};

// cleanup and terminate this worker
var shutdown = function(r) {
    if (settings.socket) {
	NSPR.sockets.PR_Close(settings.socket);
	settings.socket = undefined;
	util.unregisterSocket();
    }

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
	if (r.payload)
	    delete r.payload;
	reports.push(r);

	if (s) {
	    succ += 1;

	    times.push(r.time); // rtt

	    r.upd = Math.abs(r.r - r.s); // uplink delay
	    updv.push(r.upd); 

	    r.downd = Math.abs(r.rr - r.r); // downlink delay
	    downdv.push(r.downd);

	    // keep track of the smallest uplink delay
	    if (minupdv === undefined)
		minupdv = r.upd;
	    minupdv = Math.min(minupdv,r.upd);

	    // keep track of the smallest downlink delay
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
		    // first jitter (we've got at least two measurements)
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

	data = data.sort();
	var min = data[0];
	var max = data[data.length-1];
	var med = data[data.length >> 1];

	// mean
	var sum = 0.0;
	for (var i = 0; i< data.length; i++) { 
	    sum += data[i];
	};
	var avg = (1.0 * sum) / data.length;

	// variance
	var v = 0.0;
	for (var i = 0; i< data.length; i++) { 
	    v += (data[i]-avg)*(data[i]-avg); 
	};
	v = (1.0 * v) / data.length;
	
	return {
	    min : min,
	    max : max,
	    avg : avg,
	    median : med,
	    variance : v,
	    mdev : Math.sqrt(v), // std dev
	};
    };

    var get = function() {
	// this will be called only when everything is sent?
	// TODO : may not always be true?
	var sent = settings.count;
	fail = sent - succ; // not all failures get reported...
	
	// scale one-way-delays so that min is 0
	// measures variation with respect to the 
	// fastest one-way-delay
	var fupdv = [];
	for (var i = 0; i < updv.length; i++)
	    fupdv.push(updv[i] - minupdv);

	var fdowndv = [];
	for (var i = 0; i < downdv.length; i++)
	    fdowndv.push(downdv[i] - mindowndv);

	var res = {
	    proto : settings.proto,
	    domain : settings.dst,
	    ip : settings.dst,
	    port : settings.port,
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
		updv : stats(fupdv),
		downdv : stats(fdowndv),
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

// get JSON object from ctype buffer
var getobj = function(buf,strbuf) {
    var data = buf.readString();

    if (settings.proto === "udp") {
	// object per UDP datagram
	try {
	    var obj = JSON.parse(data);
	    return obj;
	} catch (e) {
	    debug('malformed ping response: '+e);
	    debug(data);
	}
    } else {
	// in TCP stream objects are separated by double newline
	var delim = data.indexOf('\n\n');
	while (delim>=0) {
	    strbuf += data.substring(0,delim);
	    try {
		var obj = JSON.parse(strbuf);
		return obj;
	    } catch (e) {
		debug('malformed ping response: '+e);
		debug(strbuf);
	    }
	    data = data.substring(delim+2);
	    delim = data.indexOf('\n\n');
	    strbuf = '';
	} // end while
	
	strbuf += data;
    }
    return undefined;
};

// put obj to ArrayBuffer
var setobj = function(obj,buf) {
    var str = JSON.stringify(obj);
    if (settings.proto === "tcp")
	str += "\n\n";

    var bufView = new Uint8Array(buf);
    for (var i=0; i<str.length; i++) {
	bufView[i] = str.charCodeAt(i);
    }
    bufView[i] = 0;
    return str.length;
};

/* UDP & TCP ping client. */
var cli = function() {
    if (settings.proto !== 'udp' && settings.proto !== 'tcp') {
	return {error : "unsupported client protocol: " + settings.proto};
    }
    
    if (!settings.dst) {
	return {error : "no destination!"};
    }

    var tr = new timestamper();

    // fill the request with dummy payload upto requested num bytes
    var stats = {
	seq:0,
	s:tr.getts(),
    };
    if (settings.size && settings.size>0) {
	var i = 0;
	for (i = 0; i < settings.size; i++) {
	    if (JSON.stringify(stats).length >= settings.size)
		break;

	    if (!stats.payload)
		stats.payload = "";
	    stats.payload += ['1','2','3','4'][i%4];
	}
    };

    // reporting
    var rep = reporter(true);
    var sent = 0;
    var done = function() {
	shutdown(rep.getreport());
    };

    // Practical limit for IPv4 TCP/UDP packet data length is 65,507 bytes.
    // (65,535 - 8 byte TCP header - 20 byte IP header)
    var bufsize = settings.size*2;
    if (bufsize > 65507)
	bufsize = 65507;
    var buf = new ArrayBuffer(bufsize);

    // request sender
    var reqs = {}; 
    var pd = new NSPR.types.PRPollDesc();
    var f = function() {		    
	var pstats = { 
	    seq:sent,
	    s:tr.getts(),
	};
	if (stats.payload)
	    pstats.payload = stats.payload;
	reqs[pstats.seq] = pstats;

	var len = setobj(pstats,buf);
	NSPR.sockets.PR_Send(settings.socket, buf, len, 0, NSPR.sockets.PR_INTERVAL_NO_TIMEOUT);
	sent += 1;

	// now block in Poll for the interval (or until we get an answer back from the receiver)
	pd.fd = settings.socket;
	pd.in_flags = NSPR.sockets.PR_POLL_READ;

	var diff = tr.diff(pstats.s);
	var sleep = settings.interval*1000 - diff;
	if (sleep<0)
	    sleep = 0;

	var prv = NSPR.sockets.PR_Poll(pd.address(), 1, Math.floor(sleep));
	if (prv < 0) {
	    // Failure in polling
	    shutdown({error: 'Poll failed: ' +  + NSPR.errors.PR_GetError()});
	    return;
	} else if (prv > 0) {
	    // incoming data
	    d(true);
	} // else timeout - send next

	// schedule next round ?
	if (sent < settings.count) {
	    diff = tr.diff(pstats.s);
	    sleep = settings.interval*1000 - diff;
	    if (sleep<0)
		sleep = 0;
	    setTimeout(f, sleep);
	} else {
	    d(false); // make sure we have all answers
	}
    };

    // incoming data handler
    var recvbuf = newBuffer(bufsize);
    var strbuf = '';

    var d = function(noloop) {
	if (!settings.socket)
	    return;

	var rv = NSPR.sockets.PR_Recv(settings.socket, recvbuf, bufsize, 0, settings.timeout*1000);
	var ts = tr.getts();

	if (rv == -1) {
	    // Failure. We should check the reason but for now we assume it was a timeout.
	    shutdown({error: 'Recv failed: ' +  + NSPR.errors.PR_GetError()});
	    return;
	} else if (rv == 0) {
	    shutdown({error: 'Network connection is closed'});
	    return;
	}

	// make sure the string terminates at correct place as buffer reused
	recvbuf[rv] = 0; 

	var obj = getobj(recvbuf,strbuf);
	if (obj && obj.seq!==undefined && obj.seq>=0) {
	    var pstats = reqs[obj.seq];				
	    pstats.rr = ts;           // resp received
	    pstats.s = obj.s;         // req sent
	    pstats.r = obj.r;         // server received
	    pstats.time = pstats.rr - pstats.s; // rtt
	    rep.addreport(pstats, true);
	    delete reqs[obj.seq]; // TODO: could count dublicates?

	    // send intermediate reports?
	    if (settings.reports) {
		util.postResult(pstats);
	    }
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
	debug("failed to connect: " + NSPR.errors.PR_GetError());
	shutdown({error : "Error connecting : code = " + NSPR.errors.PR_GetError()});
    } else {
	setTimeout(f,0); // start sending pings
    }

    return {ignore : true}; // async results
};

/* UDP ping server. */
var serv = function() {
    if (settings.proto !== 'udp') {
	return {error : "unsupported server protocol: " + settings.proto};
    }

    // Practical limit for IPv4 TCP&UDP packet data length is 65,507 bytes.
    // (65,535 - 8 byte UDP header - 20 byte IP header)
    var bufsize = 65507;
    var recvbuf = util.getBuffer(bufsize);

    var pd = new NSPR.types.PRPollDesc();
    var tr = new timestamper();

    // main handler loop
    var f = function() {
	if (util.data.multiresponse_stop) {
	    util.data.multiresponse_running = false;
	    shutdown({interrupted : true});
	    return;
	}

	// now block in Poll for the interval (or until we get an answer back from the receiver)
	pd.fd = settings.socket;
	pd.in_flags = NSPR.sockets.PR_POLL_READ;

	var prv = NSPR.sockets.PR_Poll(pd.address(), 1, 250);

	if (prv > 0) {
	    // something to read
	    var peeraddr = new NSPR.types.PRNetAddr();
	    var rv = NSPR.sockets.PR_RecvFrom(settings.socket, recvbuf, bufsize, 0, 
					      peeraddr.address(), NSPR.sockets.PR_INTERVAL_NO_WAIT);
	    var ts = tr.getts();

	    if (rv > 0) {
		// make sure the string terminates at correct place as buffer reused
		recvbuf[rv] = 0; 
		var obj = getobj(recvbuf);
		if (obj && obj.seq!==undefined) {
		    obj.r = ts;
		    obj.ra = NSPR.util.NetAddrToString(peeraddr);
		    obj.rp = NSPR.util.PR_ntohs(peeraddr.port);

		    debug("req from " + obj.ra + ":" + obj.rp);

		    var len = setobj(obj,buf);
		    NSPR.sockets.PR_SendTo(settings.socket, buf, len, 0, 
					   peeraddr.address(), NSPR.sockets.PR_INTERVAL_NO_TIMEOUT);
		}
	    } // else failure to read ?!
	} // else nothing to read

	if (util.data.multiresponse_stop) {
	    util.data.multiresponse_running = false;
	    shutdown({interrupted : true});
	} else {
	    setTimeout(f,0);
	}
    };

    // create and connect the socket
    settings.socket = NSPR.sockets.PR_OpenUDPSocket(NSPR.sockets.PR_AF_INET);
    util.registerSocket(settings.socket);

    var addr = new NSPR.types.PRNetAddr();
    NSPR.sockets.PR_SetNetAddr(NSPR.sockets.PR_IpAddrAny, 
			       NSPR.sockets.PR_AF_INET, 
			       settings.port, addr.address());

    if (NSPR.sockets.PR_Bind(settings.socket, addr.address()) < 0) {
	shutdown({error : "Error binding : code = " + NSPR.errors.PR_GetError()});
    } else {
	setTimeout(f,0); // start receiving pings
    }
    return {ignore : true}; // async results
};

/* Exported method: stop running ping server. */
function pingStop(sid) {
    if (!util.data.multiresponse_running) {
	return {logmsg: 'No ping server is running (nothing to stop).'};
    }
    util.data.multiresponse_stop = true;
    return {ignore : true};
};

/* Exported method: start ping client/server. */
function ping(sid, args) {
    // NSPR is only available now, re-declare the timestamp func
    gettime = function() { return NSPR.util.PR_Now()/1000.0; };

    // override default settings with given arguments
    var args = args || {};
    for (var k in args) {
	if (args.hasOwnProperty(k))
	    settings[k] = args[k];
    }

    settings.id = sid;

    debug(settings);

    if (settings.client) {
	return cli();
    } else {
	return serv();
    }
};
