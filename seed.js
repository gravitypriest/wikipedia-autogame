// imports
var path_ = require('path');
var request = require('request');
var assert = require('assert');
var _ = require('lodash');
var config = require(path_.join(__dirname, 'config.json'));
var db = require(path_.join(__dirname, 'model'));
var Path = db['path'];
var sleep = require('sleep');

// constants
var WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// globals
var startPage = config.server[config.selected].destination;;
var currentDepth = 0;
var maxDepth = config.max_depth;
var seenPages = [];
var pageQueue = [];
var retries = 0;
var startTime = new Date().getTime();

// build the request parameters
var buildParams = function(title, lhcontinue) {
    return {
        'action':'query',
        'titles':title,
        'prop':'linkshere',
        'format':'json',
        'lhprop':'title',
        'lhlimit':5000,
        'lhnamespace':0,
        'lhshow':'!redirect',
        'lhcontinue':lhcontinue
    };
};

var removeFromQueue = function(title) {
    // remove page from queue for current depth
    var idx = pageQueue[currentDepth].indexOf(title); // should be 0
    pageQueue[currentDepth].splice(idx, 1);
};

// add links to DB
var insertIntoDatabase = function(links, title, callback) {
    // look if the title has already been added
    var listToAdd = [];
    var basePath = [];

    Path.findOne({where: {start: title}, raw: true}).then(function(result) {
        if (result && result.path) {
            basePath = JSON.parse(result.path);
        }
        for (var p in links) {
            var obj = {start: links[p],
                       path: JSON.stringify([links[p]].concat(basePath)),
                       rank: basePath.length};
            listToAdd.push(obj);
        }
        Path.bulkCreate(listToAdd, {ignoreDuplicates: true}).then(function() {
            callback();
        });
    });
};

// parse the 'links here' out of the response
var parseLinks = function(obj) {
    var namespace = 0;
    links_raw = obj.query.pages[Object.keys(obj.query.pages)[0]].linkshere;
    if (links_raw) {
        links = links_raw.filter(function(f) {
            return (f['ns'] === namespace);
        }).map(function(m){
            return m['title'];
        });

        return links;
    } else return null;
};

// fired when all of the 'links here' have been found for a page
var pageComplete = function(title) {
    removeFromQueue(title);
    if (pageQueue[currentDepth].length % 10 === 0 ||
        pageQueue[currentDepth].length < 10) {
        console.log("Pages left at depth %s: %s", currentDepth, pageQueue[currentDepth].length);
    }
    if (pageQueue[currentDepth].length % 500 === 0) {
        console.log('Elapsed: %s', (new Date().getTime() - startTime) / 1000);
        console.log('Stand by...');
        sleep.sleep(10);
    }
    if (pageQueue[currentDepth].length === 0) {
        depthComplete();
    } else {
        getLinksHere(pageQueue[currentDepth][0], 0);
    }
};

// fired when all pages have been found for one depth level
var depthComplete = function() {
    // go to next depth level
    currentDepth++;
    kickstartSeed();
};

// get the 'links here' from a page
var getLinksHere = function(title, _lhcontinue) {
    request.get({url:WIKIPEDIA_API_URL,
                 qs:buildParams(title, _lhcontinue),
                 timeout:5000,
                 headers: {
                'User-Agent': 'Trumpedia Seedbot (http://trumpedia.net)'
  }}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            retries = 0;
            var lhcontinue = '';
            var batchcomplete = false;
            var obj = JSON.parse(body);
            if (obj.continue) {
                lhcontinue = obj.continue.lhcontinue;
            }
            if (obj.batchcomplete !== undefined) {
                batchcomplete = true;
            }
            var linkshere = parseLinks(obj);

            // abort for pages with no links to them
            if (!linkshere) {
                console.log('No links to %s. Skipping...', title);
                pageComplete(title);
                return;
            }

            // don't bother with pages we've seen
            linkshere = _.difference(linkshere, seenPages);
            if (linkshere.length === 0) {
                console.log('No NEW links to %s. Skipping...', title);
                pageComplete(title);
                return;
            }

            // don't add to next if the next level is max
            if (currentDepth + 1 < maxDepth) {

                // initialize next depth so we can add pages to it
                if (!pageQueue[currentDepth + 1]) {
                    pageQueue[currentDepth + 1] = [];
                }

                // add found links to next depth
                pageQueue[currentDepth + 1] = _.union(
                    pageQueue[currentDepth + 1], linkshere);
            }

            // add found links to total seen pages
            seenPages = _.union(seenPages, linkshere);

            //console.log('Got LH values ' + _lhcontinue + ' to ' + lhcontinue + ' for page ' + title);
            console.log('Got %s links to %s', linkshere.length, title);
            if (lhcontinue) {
                // more links for this page, insert and continue
                insertIntoDatabase(linkshere, title, function() {
                    getLinksHere(title, lhcontinue);
                });
            } else if (batchcomplete) {
                console.log('FINISHED: %s', title);
                // this page is finished, insert and go to next
                insertIntoDatabase(linkshere, title, function() {
                    pageComplete(title);
                });
            }
        } else {
            // something borked, try again
            console.log('Request went tits up for title %s and lh %s', title, _lhcontinue);
            console.log('Stand by...');
            setTimeout(function() {            
                retries++;
                if (retries % 10 === 0) {
                    console.log('Retries: %s', retries);
                }
                getLinksHere(title, _lhcontinue);
            }, 5000);
        }
    });
};

// begin seeding
var kickstartSeed = function() {
    // start each depth of searches here
    console.log('Starting depth %d', currentDepth);
    if (currentDepth === maxDepth) {
        console.log('Max depth reached. Let\'s stop here for today.');
        db.sequelize.close();
        process.exit();
    }
    getLinksHere(pageQueue[currentDepth][0], 0);
};

var main = function() {
    console.log('Beginning seed...')
    db.sequelize
      .authenticate()
      .then(function(err) {
        db.sequelize.sync().then(function () {
            pageQueue[currentDepth] = [];
            pageQueue[currentDepth].push(startPage);
            // init with destination
            insertIntoDatabase([startPage], '', function(){
                // start seeding
                kickstartSeed();            
        });
      })
      .catch(function (err) {
        console.log(err);
        process.exit();
      });
  });
}

if(require.main === module) {
    main();
};