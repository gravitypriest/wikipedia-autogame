// seed 1-step and 2-step pages for the DB

var request = require('request');
var argv = require('minimist')(process.argv.slice(2));
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var events = require('events');

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
        'db_name':'hitlerpedia',
        'db_coll':'hitler_paths',
        'db_cred':''
    },
    'jesus': {
        'destination': 'Jesus',
        'dest_alt': 'Jesus Christ',
        'db_name':'jesuspedia',
        'db_coll':'jesus_paths',
        'db_cred':''
    }
};

var dest = argv['dest'] !== undefined ? argv['dest'].toLowerCase() : 'hitler';

if (DESTINATIONS[dest] === undefined) {
    process.stdout.write('[\"BAD_DEST_ERROR\"]');
    process.exit();
}
var destination = DESTINATIONS[dest]['destination'];
var dest_alt = DESTINATIONS[dest]['dest_alt'];
var db_name = DESTINATIONS[dest]['db_name'];
var db_coll = DESTINATIONS[dest]['db_coll'];
var db_cred = DESTINATIONS[dest]['db_cred'];

// dev
var db_url = 'mongodb://localhost:27017/dutabus';
// prod
// var db_url = 'mongodb://' + db_cred + '@' + OPENSHIFT_MONGODB_DB_HOST + ':' + OPENSHIFT_MONGODB_DB_PORT + '/' + db_name;

var pagesAtDepth = [];

var handler = new events.EventEmitter();

handler.on('seedfinished', function(db) {
	console.log('All incoming links gathered.  Exiting...');
	db.close();
	process.exit();
});

handler.on('depthcomplete', function(db, depth) {
	console.log('Depth level ' + depth + ' complete.');
	console.log('Beginning level ' + (depth+1) + '...');

});

handler.on('batchcomplete', function(db) {
	handler.emit('seedfinished', db);
});

handler.on('nextbatch', function(lhcontinue, batchcomplete, db, pathbatch, title, depth) {
	if (batchcomplete) {
		insertIntoDatabase(pathbatch, db, function() {
			handler.emit('batchcomplete', db);
		});
	} else {
		insertIntoDatabase(pathbatch, db, function() {
			getLinksHere(title, db, lhcontinue, depth)
		});
	}
});

var buildParams = function(title, lhcontinue) {
    return {
        'action':'query',
        'titles':title,
        'prop':'linkshere',
        'format':'json',
        'lhprop':'title',
        'lhlimit':500,
        'lhnamespace':0,
        'lhshow':'!redirect',
        'lhcontinue':lhcontinue
    };
};

var insertIntoDatabase = function(pathbatch, db, callback) {
    var listToAdd = [];
    for (var p in pathbatch) {
        var obj = {'start':pathbatch[p][0],
                   'path':pathbatch[p],
                   'rank':pathbatch[p].length-1};
        listToAdd.push(obj);
    }
    db.collection(db_coll).insert(listToAdd, function(err, result) {
        if (err && err['code'] !== 11000) {
            // ignore duplicate keys
            assert.equal(err, null);
        }
        callback(result);
    });
};

var parseLinks = function(obj) {
    var namespace = 0;
    links_raw = obj.query.pages[Object.keys(obj.query.pages)[0]].linkshere;
    links = links_raw.filter(function(f) {
        return (f['ns'] === namespace);
    }).map(function(m){
        return [m['title'], destination];
    });

    return links;
};

var getLinksHere = function(title, db, lhcontinue, depth) {
	request.get({url:WIKIPEDIA_API_URL, qs:buildParams(title, lhcontinue)}, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			var new_lh = '';
			var batchcomplete = false;
			obj = JSON.parse(body);
			if (obj.continue) {
				new_lh = obj.continue.lhcontinue;
			}
			if (obj.batchcomplete !== undefined) {
				batchcomplete = true;
			}
			var linkshere = parseLinks(obj);
			console.log('Got LH values ' + lhcontinue + ' to ' + new_lh + ' for page ' + title);
			handler.emit('nextbatch', new_lh, batchcomplete, db, linkshere, title, depth);
		}
	});
}

var seedDB = function(title, db, lhcontinue, depth) {
	if (depth > 1) {

	} else {
		getLinksHere(title, db, lhcontinue, depth);
	}
};

var main = function() {
	console.log('Seeding DB for level-1 and level-2 links to ' + destination)
    MongoClient.connect(db_url, function(err, db) {
        assert.equal(null, err);
        if (err) {
            console.log('Something went wrong')
            process.exit();
        }
        db.collection(db_coll).ensureIndex({'start': 1}, {'unique': true});
        // start seeding
        seedDB(destination, db, 0, 1);
    });
};

if(require.main === module) {
    main();
};




// seed DB

//https://en.wikipedia.org/w/api.php?action=query&titles=Adolf%20Hitler&prop=linkshere&lhprop=title&lhlimit=500&lhnamespace=0&lhshow=!redirect&lhcontinue=41907383

