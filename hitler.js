/*------ Imports ------*/
var request = require('request');
var argv = require('minimist')(process.argv.slice(2));
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

/*------ Constants ------*/
// openshift DB vars
var OPENSHIFT_MONGODB_DB_HOST = process.env.OPENSHIFT_MONGODB_DB_HOST;
var OPENSHIFT_MONGODB_DB_PORT = process.env.OPENSHIFT_MONGODB_DB_PORT;

// wikipedia stuff
var WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
var RAND_PARAMS = {
    'action':'query',
    'list':'random',
    'rnlimit':1,
    'rnnamespace':0,
    'rawcontinue':1,
    'format':'json'
};

var DESTINATIONS = {
    'hitler': {
        'destination': 'Adolf Hitler',
        'dest_alt': 'Hitler',
        //'dest_regex': '(?:(?:adolf)*[_\\ ]+)*hitler',
        'db_name':'hitler_paths'
    },
    'jesus': {
        'destination': 'Jesus',
        'dest_alt': 'Jesus Christ',
        //'dest_regex': 'jesus(?:[_\\ ]+(?:christ)*)*',
        'db_name':'jesus_paths'
    }
};

/*------ Globals ------*/
// load arguments, parse destination data
var start_page = argv['start'];
var mode = argv['mode'] !== undefined ? argv['mode'] : 'json';
var max_depth = (argv['depth'] !== undefined)
             && (typeof argv['depth'] === 'number')
             && (argv['depth'] % 1 === 0) ? argv['depth'] : 4;
var dest = argv['dest'] !== undefined ? argv['dest'].toLowerCase() : 'hitler';

if (DESTINATIONS[dest] === undefined) {
    process.stdout.write('[\"BAD_DEST_ERROR\"]');
    process.exit();
}
var destination = DESTINATIONS[dest]['destination'];
var dest_alt = DESTINATIONS[dest]['dest_alt'];
// var dest_regex = new RegExp(DESTINATIONS[dest]['dest_regex'], 'i');
var db_coll = DESTINATIONS[dest]['db_name'];

// var db_url = 'mongodb://localhost:27017/dutabus';

// var db_url = 'mongodb://admin:DBRmN8X4gxFN@' + OPENSHIFT_MONGODB_DB_HOST + ':' + OPENSHIFT_MONGODB_DB_PORT + '/hitlerpedia';
var db_url = 'mongodb://admin:icCmxr6TMtgV@' + OPENSHIFT_MONGODB_DB_HOST + ':' + OPENSHIFT_MONGODB_DB_PORT + '/jesuspedia';

var visitedPages = [];
var found_hitler = false;

/* ---------------------------------------------------
*   insert a path and its sub-paths into the database
*  --------------------------------------------------*/
var insertIntoDatabase = function(path, db, callback) {
    var listToAdd = [];
    for (var a in path) {
        var p = path.slice(a, path.length);
        var obj = {'start':p[0],
                   'path':p};
        listToAdd.push(obj);
    }
    db.collection(db_coll).insert(listToAdd, function(err, result) {
        if (err && err['code'] !== 11000) {
            // ignore duplicate keys
            assert.equal(err,null);
        }
        callback(result);
    });
};

/* ---------------------------------------------------
*   start the first link fetch
*  --------------------------------------------------*/
var launch = function(title, db, customTitle) {
    if (mode === 'cmdline') {
        console.log('Starting page is: ' + title);
        console.log('Thinking...');
    }
    visitedPages.push(title);
    getLinks(title, max_depth, [], customTitle, db);
};

/* ---------------------------------------------------
*   get a random page if none was specified, then
*   go to launch()
*  --------------------------------------------------*/
var getStartingPage = function(title, db) {
    if (title) {
        launch(title, db, true);
    } else {
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            title = obj.query.random[0].title;
            launch(title, db, false);
        });
    }
};

/* ---------------------------------------------------
*   build the parameter object for fetching links
*  --------------------------------------------------*/
var buildParams = function(title) {
    return {
        'action':'parse',
        'page':title,
        'prop':'links',
        'format':'json',
        'redirects':'true'
    };
};

/* ---------------------------------------------------
*   parse title from returned object
*  --------------------------------------------------*/
var parseTitle = function(obj) {
    if (obj.error && obj.error.code === 'missingtitle') {
        return false;
    }
    return obj.parse.title;
};

/* ---------------------------------------------------
*   parse links from returned object
*   if redirect_check==true, detect whether the
*   link is a redirect, then return true/false
*  --------------------------------------------------*/
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

/* ---------------------------------------------------
*   print path array to stdout
*  --------------------------------------------------*/
var printResults = function(results) {
    if (mode === 'cmdline') {
        res_str = '(START) ';
        for (var i in results) {
            if (i > 0 && i < (results.length)) {
                res_str = res_str + ' --' + i + '--> ';
            }
            res_str = res_str + results[i];
        }
        res_str = res_str + ' (FINISH)';
        console.log('HITLER FOUND!')
        console.log('=============================================');
        console.log(res_str);
        console.log('---------------------------------------------');
        console.log('Found in ' + (results.length-1) + ' step(s).');
        console.log('=============================================');
    }
    if (mode === 'json') {
        process.stdout.write(JSON.stringify(results))
    }
};

/* ---------------------------------------------------
*   this is where the magic happens
*   given a title, find all the links on the 
*   wikipedia page that belongs to that title
*   --> recursively calls itself with the links on
*       each page until it finds the destination
*  --------------------------------------------------*/
var getLinks = function(title, depth, path, customTitle, db) {
    // get wikipedia on the phone
    request.get({url:WIKIPEDIA_API_URL, qs:buildParams(title)}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            jsonData = JSON.parse(body);

            if (customTitle) {
                // title could have underscores or improper capitalization, so get it from api data
                var fixed_title = parseTitle(jsonData);
                // fix 'visited' array too
                visitedPages[visitedPages.indexOf(title)] = fixed_title;
            } else {
                var fixed_title = title;
            }

            // check if we were given our destination
            if (fixed_title === destination) {
                printResults([destination]);
                db.close();
                process.exit();
            }

            if (!fixed_title) {
                // page doesn't exist
                if (mode === 'cmdline') {
                    console.log('ERROR: Page \"' + title + '\" does not exist');
                }
                if (mode === 'json') {
                    process.stdout.write('[\"NO_EXIST_ERROR\"]');
                }
                process.exit();
            }

            // copy the incoming path arg
            var new_path = path.slice();
            new_path.push(fixed_title);

            // get them links
            links = parseLinks(jsonData);
            // add the current page to links for db searching -- won't affect
            //  getLinks() since it checks against the 'visited' list
            links.push(fixed_title);

            // check for our destination first
            if (links.indexOf(destination) !== -1 || links.indexOf(dest_alt) !== -1) {
                new_path.push(destination);
                found_hitler = true;
                printResults(new_path);
                insertIntoDatabase(new_path, db, function() {
                    db.close();
                    process.exit();
                });
            }

            // if we start on a dead end page (no links), abort
            if (links.length === 0) {
                if (depth === max_depth) {
                    process.stdout.write('[\"DEAD_END_ERROR\"]');
                    db.close();
                    process.exit();
                }
                return;
            }

            // check the links on this page against the db
            db.collection(db_coll).find({'start': {$in: links}}, function (err, cursor) {
                cursor.toArray(function(err, results) {
                    // make sure we don't beat the regular path here, check for found flag
                    //  otherwise may get dupe output
                    if (results && results.length > 0 && !found_hitler) {
                        
                        // copy the incoming path arg
                        var new_path_db = path.slice();
                        // add the current page
                        new_path_db.push(fixed_title);
                        
                        // check for links 1 step away from destination (path length 2)
                        for (var r in results) {
                            if (results[r]['start'] === fixed_title && new_path_db.length === 1) {
                                // we're on the first page, and we found a saved path
                                var bingo_path = results[r]['path'];
                                break;
                            } else if (results[r]['path'].length === 2) {
                                // what we want is on the next page, so let's take this
                                var last_path = results[r]['path'];
                            }
                        }
                        
                        if (bingo_path) {
                            // our path is in the DB, let's roll
                            new_path_db = bingo_path;
                        }
                        if (last_path && !bingo_path) {
                            // add where we are to the 1-stepper
                            new_path_db = new_path_db.concat(last_path);
                        }       
                        if (bingo_path || last_path) {
                            // we have stuff in the DB, git r dun          
                            printResults(new_path_db);
                            insertIntoDatabase(new_path_db, db, function() {
                                db.close();
                                process.exit();
                            });
                        }
                    }
                });
            });

            // go through the links on the page
            for (var l in links) {
                if (depth > 0) {
                    if (visitedPages.indexOf(links[l]) === -1 && !found_hitler) {
                        // add to the 'visited' array early to avoid waiting for the req
                        //  to finish before adding, avoid dupes
                        visitedPages.push(links[l]);
                        getLinks(links[l], depth-1, new_path, customTitle, db);
                    }
                } else {
                    if (mode === 'cmdline') {
                        console.log('ERROR: Maximum depth exceeded (Max depth = ' + max_depth + ')');
                    }
                    if (mode === 'json') {
                        process.stdout.write('[\"MAX_DEPTH_ERROR\"]');
                    }
                    db.close();
                    process.exit();
                }
            } 
        }  
    });
};

var main = function() {
    if (mode !== 'cmdline' && mode !== 'json') {
        process.stdout.write('BAD_MODE_ERROR');
        process.exit();
    }
    if (start_page) {
        ('Start page specified!');
    }
    MongoClient.connect(db_url, function(err, db) {
        assert.equal(null, err);
        if (err) {
            process.stdout.write('[\"DB_ERROR\"]')
            process.exit();
        }
        db.collection(db_coll).ensureIndex({'start': 1}, {'unique': true});
        getStartingPage(start_page, db);
    });
};

if(require.main === module) {
    main();
};


