var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");

var CONCURRENCY = 1;
//var NORM_CONDS = 8; //	per actual job detail on web

var ext = '.txt'; //	null;	//	input file filter
var outExt = '.txt';
var mergeExt = '_merge.txt';
var sortExt = '_sort.txt';

var NEWLINE = '\r\n';

var inTopDir = 'text';
var outTopDir = 'concat/glossary';

var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var filename_preset = path.join(__dirname, 'glossary_config.json');
var presetList;
var fd_merge;

var keywords = [];

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
			"site" : ["gartner", "techopedia", "webopedia"],
			"cat" : [],
			"day" : []
		};
	}
	console.log(presetList);
}

function checkPresetSite(site) {
	if (presetList.site.length === 0)
		return true;
	else {
		return (presetList.site.indexOf(site) !== -1);
	}
}

function checkPresetCat(cat) {
	if (presetList.cat.length === 0)
		return true;
	else {
		return (presetList.cat.indexOf(cat) !== -1);
	}
}

function checkPresetDay(day) {
	if (presetList.day.length === 0)
		return true;
	else {
		return (presetList.day.indexOf(day) !== -1);
	}
}

function scrapeContent(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		done(null, 1); //	for count
	});

} //	scrapeContent

function walkDay(dir, outDir, site, done) { //	per day
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

		//newDir(outDir);
		var outFile = path.join(path.dirname(outDir), site + outExt); //	daily/{cat}.txt
		emitter.emit('log', NEWLINE + 'Concat to ' + outFile + NEWLINE);
		var fd = fs.createWriteStream(outFile);

		var listLen = list.length;

		var q = async.queue(function (task, taskCB) { //	task = list[i]
				var rs = fs.createReadStream(path.join(dir, task), {
						encoding : 'utf8'
					});

				//rs.pipe(fd, {
				//	end : false
				//});
				rs.on('data', function (data) {
					if (data.trim().length > 0) {
						fd.write(data);
						fd_merge.write(data);
						var lines = data.trim().split(/[\r\n]/);
						lines.forEach(function (line) {
							if (line.trim().length > 0)
								keywords.push(line.trim());
						});
					}
				});
				rs.on('end', function () {
					itemCounter += 1;
					setImmediate(taskCB);
				});

			}, CONCURRENCY);

		q.drain = function () {
			fd.end();
			var stats = fs.statSync(outFile);
			var fileSizeInBytes = stats.size;
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' files/files processed.');
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + fileSizeInBytes + ' bytes merged.');
			done(null, itemCounter);
		};
		q.empty = function () {
			enQueue(q, list, CONCURRENCY);
		};

		enQueue(q, list, CONCURRENCY); //	trigger start
	});
} //	walkDay

function walkCat(dir, outDir, site, done) { //	per cat
	//emitter.emit('log', '\n' + dir);

	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var dayCount = 0;

		if (err)
			return done(err, 0);

		newDir(outDir);

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			//console.log(NEWLINE + baseFolder);
			if (!checkPresetDay(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					emitter.emit('log', NEWLINE + baseFolder);
					walkDay(folder, path.join(outDir, baseFolder), site, function (err, count) {
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
				emitter.emit('doneDaily', NEWLINE + 'Totally ' + dayCount + '/' + list.length + ' days processed.');
				done(null, itemCounter);
			}
		});
	});
} //	walkCat

function walkSite(dir, outDir, done) { //	per site
	emitter.emit('log', '\n' + dir);

	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var catCount = 0;

		if (err)
			return done(err, 0);

		newDir(outDir);

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			//console.log(baseFolder);
			if (!checkPresetCat(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					//emitter.emit('doneDaily', NEWLINE + baseFolder);
					walkCat(folder, path.join(outDir, baseFolder), path.basename(dir), function (err, count) {
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
				emitter.emit('doneDaily', NEWLINE + 'Totally ' + catCount + '/' + list.length + ' cats processed.');
				done(null, itemCounter);
			}
		});
	});
} //	walkSite

function walk(dir, outDir, done) {
	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var siteCount = 0;

		if (err)
			return done(err);

		var filename_merge = path.join(outDir, presetList.day[0] + mergeExt);
		fd_merge = fs.createWriteStream(filename_merge, {
				encoding : 'utf8'
			});

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			if (!checkPresetSite(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					emitter.emit('log', NEWLINE + baseFolder);
					walkSite(folder, path.join(outDir, baseFolder), function (err, count) {
						itemCounter += count;
						siteCount++;
						callback();
					});
				} else {
					callback();
				}
			});
		}, function (errAsync) {
			fd_merge.end();
			emitter.emit('log', NEWLINE + NEWLINE + 'Merged to ' + filename_merge);

			var filename_sort = path.join(outDir, path.basename(filename_merge, outExt) + sortExt);
			emitter.emit('log', NEWLINE + 'Sorted to ' + filename_sort + '...');
			fd_merge = fs.createWriteStream(filename_sort, {
					encoding : 'utf8'
				});
			sortUnique(keywords).forEach(function (word) {
				fd_merge.write(word + NEWLINE);
			});
			fd_merge.end();
			emitter.emit('log', 'done.');

			if (errAsync) {
				done(errAsync, 0);
			} else {
				emitter.emit('doneTop', NEWLINE + 'Totally ' + siteCount + '/' + list.length + ' sites processed.');
				done(null, itemCounter);
			}
		});
	});
} //	walk

function sortUnique(orgKeywords) {
	orgKeywords.sort(function (a, b) { //	sort as longest prefix match
		if (a.length < b.length)
			return -1;
		else if (a.length > b.length)
			return 1;
		else
			return a.localeCompare(b);
	}).reverse();

	var newKeywords = [];

	orgKeywords.forEach(function (word) {
		if (newKeywords.indexOf(word) === -1)
			newKeywords.push(word);
	});

	return newKeywords;
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

	var timeA = new Date().getTime();

	walk(inTopDir, outTopDir, function (err, results) {
		var timeB = new Date().getTime();

		if (err) {
			console.err(util.inspect(err));
		}

		if (results) {
			totalItems += results;
			process.stdout.write('\nTotally ' + totalItems + ' glossary files processed.\n');
			fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' glossary files processed.' + NEWLINE);

			console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
			fs.appendFileSync(filename_status, 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
		}
	});
}
