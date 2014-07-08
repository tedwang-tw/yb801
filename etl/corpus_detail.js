var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");
var lineReader = require('line-reader');
var stopwords = require('./stopwords').words;

var CONCURRENCY = 2;
//var NORM_CONDS = 8; //	per actual job detail on web

var ext = '.txt'; //	null;	//	input file filter
var outExt = '.json';

var NEWLINE = '\r\n';

var inTopDir = 'text/104/job';
var outTopDir = 'corpus/104/job';

var basename_keyword = 'input/keywords_ch.txt';
var basename_keyword_en = 'input/keywords_en.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

var keywords = [];
var keywords_en = [];

var emitter = new events.EventEmitter();

function extractLastDir(file, isDir) {
	var parents;
	if (isDir)
		parents = file;
	else
		parents = path.dirname(file);
	var index = parents.match(/[\/\\]/);
	if (index != null) {
		parents = parents.split(index[0]);
		return parents[parents.length - 1];
	} else
		return null;
} //	extractLastDir

function isDate(tdate) {
	if (tdate.trim().length == 8) {
		var year = parseInt(tdate.slice(0, 4), 10);
		if (!isNaN(year)) {
			if (year > 1970)
				return true;
		}
	}
	return false;
}

function newDir(dir) {
	console.log("\nDestination: " + dir);
	if (!fs.existsSync(dir)) {
		console.log("Creating dir " + dir);
		mkdirp.sync(dir);

		if (!fs.existsSync(dir)) {
			process.stderr.write("Unable to create dir " + dir + "\n");
		}
	}
}

function getTimeStamp(msec) {
	var d = new Date(msec);

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	var curr_hour = d.getHours();
	var curr_min = d.getMinutes();
	var curr_sec = d.getSeconds();

	//return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + '_' + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
	/*	for d3.time.format('%Y%m%d%H%M%S')	*/
	return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
}

function getDateTime() {
	var d = new Date();

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	var curr_hour = d.getHours();
	var curr_min = d.getMinutes();
	var curr_sec = d.getSeconds();

	return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + '_' + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
	/*	for d3.time.format('%Y%m%d%H%M%S')	*/
	//return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
}

function getSentTime(sent) {
	/*
	"sent" : ["2014-03-30T12:03:24+08:00"],
	 */
	return (sent.slice(0, 4) + sent.slice(5, 7) + sent.slice(8, 10) + sent.slice(11, 13) + sent.slice(14, 16) + sent.slice(17, 19));
}

function getPreset() {
	if (fs.existsSync(filename_preset)) {
		presetList = JSON.parse(fs.readFileSync(filename_preset, 'utf8'));
		console.log('Read ' + filename_preset + ' ok.');
	} else { //	empty means count all
		presetList = {
			"day" : [],
			"cat" : []
		};
	}
	console.log(presetList);
}

function checkPresetCat(cat) {
	if (presetList.cat.length === 0)
		return true;
	else {
		return (presetList.cat.indexOf(cat) !== -1);
		/*
		for (var i = 0; i < presetList.cat.length; i++)
		if (cat == presetList.cat[i])
		return true;
		return false; //	no match
		 */
	}
}

function checkPresetDay(day) {
	if (presetList.day.length === 0)
		return true;
	else {
		return (presetList.day.indexOf(day) !== -1);
		/*
		for (var i = 0; i < presetList.day.length; i++)
		if (day == presetList.day[i])
		return true;
		return false; //	no match
		 */
	}
}

function subKeyword(list, pos, word) { //	check sub-string like
	for (var key in list) {
		if (key.length > word.length) {
			if (key.indexOf(word) !== -1) {
				//emitter.emit('log', '<' + key + '-' + word + '>');
				for (var i = 0; i < list[key].length; i++) {
					if (pos >= list[key][i][0] && pos <= list[key][i][1]) {
						//emitter.emit('log', '[' + list[key][i][0] + ',' + list[key][i][1] + ']');
						return true;
					}
				}
			}
		}
	}
	return false;
}

function tokenize(text) {
	var ignoreCase = true; // Case-sensitivity
	var REallowedChars = /[^a-zA-Z'\-\+\/&\.0-9]+/g; // RE pattern to select valid characters. Invalid characters are replaced with a whitespace

	// Remove all irrelevant characters
	text = text.replace(REallowedChars, " ").replace(/^\s+/, "").replace(/\s+$/, "");

	if (ignoreCase)
		text = text.toLowerCase();
	return text.split(/\s+/);
}

function nestIndexOf(list, arr, index) { //	search a short array from another long array
	var llen = list.length;
	var alen = arr.length;

	for (var i = index; i < llen; i++) {
		var isEqual = true;
		for (var j = 0; j < alen; j++) {
			if ((i + j < llen) && (arr[j] === list[i + j])) {
				continue;
			} else {
				isEqual = false;
				break;
			}
		}
		if (isEqual)
			return i;
	}

	return -1;
}

function scrapeContent(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(dir, task);
		var fileData = fs.readFileSync(file, 'utf8');
		var outFile = path.join(outDir, path.basename(file, ext) + outExt);
		var outText = [];
		var outIndices = {}; //	buffer indices for sub-string checking
		var index;

		//	Chinese
		keywords.forEach(function (word) { //	compare every keyword
			index = 0;
			//emitter.emit('log', NEWLINE + word + ':');
			while (index !== -1) { //	get all occurrences
				index = fileData.indexOf(word, index);
				if (index !== -1) {
					if (!subKeyword(outIndices, index, word)) {
						if (!outIndices[word])
							outIndices[word] = [];
						outIndices[word].push([index, index + word.length - 1]); //	record position for sub-string check
						outText.push(word); //	new matched keyword
					}
					//emitter.emit('log', index + ',');
					index += word.length;
				}
			}
		});

		//	English
		fileData = tokenize(fileData); //	convert to token array
		//emitter.emit('log', NEWLINE + file + ':');
		//console.log(fileData);

		keywords_en.forEach(function (word) { //	compare every keyword
			for (var iii=0; iii<word.length; iii++) {
				if (stopwords.indexOf(word[iii]) >= 0)
					return;	//	skip stop words
			}
				
			index = 0;
			//emitter.emit('log', NEWLINE + word + ':');
			while (index !== -1) { //	get all occurrences
				index = nestIndexOf(fileData, word, index);
				if (index !== -1) {
					if (!subKeyword(outIndices, index, word.join(""))) {
						if (!outIndices[word.join("")])
							outIndices[word.join("")] = [];
						outIndices[word.join("")].push([index, index + word.length - 1]); //	record position for later sub-string check

						outText.push(word.join(" ")); //	new matched keyword
					}
					//emitter.emit('log', index + ',');
					index += word.length;
				}
			}
		});
		
		var fd = fs.createWriteStream(outFile);
		fd.write(JSON.stringify(outText), function () {
			fd.end();
			done(null, 1); //	for count
		});
	});

} //	scrapeContent

function walkJobCat(dir, outDir, done) { //	per job category
	emitter.emit('log', '\n' + dir);

	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;

		function enQueue(que, srcArr, fillLen) {
			function workerCB(err) {
				if (err)
					emitter.emit('err', err, dir, outDir);
				else
					emitter.emit('log', 'o');
			}
			if (srcArr.length > 0) {
				for (var i = 0; i < fillLen; i++) {
					var item = srcArr.shift();
					if (item != null) {
						que.push(item, workerCB);
						emitter.emit('log', '.');
					} else
						break;
				}
			}
		}

		if (err)
			return done(err, 0);

		newDir(outDir);

		var listLen = list.length;

		var q = async.queue(function (task, taskCB) {
				scrapeContent(dir, outDir, task, function (err, count) {
					itemCounter += count;
					setImmediate(taskCB);
				});
			}, CONCURRENCY);

		q.drain = function () {
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' jobs/files processed.');
			done(null, itemCounter);
		};
		q.empty = function () {
			enQueue(q, list, CONCURRENCY);
		};

		enQueue(q, list, CONCURRENCY); //	trigger start
	});
} //	walkJobCat

function walkDaily(dir, outDir, done) { //	per day
	emitter.emit('log', '\n' + dir);

	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var catCount = 0;

		if (err)
			return done(err, 0);

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			if (!checkPresetCat(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					emitter.emit('doneDaily', NEWLINE + baseFolder);
					walkJobCat(folder, path.join(outDir, baseFolder), function (err, count) {
						itemCounter += count;
						catCount++;
						callback();
					});
				} else {
					callback();
				}
			});
		}, function (errAsync) {
			if (errAsync) {
				done(errAsync, 0);
			} else {
				emitter.emit('doneDaily', NEWLINE + 'Totally ' + catCount + '/' + list.length + ' categories processed.');
				done(null, itemCounter);
			}
		});
	});
} //	walkDaily

function walk(dir, outDir, done) {
	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var dayCount = 0;

		if (err)
			return done(err);

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			if (!checkPresetDay(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					emitter.emit('doneTop', NEWLINE + baseFolder);
					walkDaily(folder, path.join(outDir, baseFolder), function (err, count) {
						itemCounter += count;
						dayCount++;
						callback();
					});
				} else {
					callback();
				}
			});
		}, function (errAsync) {
			if (errAsync) {
				done(errAsync, 0);
			} else {
				emitter.emit('doneTop', NEWLINE + 'Totally ' + dayCount + '/' + list.length + ' days processed.');
				done(null, itemCounter);
			}
		});

		return;
	});
} //	walk

function readKeywords() {
	if (!fs.existsSync(basename_keyword)) {
		console.log('File "' + basename_keyword + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_keyword_en)) {
		console.log('File "' + basename_keyword_en + '" not found!');
		process.exit(1);
	}

	async.parallel({
		chinese: function(callback){
			// read all lines:
			lineReader.eachLine(basename_keyword, function (line) {
				if (line.trim().length > 0)
					keywords.push(line.trim());
			}).then(function () {
				keywords.sort(function (a, b) { //	sort as longest prefix match
					if (a.length < b.length)
						return -1;
					else if (a.length > b.length)
						return 1;
					else
						return a.localeCompare(b);
				}).reverse();

				callback(null, keywords.length);
			});
		},
		english: function(callback){
			// read all lines:
			lineReader.eachLine(basename_keyword_en, function (line) {
				if (line.trim().length > 0)
					keywords_en.push(line.trim().toLowerCase());
			}).then(function () {
				keywords_en.sort(function (a, b) { //	sort as longest prefix match
					if (a.length < b.length)
						return -1;
					else if (a.length > b.length)
						return 1;
					else
						return a.localeCompare(b);
				}).reverse();

				keywords_en = keywords_en.map(function (item) {
						return item.split(/\s+/);
					});

				callback(null, keywords_en.length);
			});
		}
	},
	function(err, results) {
		//console.log(keywords);
		//console.log(keywords_en);
		//process.exit();
		// results is now equals to: {one: 1, two: 2}
		emitter.emit('keyword', NEWLINE + 'Totally ' + results.chinese + ' Chinese keywords counted.' +
								NEWLINE + 'Totally ' + results.english + ' English keywords counted.');
	});
	
	/*
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
	*/
}

if (!fs.existsSync(inTopDir)) {
	console.log("Dir " + inTopDir + " not found!");
} else {
	var totalItems = 0;

	console.log('Source location: ' + inTopDir);
	console.log('Target location: ' + outTopDir);

	newDir(outTopDir);

	emitter.on('log', function (message) {
		process.stdout.write(message);
	});
	emitter.on('err', function (err, dir, outDir) {
		if (err) {
			var filename_err = path.join(outDir, basename_err);
			var fd_err = fs.createWriteStream(filename_err);
			fd_err.write(util.inspect(err));
			fd_err.end();
			console.log('\nerror: ' + util.inspect(err));
		}
	});
	emitter.on('doneJobCat', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);
	});
	emitter.on('doneDaily', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);
	});
	emitter.on('doneTop', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);
	});

	filename_status = path.join(outTopDir, basename_status);
	fs.appendFileSync(filename_status, getDateTime() + NEWLINE);

	getPreset();

	var timeA = new Date().getTime(),
	timeB;

	readKeywords();

	emitter.on('keyword', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);

		walk(inTopDir, outTopDir, function (err, results) {
			timeB = new Date().getTime();

			if (err) {
				console.err(util.inspect(err));
			}

			if (results) {
				totalItems += results;
				process.stdout.write('\nTotally ' + totalItems + ' courses processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' courses processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
			}
		});
	});
}
