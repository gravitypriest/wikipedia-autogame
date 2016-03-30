// imports
var request = require('request');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var _ = require('lodash');
var argv = require('minimist')(process.argv.slice(2));
var config = require('./config');

// constants
var WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
var RAND_PARAMS = {
    'action':'query',
    'list':'random',
    'rnlimit':1,
    'rnnamespace':0,
    'rawcontinue':1,
    'format':'json'
};

// globals
var db;
var dbUrl = config.dbUrl;
var dbName = config.dbName;
var dbColl = config.dbColl;
var destination = config.destination;
var destAlt = config.destAlt;
var maxDepth = config.maxDepth;
var seenPages = [];
var pageQueue = [];
var depth = 0;
var found_hitler = false;
var startPage = argv['start'];

// add a path to db
var insertIntoDatabase = function(path, callback) {
    var listToAdd = [];
    for (var a in path) {
        var p = path.slice(a, path.length);
        var obj = {'start':p[0],
                   'path':p,
                   'rank':p.length-1};
        listToAdd.push(obj);
    }
    if (db.serverConfig.isConnected()) {
        db.collection(dbColl).insert(listToAdd, function(err, result) {
            callback();
        });
    } else {
        callback();
    }
};

var printResults = function(results) {
    process.stdout.write(JSON.stringify(results))
};

var depthComplete = function() {
    // all links of a depth gathered, check DB
    var solved_path;
    var bottomLvlLinks = pageQueue[depth+1].map(function(m) {
        return m[m.length-1];
    });
    db.collection(dbColl).find({'start': {$in: bottomLvlLinks}})
                         .sort({'rank': 1})
                         .toArray(function(err, results) {
        if (results && results.length > 0) {
            found_hitler = true;
            // get the found path (path we found by GETs)
            var idx = bottomLvlLinks.indexOf(results[0].start);
            var foundPath = pageQueue[depth+1][idx];
            // remove the last element since it's how the DB entry starts
            foundPath.pop();
            // add the two paths together
            solved_path = foundPath.concat(results[0].path);
            // save the newly found path              
            insertIntoDatabase(solved_path, function() {
                if (db.serverConfig.isConnected()) {
                    printResults(solved_path);
                    db.close();
                }
                process.exit();
            });
        } else {
            depth++;
            var nextPath = pageQueue[depth][0]
            var nextTitle = nextPath[nextPath.length-1];
            getLinks(nextTitle, nextPath, false);
        }
    });
};

var buildParams = function(title) {
    return {
        'action':'parse',
        'page':title,
        'prop':'links',
        'format':'json',
        'redirects':'true'
    };
};

// parse title from returned object
var parseTitle = function(obj) {
    if (obj.error && obj.error.code === 'missingtitle') {
        return false;
    }
    return obj.parse.title;
};

// parse links from returned object
var parseLinks = function(obj) {
    var namespace = 0;
    links_raw = obj.parse.links;
    links = links_raw.filter(function(f) {
        return (f['ns'] === namespace && f['exists'] !== undefined);
    }).map(function(m){
        return m['*'];
    });

    return links;
};

var launch = function() {
    if (startPage) {
        getLinks(startPage, [], true);
    } else {
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            var title = obj.query.random[0].title;
            getLinks(title, [], true);
        });
    }
};

var getStartingPage = function(title) {
    if (title) {
        // start page was specified
        launch(title, [], true);
    } else {
        // get random page
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            title = obj.query.random[0].title;
            launch(title, [], true);
        });
    }
};

var getLinks = function(title, inPath, isFirstPage) {
    request.get({url:WIKIPEDIA_API_URL,
                 qs:buildParams(title),
                 timeout:5000,
                 headers: {
                'User-Agent': 'Trumpedia (http://trumpedia.net)'}},
             function(error, response, body) {
        if (!error && response.statusCode == 200) {
            jsonData = JSON.parse(body);
            var new_path = inPath.slice();
            if (isFirstPage) {
                // title could have underscores or improper capitalization, so get it from api data
                title = parseTitle(jsonData);
                seenPages.push(title);
                pageQueue[0] = [title];
                new_path.push(title);
            }
            // check if we were given our destination
            if (title === destination || title === destAlt) {                
                if (db.serverConfig.isConnected()) {
                    printResults([destination]);
                    db.close();
                }
                process.exit();
            }

            if (!title) {
                // page doesn't exist
                process.stdout.write('[\"NO_EXIST_ERROR\"]');
                if (db.serverConfig.isConnected()) {
                    db.close();
                }
                process.exit();
            }

            var links = parseLinks(jsonData);
            // check for our destination first
            if (links.indexOf(destination) > -1 || links.indexOf(destAlt) > -1) {
                new_path.push(destination);
                found_hitler = true;
                insertIntoDatabase(new_path, function() {
                    if (db.serverConfig.isConnected()) {
                        printResults(new_path);    
                        db.close();
                    }
                    process.exit();
                });
                return;
            }

            if (links.length === 0) {
                if (depth === 0) {
                    process.stdout.write('[\"DEAD_END_ERROR\"]');
                    if (db.serverConfig.isConnected()) {
                        db.close();
                    }
                    process.exit();
                }
                return;
            }

            // it's not in this page, prepare next depth
            if (depth < maxDepth) {
                // initialize next depth
                if (!pageQueue[depth + 1]) {
                    pageQueue[depth + 1] = [];
                }
                for (var l in links) {
                    // add to the next depth queue if not already there
                    if (pageQueue[depth + 1].indexOf(links[l]) === -1 &&
                        seenPages.indexOf(links[l]) === -1) {
                        // copy incoming path --> [A, B]
                        var link_path = new_path.slice();
                        // add link to path   --> [A, B, C]
                        link_path.push(links[l]);
                        // add path to queue
                        pageQueue[depth + 1].push(link_path);
                        seenPages.push(links[l]);
                    }
                }
                // pop the current page from queue
                pageQueue[depth].splice(0, 1);
                if (pageQueue[depth].length === 0) {
                    // reached the end of this depth
                    depthComplete();
                } else {
                    var nextPath = pageQueue[depth][0]
                    var nextTitle = nextPath[nextPath.length-1];
                    getLinks(nextTitle, nextPath, false);
                }
            }
        }
    });
};

var main = function() {
    MongoClient.connect(dbUrl, function(err, _db) {
        assert.equal(null, err);
        if (err) {
            process.stdout.write('[\"DB_ERROR\"]')
            process.exit();
        }
        db = _db;
        db.collection(dbColl).ensureIndex({'start': 1}, {'unique': true});
        launch();
    });
};

if(require.main === module) {
    main();
};