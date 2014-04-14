#!/bin/bash

# Depends: npm install jsdoc
DOC=doc
rm -rf $DOC

FILES="System
Tools
Proto
Socket
"
mkdir .src
for file in $FILES; do
    cp "modules/$file.jsm" ".src/$file.js"
done
jsdoc -d $DOC .src/*.js 

rm -rf .src
