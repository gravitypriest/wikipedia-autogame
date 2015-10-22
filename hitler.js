var request = require('request');
var argv = require('minimist')(process.argv.slice(2));

var WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
var RAND_PARAMS = {
    'action':'query',
    'list':'random',
    'rnlimit':1,
    'rnnamespace':0,
    'rawcontinue':1,
    'format':'json'
};
var FOUND_HITLER = false;
var DESTINATION = 'Adolf Hitler';
var MAX_DEPTH = 4;

var start_page = argv['start'];
var mode = argv['mode'] !== undefined ? argv['mode'] : 'json';
var visitedPages = [];

var launch = function(title, customTitle) {
    //console.log(title)
    if (mode === 'cmdline') {
        console.log('Starting page is: ' + title);
        console.log('Thinking...');
    }
    visitedPages.push(title);
    // if we get the ending page as the start page... well we're done aren't we?
    if (title === DESTINATION) {
        printResults([title]);
        process.exit();
    }
    getLinks(title, MAX_DEPTH, [], customTitle);
};

var getStartingPage = function(title) {
    if (title) {
        launch(title, true);
    } else {
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            title = obj.query.random[0].title;
            launch(title, false);
        });
    }
};

var buildParams = function(title) {
    return {
        'action':'parse',
        'page':title,
        'prop':'links',
        'format':'json'
    };
};

var parseLinks = function(body) {
    var namespace = 0;
    obj = JSON.parse(body);
    if (obj.error && obj.error.code === 'missingtitle') {
        return false;
    }
    links_raw = obj.parse.links;
    links = links_raw.filter(function(f) {
        return (f['ns'] === namespace && f['exists'] !== undefined);
    }).map(function(m){
        return m['*'];
    });

    return links;
};

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

var getLinks = function(title, depth, path, customTitle) {
    request.get({url:WIKIPEDIA_API_URL, qs:buildParams(title)}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            new_path = path.slice();
            new_path.push(title);
            if (new_path.length === 2 && new_path[0].toUpperCase() === new_path[1].toUpperCase() && customTitle) {
                // avoid counting capitalization redirect for user-specified page as a step
                new_path = new_path.slice(1);
            } else {
                links = parseLinks(body, false);
            }
            
            if (links) {
                if (links.indexOf(DESTINATION) !== -1) {
                    new_path.push(DESTINATION);
                    FOUND_HITLER = true;
                    printResults(new_path);
                    process.exit();
                }

                for (var l in links) {
                    if (depth > 0) {
                        if (visitedPages.indexOf(links[l]) === -1 && !FOUND_HITLER) {
                            // add to the 'visited' array early to avoid waiting for the req
                            //  to finish before adding, avoid dupes
                            visitedPages.push(links[l]);
                            getLinks(links[l], depth-1, new_path, customTitle);
                        }
                    } else {
                        if (mode === 'cmdline') {
                            console.log('ERROR: Maximum depth exceeded (Max depth = ' + MAX_DEPTH + ')')
                        }
                        if (mode === 'json') {
                            process.stdout.write('MAX_DEPTH_ERROR');
                        }
                        process.exit()
                    }
                }
            } else {
                if (mode === 'cmdline') {
                    console.log('ERROR: Page \"' + title + '\" does not exist');
                }
                if (mode === 'json') {
                    process.stdout.write('NO_EXIST_ERROR');
                }
                process.exit();
            }
        }  
    });
};

var main = function() {
    if (mode !== 'cmdline' && mode !== 'json') {
        process.stdout.write('ERROR: invalid --mode specified\n');
        process.exit();
    }
    if (start_page) {
        ('Start page specified!');
    }
    getStartingPage(start_page);
};

if(require.main === module) {
    main();
};


