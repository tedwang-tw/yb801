var fs = require('fs');
var path = require('path');

var WordFreq = require('wordfreq');

// Create an options object for initialization
var options = {
	workerUrl : 'wordfreq/src/wordfreq.worker.js',
	maxiumPhraseLength : 10,
	languages : ['chinese']
};

var NEWLINE = '\r\n';
var filename_src = '';
var timeA, timeB;

function stringifyList(list) {
	list.forEach(function (pair) {
		process.stdout.write(pair[0] + ' : ' + pair[1] + NEWLINE);
	});
}

if (process.argv.length <= 2) {
	process.stderr.write("Please input source file name!\n");
	process.stderr.write('Usage:\t' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' source.txt');
	process.exit(1);
} else {
	filename_src = process.argv[2];
	if (!fs.existsSync(filename_src)) {
		process.stderr.write('File "' + filename_src + '" not found!');
		process.exit(1);
	}
}

timeA = new Date().getTime();

var text = fs.readFileSync(filename_src, 'utf8');
process.stderr.write('File "' + filename_src + '" read ok.\nProcessing...');
//var text = fs.readFileSync('inputs.txt', 'utf-8');

// Initialize and run process() function

var wordfreq = WordFreq(options).process(text, function (list) {
		// console.log the list returned in this callback.
		console.log(list);
	});

timeB = new Date().getTime();

process.stderr.write('\tDone.');
//console.log(wordfreq);
stringifyList(wordfreq);
process.stderr.write('\nElapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
