var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");
var lineReader = require('line-reader');

var CONCURRENCY = 2;
//var NORM_CONDS = 8; //	per actual job detail on web

var ext = '.json'; //	null;	//	input file filter
var outExt = '.txt';

var NEWLINE = '\r\n';

var inTopDir = 'synonym/104/job';
var outTopDir = 'corpus_merge/104/job';
var cat_resume = 'resume';

var basename_keyword = 'keywords_merge.txt';
var basename_keyword_resume = 'keywords_merge_resume.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

var keywords = {};

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
	//console.log("\nDestination: " + dir);
	if (!fs.existsSync(dir)) {
		console.log("\nCreating dir " + dir);
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

function scrapeContent(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(dir, task);
		var fileData = JSON.parse(fs.readFileSync(file, 'utf8'));

		fileData.forEach(function (word) {
			keywords[word] = (keywords[word] ? keywords[word] + 1 : 1);
		});

		done(null, 1); //	for count
	});

} //	scrapeContent

function walkJobCat(dir, outDir, done) { //	per job category
	emitter.emit('log', '\n' + dir + '\n');

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
			if (!presetList.resume) {
				var outFile = path.join(outDir, basename_keyword);
				emitter.emit('log', NEWLINE + 'Write back merged keywords to ' + outFile);

				var fd = fs.createWriteStream(outFile);
				for (var word in keywords) {
					fd.write(word + NEWLINE);
				}
				fd.end();

				emitter.emit('log', NEWLINE + 'Done.');
			}

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
					//emitter.emit('doneDaily', NEWLINE + baseFolder);
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
				if (presetList.resume) {	//	process jobs + resume
					var outFile = path.join(outDir, cat_resume + '/' + basename_keyword_resume);
					emitter.emit('log', NEWLINE + 'Write back merged keywords to ' + outFile);

					var fd = fs.createWriteStream(outFile);
					for (var word in keywords) {
						fd.write(word + NEWLINE);
					}
					fd.end();

					emitter.emit('log', NEWLINE + 'Done.');
				}
			
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
					//emitter.emit('doneTop', NEWLINE + baseFolder);
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

function processOptions() {
	//console.log(process.argv);
	//console.log(process.argv.length);
	if (process.argv.length > 2) {
		if (cat_resume === process.argv[2].toLowerCase()) {
			console.log('\nProcess resumes!');
			presetList.cat.push(cat_resume);
			presetList.resume = true;
		}
	}
}

if (!fs.existsSync(inTopDir)) {
	console.log("Dir " + inTopDir + " not found!");
	process.exit(1);	
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
	processOptions();

	var timeA = new Date().getTime();

	//readKeywords();

	//emitter.on('keyword', function (message) {
	//	process.stdout.write(message);
	//	fs.appendFileSync(filename_status, message);

		walk(inTopDir, outTopDir, function (err, results) {
			var timeB = new Date().getTime();

			if (err) {
				console.err(util.inspect(err));
			}

			if (results) {
				totalItems += results;
				process.stdout.write('\nTotally ' + totalItems + ' jobs processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' jobs processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
				fs.appendFileSync(filename_status, NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
			}
		});
	//});
}
