#!/usr/bin/env node
var ghpages = require('gh-pages');
var path = require('path');

ghpages.publish(path.join(__dirname, 'htdocs'), {push:false});
