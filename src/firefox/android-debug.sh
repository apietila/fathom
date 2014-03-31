#!/bin/sh

# setup tunnels for debugging on android
adb forward --remove-all

# remote extension installer
#adb forward tcp:8887 tcp:8887

# remote javascript debugger
adb forward tcp:6000 tcp:6000
