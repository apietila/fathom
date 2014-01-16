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

util.registerAction('multicastOpenSocket');
util.registerAction('multicastBind');

/**
 * Create a multicast socket.
 *
 * @param {number} ttl - IP_MULTICAST_TTL option (or undefined for default value)
 * @param {boolean} loopback - IP_MULTICAST_LOOP option (or undefined for default value)
 */
function multicastOpenSocket(ttl, loopback) {
  var fd = NSPR.sockets.PR_OpenUDPSocket(NSPR.sockets.PR_AF_INET);

  // Set the TTL for the send. Default 1 (local network).
  if (ttl && ttl>0) {
    var opt = new NSPR.types.PRSocketOptionData();
    opt.option = NSPR.sockets.PR_SockOpt_McastTimeToLive;
    opt.value = ttl;
    if (NSPR.sockets.PR_SetSocketOption(fd, opt.address()) == NSPR.sockets.PR_FAILURE) {
      Closesocket(socketid);
      return {error: "Failed : SetSocketOption IP_MULTICAST_TTL := " +
              NSPR.errors.PR_GetError() + " :: " + 
	      NSPR.errors.PR_GetOSError() + " :: " + opt.address()};
    }
  }
  
  // Set the TTL for the send.
  if (loopback!==undefined) {
    var opt = new NSPR.types.PRSocketOptionData();
    opt.option = NSPR.sockets.PR_SockOpt_McastLoopback;
    opt.value = (loopback ? 1: 0);
    if (NSPR.sockets.PR_SetSocketOption(fd, opt.address()) == NSPR.sockets.PR_FAILURE) {
      Closesocket(socketid);
      return {error: "Failed : SetSocketOption IP_MULTICAST_LOOP := " +
              NSPR.errors.PR_GetError() + " :: " + 
	      NSPR.errors.PR_GetOSError() + " :: " + opt.address()};
    }
  }
  
  util.registerSocket(fd);
  return {};
}

/**
 * Bind a multicast socket to port and multicast group.
 *
 * @param {number} socketid - The socket.
 * @param {string} ip - The multicast group IP.
 * @param {number} port - The port.
 */
function multicastBind(socketid, ip, port) {
  var fd = util.getRegisteredSocket(socketid);

  // Allow reuse to allow multiple processes to listen on the same group:port
  var opt = new NSPR.types.PRSocketOptionData();
  opt.option = NSPR.sockets.PR_SockOpt_Reuseaddr;
  opt.value = NSPR.sockets.PR_TRUE;
  if (NSPR.sockets.PR_SetSocketOption(fd, opt.address()) != 0) {
    Closesocket(socketid);
    return {error: "Failed : SetSocketOption IP_REUSE_ADDRESS := " +
            NSPR.errors.PR_GetError() + " :: " + 
	    NSPR.errors.PR_GetOSError() + " :: " + opt.address()};
  }

  // Bind to *:port
  var addr = new NSPR.types.PRNetAddr();
  NSPR.sockets.PR_SetNetAddr(NSPR.sockets.PR_IpAddrAny, NSPR.sockets.PR_AF_INET, 
			     port, addr.address());
  if (NSPR.sockets.PR_Bind(fd, addr.address()) != 0) {
    Closesocket(socketid);
    return {error: "Error binding : code = " + NSPR.errors.PR_GetError()};
  }

  function createIGMPRequest(ip) {
    var maddr = new NSPR.types.PRMcastRequest();
	
    maddr.mcaddr = new NSPR.types.PRNetAddr();
    maddr.mcaddr.ip = NSPR.util.StringToNetAddr(ip);
    NSPR.sockets.PR_SetNetAddr(NSPR.sockets.PR_IpAddrNull, NSPR.sockets.PR_AF_INET, 0, maddr.mcaddr.address());
	
    maddr.setInterfaceIpAddrAny();
    //maddr.ifadder = new NSPR.types.PRNetAddr();
    //NSPR.sockets.PR_SetNetAddr(NSPR.sockets.PR_IpAddrAny, NSPR.sockets.PR_AF_INET, 0, maddr.ifaddr.address());

    return maddr;
  }

  // Construct an IGMP join request structure.
  var req = createIGMPRequest(ip);

  // Send an ADD MEMBERSHIP message via setsockopt.
  opt = new NSPR.types.PRMulticastSocketOptionData();
  opt.option = NSPR.sockets.PR_SockOpt_AddMember;
  opt.value = req;
  if (NSPR.sockets.PR_SetMulticastSocketOption(fd, opt.address()) == NSPR.sockets.PR_FAILURE) {
    Closesocket(socketid);
    return {error: "Failed : SetSocketOption ADD MEMBERSHIP := " +
            NSPR.errors.PR_GetError() + " :: " + 
	    NSPR.errors.PR_GetOSError() + " :: " + opt.address()};
  }

  return {};
}
