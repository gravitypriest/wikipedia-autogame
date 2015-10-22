var child_process = require('child_process');
var http = require('http');
var url = require('url');

var get = function(request, response) {
	full_path = '';
	args = [];
	query = url.parse(request.url, true).query
	if (query['start']) {
		args.push('--start');
		args.push(query['start']);
	}
	find = child_process.fork('hitler.js', args, {silent:true});
	find.stdout.on('data', function(d){
		console.log(d.toString());
		response.end(d);
	});
}

var server = http.createServer(get);

server.listen(8080, function() {
	console.log('Server listening on port 8080');
});