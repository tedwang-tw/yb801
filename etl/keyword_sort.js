var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
//var sprintf = require("sprintf-js").sprintf;
var async = require('async');
//var cheerio = require("cheerio");
var lineReader = require('line-reader');

var NEWLINE = '\r\n';

var basename_keyword = '';
var in_ext = '.txt';
var out_ext = '_sort.txt';
var filename_sort;
var keywords = [];

var emitter = new events.EventEmitter();

function readKeywords() {
	if (!fs.existsSync(basename_keyword)) {
		console.log('File "' + basename_keyword + '" not found!');
		process.exit(1);
	}

	var last = false;
	var count = 0;

	async.doWhilst(
		function (callback) {
		// read all lines:
		lineReader.eachLine(basename_keyword, function (line) {
			keywords.push(line.trim());
			count++;
		}).then(function () {
			last = true;
			callback();
		});
	},
		function () {
		return !last;
	},
		function (err) {
		keywords.sort(function (a, b) { //	sort as longest prefix match
			if (a.length < b.length)
				return -1;
			else if (a.length > b.length)
				return 1;
			else
				return a.localeCompare(b);
		}).reverse();
		//console.log(keywords);
		//process.exit();
		emitter.emit('keyword', NEWLINE + 'Totally ' + count + ' keywords counted.');
	});
}

emitter.on('keyword', function (message) {
	process.stdout.write(message);
	filename_sort = path.join('.', path.basename(basename_keyword, in_ext) + out_ext);

	process.stdout.write(NEWLINE + 'Write back sorted keywords to "' + filename_sort + '"..."');
	var fd = fs.createWriteStream(filename_sort);
	keywords.forEach(function (word) {
		if (word.trim().length > 0)
			fd.write(word + NEWLINE);
	});
	fd.end();
	process.stdout.write(NEWLINE + 'done.');
});

if (process.argv.length <= 2) {
	process.stderr.write("Please input source file name!\n");
	process.stderr.write('Usage:\t' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' source.txt');
	process.exit(1);
} else {
	basename_keyword = process.argv[2];
	if (!fs.existsSync(basename_keyword)) {
		process.stderr.write('File "' + basename_keyword + '" not found!');
		process.exit(1);
	}
}

readKeywords();
