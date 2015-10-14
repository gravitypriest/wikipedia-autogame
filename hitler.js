var request = require('request');
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
var MAX_DEPTH = 3;

var visitedPages = [];

var launch = function(title) {
    console.log('Starting page is: ' + title);
    console.log('Thinking...');
    getLinks(title, MAX_DEPTH, []);
}

var getStartingPage = function(title) {
    if (title) {
        launch(title);
    }
    else {
        request.get({url:WIKIPEDIA_API_URL, qs:RAND_PARAMS}, function(error, response, body) {
            var obj = JSON.parse(body);
            title = obj.query.random[0].title;
            launch(title);
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
    obj = JSON.parse(body);
    if (obj.error && obj.error.code === 'missingtitle') {
        return false;
    }
    links_raw = obj.parse.links;
    links = links_raw.filter(function(f) {
        return (f['ns'] === 0 && f['exists'] !== undefined);
    }).map(function(m){
        return m['*'];
    });

    return links;
}

var printResults = function(results) {
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
    console.log('Found in ' + (new_path.length-1) + ' step(s).');
    console.log('=============================================');
};

var getLinks = function(title, depth, path) {
    request.get({url:WIKIPEDIA_API_URL, qs:buildParams(title)}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            visitedPages.push(title);
            new_path = path.slice();
            new_path.push(title);
            links = parseLinks(body);

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
                            getLinks(links[l], depth-1, new_path);
                        }
                    }
                }
            }

            else {
                console.log('ERROR: Page \"' + title + '\" does not exist');
                process.exit()
            }
        }  
    });
}

var main = function() {
    var startPage = process.argv.slice(2).join(' ')
    if (startPage) {
        ('Start page specified!');
    }
    getStartingPage(startPage);
}

if(require.main === module) {
    main();
}


