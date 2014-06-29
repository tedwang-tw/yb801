var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");
var lineReader = require('line-reader');
var os = require('os');
var child_process = require('child_process');
var TfIdf = require('./tfidf');
var tfidf = new TfIdf();

var CONCURRENCY = 2;
//var NORM_CONDS = 8; //	per actual job detail on web
var GroupMode = {
	KMEANS : {
		value : 1,
		name : 'KM'
	},
	HIERARCHY : {
		value : 2,
		name : 'HI'
	},
	UNKNOWN : {
		value : 0,
		name : ''
	}
};
var group_mode = 0;

var ext = '.html'; //	null;	//	input file filter
var outExt = '.json';

var NEWLINE = '\r\n';
var DELIMITER = ',';

var inTopDir = '../crawler/raw/104/job';
var outTopDir = 'group/104/job';

//var basename_keyword = 'keywords_merge.txt';
var basename_joblist = 'input/joblist.txt';
var basename_jobgroup = 'input/jobgroup.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var basename_na = 'not_found.txt';
var filename_status;
var filename_na;

var win_cmd = "copy";
var linux_cmd = "/bin/cp";
var command = '';

var filename_preset = path.join(__dirname, 'cluster_group_cfg.json');
var presetList;

//var keywords = [];
var jobList = [];
var jobGroup = [];
var groupCount = {};

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
		var index = jobList.indexOf(path.basename(task, ext)); //	match job

		if (index < 0 || index >= jobGroup.length) {
			emitter.emit('na', task + ' is not grouped! index = ' + index, file);
			done(null, 0); //	for count
		} else {
			var group = jobGroup[index];
			groupCount[group] = groupCount[group] ? groupCount[group] + 1 : 1;

			var groupDir = path.join(outDir, group_mode.name + '/' + group);
			newDir(groupDir);

			child_process.exec(command + ' ' + file + ' ' + groupDir, {
				encoding : 'utf8'
			}, function (err, stdout, stderr) {
				// the command exited or the launching failed
				//console.log(stdout);
				if (err) {
					// we had an error launching the process
					emitter.emit('na', err, file);
					done(null, 0); //	for count
				} else {
					done(null, 1); //	for count
				}
			});
		}
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
		var groups = {};

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

function readJobs() {
	if (!fs.existsSync(basename_joblist)) {
		console.log('File "' + basename_joblist + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_jobgroup)) {
		console.log('File "' + basename_jobgroup + '" not found!');
		process.exit(1);
	}

	var lineNum = 0;
	var size = 0;

	async.parallel({
		joblist : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_joblist, function (line) {
				jobList.push(line.trim());
			}).then(function () {
				callback(null, jobList.length);
			});
		},
		jobgroup : function (callback) {
			// read all lines:
			var firstLine = true;
			lineReader.eachLine(basename_jobgroup, function (line) {
				var bypass = false;
				line = line.trim();
				if (line.length > 0) {
					if (firstLine) { //	group mode string
						if (line.toUpperCase().indexOf(GroupMode.KMEANS.name) !== -1)
							group_mode = GroupMode.KMEANS;
						else if (line.toUpperCase().indexOf(GroupMode.HIERARCHY.name) !== -1)
							group_mode = GroupMode.HIERARCHY;
						else {
							console.log(NEWLINE + basename_jobgroup + ' is unknown mode: ' + line);
							process.exit(1);
						}
						firstLine = false;
						return; //	no count line number
					} else { //	data array
						if (group_mode.value === GroupMode.KMEANS.value) {
							if ((lineNum % 2) === 0)
								bypass = true;
						} else { //	HIERARCHY MODE
							var regEx = /\[[0-9]+\]/g;
							line = line.replace(regEx, '');
						}
						if (!bypass) {
							line.split(/\s/).forEach(function (job) {
								if (job.length > 0) {
									jobGroup.push(job);
									if (Number(job) > size)
										size = Number(job);
								}
							});
						}
						lineNum++;
					}
					//console.log(line);
				}
			}).then(function () {
				callback(null, jobGroup.length);
			});
		}
	},
		function (err, results) {
		//console.log(jobList);
		//console.log(jobGroup);
		console.log('group mode: ' + group_mode.name);
		// results is now equals to: {one: 1, two: 2}
		emitter.emit('log', NEWLINE + 'Totally ' + size + ' groups.');
		//process.exit();
		emitter.emit('keyword', NEWLINE + 'Totally ' + results.joblist + ' jobs counted.' +
			NEWLINE + 'Totally ' + results.jobgroup + ' job/group counted.');
	});
}

function checkPlatform() {
	if (os.type() === 'Windows_NT' || os.platform() === 'win32') {
		command = win_cmd;
		console.log("It's Windows system.");
	} else {
		command = linux_cmd;
		console.log("It's Linux system.");
	}
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

	var filename_na = path.join(outTopDir, basename_na);
	emitter.on('na', function (err, dir) {
		fs.appendFileSync(filename_na, util.inspect(err) + NEWLINE);
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

	readJobs();
	checkPlatform();

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
				process.stdout.write('\nTotally ' + totalItems + ' jobs processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' jobs processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
			}
		});
	});
}
