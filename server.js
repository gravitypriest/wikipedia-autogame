var child_process = require('child_process');
var url = require('url');
var express = require('express');

var app = express();

app.get('/', function(req, res) {
	full_path = '';
	args = [];
	query = url.parse(req.url, true).query

	if (query['start']) {
		args.push('--start');
		args.push(query['start']);
	}

	if (query['depth']) {
		args.push('--depth')
		args.push(query['depth']);
	}

	find = child_process.fork('hitler.js', args, {silent:true});
	find.stdout.on('data', function(d){
		console.log(d.toString());
		res.status(200).end(d);
	});
});

app.listen(8080);
console.log('Server listening on port 8080');