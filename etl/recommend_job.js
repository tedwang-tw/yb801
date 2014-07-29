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
//var TfIdf = require('./tfidf');
//var tfidf = new TfIdf();

var CONCURRENCY = 2;
//var NORM_CONDS = 8; //	per actual job detail on web
var GroupMode = {
	KMEANS : {
		value : 1,
		key : 'KM',
		name : 'KM'
	},
	HIERARCHY : {
		value : 2,
		key : 'HI',
		name : 'HI'
	},
	MA_KM : {
		value : 3,
		key : 'MA:KM',
		name : 'MA_KM'
	},
	UNKNOWN : {
		value : 0,
		name : ''
	}
};
var group_mode = 0;

var header_Origin = 'http://www.104.com.tw';
var header_Referer = 'http://vip.104.com.tw/9/search/search_result.cfm?jobcat=2007001000';

var ext = '.txt'; //	null;	//	input file filter
var outExt = '.json';
var cat_resume = 'resume';
var cat_job = 'job';

var NEWLINE = '\r\n';
var DELIMITER = ',';

var inTopDir = '../crawler/raw/104/job';
var inTopCorpusDir = 'synonym/104/job';
var outTopDir = 'recommend/104/job';

//var basename_keyword = 'keywords_merge.txt';
var basename_joblist = 'input/joblist.txt';
var basename_jobgroup = 'input/jobgroup.txt';
var basename_joburl = 'input/joburl.txt';
var basename_joburl_rec = 'input/joburl_rec.txt';
var basename_resumelist = 'input/resumelist.txt';
var basename_sim = 'input/sim_resume.txt';
var recommend_prefix = ''; //	'recommend_job_';
var basename_resumeRecord = 'resumelist.json';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var basename_na = 'not_found.txt';
var filename_status;
var filename_na;

var win_cmd = "copy";
var linux_cmd = "/bin/cp";
var command = '';

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

//var keywords = [];
var jobList = [];
var jobGroup = [];
var groupCount = {};
var clusterSort = []; //	for Mahout
var jobUrl = {};
var jobUrl_rec = {}; //	recommended by job
var resumeList = {
	resumes : []
};
var vectors = [];

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

function genJobOrder(doc) {
	var list = [];
	doc.forEach(function (similarity, i) {
		if (similarity > 0) //	only count appeared jobs
			list.push({
				similarity : similarity,
				index : i
			});
	});

	list.sort(function (a, b) {
		if (a.similarity > b.similarity)
			return -1;
		else if (a.similarity < b.similarity)
			return 1;
		else
			return 0;
	});

	return list;
}

function scrapeJob(dir, outDir, task, record) {
	if (path.extname(task) != '.html') {
		return; //	skip
	}

	//setImmediate(function () {
	var file = path.join(dir, task);
	var fileData = fs.readFileSync(file, 'utf8');
	//var outFile = path.join(outDir, path.basename(file, ext) + outExt);
	var outText = '';

	var compId = '#comp_header > ul > li > p > a'; //'#comp_header';
	var titleId = '#comp_header > ul > li > h1';
	var contentTag = '#cont_main';
	var contentClass = '.intro';
	var workClass = '.work';

	var $ = cheerio.load(fileData);

	record.company = $(compId).text().trim();
	record.title = $(titleId).text().trim();
	if (record.title.match(/\n/)) {
		var lines = record.title.split('\n');
		record.title = lines[0].trim();
	}

	//});

} //	scrapeJob

function genJobDict(words) {
	var wordDict = {};
	words.forEach(function (word) {
		if (wordDict[word])
			wordDict[word] += 1;
		else
			wordDict[word] = 1;
	});

	return Object.keys(wordDict);
}

function scrapeContent(dir, outDir, dir2, jobOrder, index) {
	//setImmediate(function () {
	var recommendation = {
		jobs : []
	};
	var count = 0;
	jobOrder.forEach(function (job, i) {
		if (i < presetList.recomNum) {
			var record = job;
			record.code = jobList[job.index];
			if (jobUrl[record.code]) //	dictionary lookup
				record.url = header_Origin + jobUrl[record.code];

			//record.title = '';
			//record.company = '';
			scrapeJob(dir, outDir, record.code + '.html', record);

			if (job.index >= jobGroup.length)
				record.group = -1;
			else
				record.group = jobGroup[job.index];

			var file_corpus = path.join(dir2, record.code + '.json');
			var fileData = JSON.parse(fs.readFileSync(file_corpus, 'utf8'));
			record.words = genJobDict(fileData);

			recommendation.jobs.push(record);
			count++;
		}
	});

	var outFile = path.join(outDir, recommend_prefix + resumeList.resumes[index].id_no + outExt);
	emitter.emit('log', NEWLINE + 'Write recommendation list ' + outFile);
	var fd = fs.createWriteStream(outFile);
	var dataResume = JSON.stringify(recommendation);

	fd.write(dataResume, function () {
		fd.end();
		emitter.emit('drainDone', '\tdone.');
		//emitter.emit('log', '\tdone.');
	});

	return count;
	//});

} //	scrapeContent

function walkJobCat(dir, outDir, dir2, done) { //	per job category
	emitter.emit('log', '\nIn: ' + dir + '\n');
	emitter.emit('log', '\nOut: ' + outDir + '\n');

	var itemCounter = 0;
	var groupDir = path.join(outDir, group_mode.name);
	newDir(groupDir);

	async.series([
			function (callback) {
				var resumeDir = path.join(dir2, '../' + cat_resume);
				var index = 0;
				async.eachSeries(resumeList.resumes, function (resume, inCB) {
					var inFile = path.join(resumeDir, resume.id_no + '.json');
					var fileData = JSON.parse(fs.readFileSync(inFile, 'utf8'));
					resumeList.resumes[index].words = genJobDict(fileData);
					resumeList.resumes[index].referer = header_Origin + jobUrl_rec[resume.id_no];
					index++;
					inCB();
				}, function (err) {
					if (err) {
						// One of the iterations produced an error.
						// All processing will now stop.
						console.log('A resume failed to process');
					} else {}
					callback(null, 'zero');
				});
			},
			function (callback) {
				var outFile = path.join(groupDir, basename_resumeRecord);
				emitter.emit('log', NEWLINE + 'Write resume list ' + outFile);
				var fd = fs.createWriteStream(outFile);
				var dataResume = JSON.stringify(resumeList);
				fd.write(dataResume, function () {
					fd.end();
					emitter.emit('log', '\tdone.');

					callback(null, 'one');
				});
			},
			function (callback) {
				var vecLen = vectors.length;
				var countDown = vecLen;

				function emitCB(message) {
					process.stdout.write(message);
					if (--countDown === 0) {
						emitter.removeListener('drainDone', emitCB);

						emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + vecLen + ' jobs/resumes processed.' + NEWLINE);
						//done(null, itemCounter);
					}
				}
				emitter.on('drainDone', emitCB);

				vectors.forEach(function (vector, i) {
					var jobOrder = genJobOrder(vector);
					itemCounter += scrapeContent(dir, groupDir, dir2, jobOrder, i);
				});
				callback(null, 'two');
			}
		],
		// optional callback
		function (err, results) {
		// results is now equal to ['one', 'two']
		done(null, itemCounter);
	});

	return;

	fs.readdir(dir, function (err, list) {
		if (err)
			return done(err, 0);

		var itemCounter = 0;
		newDir(outDir);

		var vecLen = vectors.length;
		var countDown = vecLen;

		function emitCB(message) {
			process.stdout.write(message);
			if (--countDown === 0) {
				emitter.removeListener('drainDone', emitCB);

				emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + vecLen + ' jobs/resumes processed.');
				done(null, itemCounter);
			}
		}
		emitter.on('drainDone', emitCB);

		vectors.forEach(function (vector, i) {
			var jobOrder = genJobOrder(vector);
			itemCounter += scrapeContent(dir, outDir, jobOrder, i);
		});

		//done(null, itemCounter);

	});
} //	walkJobCat

function walkDaily(dir, outDir, dir2, done) { //	per day
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
			var folder2 = path.join(dir2, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					//emitter.emit('doneDaily', NEWLINE + baseFolder);
					walkJobCat(folder, path.join(outDir, baseFolder), folder2, function (err, count) {
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

function walk(dir, outDir, dir2, done) {
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
			var folder2 = path.join(dir2, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					//emitter.emit('doneTop', NEWLINE + baseFolder);
					walkDaily(folder, path.join(outDir, baseFolder), folder2, function (err, count) {
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

function convertMahoutCluster(line) {
	var groups = {};
	var job2cluster = [];
	var size;

	line.split(',').forEach(function (job) {
		job = job.trim();
		if (job.length > 0) {
			var keyValue = job.split(':');
			var key = keyValue[1].trim();
			job2cluster.push(key);
			if (groups[key])
				groups[key].count += 1;
			else
				groups[key] = {
					count : 1,
					index : -1
				};
		}
	});

	//var clusterSort = [];
	for (var id in groups) {
		clusterSort.push(parseInt(id, 10));
	}
	clusterSort.sort(function (a, b) { //	sort cluster id
		return a - b;
	});
	clusterSort.forEach(function (key, i) { //	convert Mahout cluster id to zero-based index
		groups[key].index = i + 1;
	});

	console.log(clusterSort);
	console.log(Object.keys(groups).length);

	jobGroup = job2cluster.map(function (key) {
			return groups[key].index;
		});

	return clusterSort.length;
}

/*
<<	Clusters file format	>>
R:
==
KM
j1 j2 j3 ... jm
cn cn cn ...
jm+1 jm+2 jm+3 ...
cn cn cn ...

HI
[1] cn1 cn2 cn3 ... cnm
[m+1] cn1 cn2 cn3 ... cnm
[2m+1] cn1 cn2 cn3 ... cnm

Mahout:
=======
MA:KM
j1:cn,j2,cn,j3:cn,...
 */
function readJobs() {
	if (!fs.existsSync(basename_joblist)) {
		console.log('File "' + basename_joblist + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_jobgroup)) {
		console.log('File "' + basename_jobgroup + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_joburl)) {
		console.log('File "' + basename_joburl + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_joburl_rec)) {
		console.log('File "' + basename_joburl_rec + '" not found!');
		if (presetList.job)
			process.exit(1);
	}
	if (!fs.existsSync(basename_resumelist)) {
		console.log('File "' + basename_resumelist + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_sim)) {
		console.log('File "' + basename_sim + '" not found!');
		process.exit(1);
	}

	var lineNum = 0;
	var size = 0;

	async.parallel({
		joblist : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_joblist, function (line) {
				var job = line.trim();
				if (job.length > 0)
					jobList.push(job);
			}).then(function () {
				callback(null, jobList.length);
			});
		},
		resumelist : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_resumelist, function (line) {
				var resume = line.trim();
				if (resume.length > 0)
					resumeList.resumes.push({
						id_no : resume,
						referer : header_Referer,
						vrfy : 1405961882495,
						words : []
					});
			}).then(function () {
				callback(null, resumeList.resumes.length);
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
						if (line.toUpperCase().indexOf(GroupMode.MA_KM.key) !== -1) //	longest match first
							group_mode = GroupMode.MA_KM;
						else if (line.toUpperCase().indexOf(GroupMode.KMEANS.name) !== -1)
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
						} else if (group_mode.value === GroupMode.HIERARCHY.value) {
							var regEx = /\[[0-9]+\]/g;
							line = line.replace(regEx, '');
						} else { //	MA MODES
						}
						if (!bypass) {
							if (group_mode.value === GroupMode.MA_KM.value) {
								size = convertMahoutCluster(line);
							} else {
								line.split(/\s/).forEach(function (job) {
									if (job.length > 0) {
										jobGroup.push(job);
										if (Number(job) > size)
											size = Number(job);
									}
								});
							}
						}
						lineNum++;
					}
					//console.log(line);
				}
			}).then(function () {
				callback(null, jobGroup.length);
			});
		},
		joburl : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_joburl, function (line) {
				var urlPair = line.trim();
				var record;
				if (urlPair.length > 0) {
					record = urlPair.split(',');
					jobUrl[record[0].trim()] = record[1].trim();
				}
			}).then(function () {
				callback(null, Object.keys(jobUrl).length);
			});
		},
		joburl_rec : function (callback) {
			if (presetList.job) {
				// read all lines:
				lineReader.eachLine(basename_joburl_rec, function (line) {
					var urlPair = line.trim();
					var record;
					if (urlPair.length > 0) {
						record = urlPair.split(',');
						jobUrl_rec[record[0].trim()] = record[1].trim();
					}
				}).then(function () {
					callback(null, Object.keys(jobUrl_rec).length);
				});
			} else {
				callback(null, 0);
			}
		},
		similarity : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_sim, function (line) {
				var vector = line.trim();
				if (vector.length > 0) {
					vectors.push(JSON.parse('[' + vector + ']')); //	convert from strings to Double array
				}
			}).then(function () {
				callback(null, vectors.length);
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
			NEWLINE + 'Totally ' + results.jobgroup + ' job/group counted.' +
			NEWLINE + 'Totally ' + results.joburl + ' urls counted.' +
			NEWLINE + 'Totally ' + results.joburl_rec + ' rec job urls counted.' +
			NEWLINE + 'Totally ' + results.resumelist + ' resumes counted.' +
			NEWLINE + 'Totally ' + results.similarity + ' resume vectors counted.');
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

function processOptions() {
	if (process.argv.length > 2) {
		if (cat_job === process.argv[2].toLowerCase()) {
			presetList.job = true;
		}
	}
	console.log('\nProcess resumes!');
	presetList.resume = true;
}

if (!fs.existsSync(inTopDir)) {
	console.log("Dir " + inTopDir + " not found!");
	process.exit(1);
} else {
	var totalItems = 0;

	console.log('Source location: ' + inTopDir);
	console.log('Target location: ' + outTopDir);

	if (!fs.existsSync(inTopCorpusDir)) {
		console.log("Dir " + inTopCorpusDir + " not found!");
		process.exit(1);
	}

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
	fs.appendFileSync(filename_status, NEWLINE + getDateTime() + NEWLINE);

	getPreset();

	var timeA = new Date().getTime();

	processOptions();
	readJobs();
	checkPlatform();

	emitter.on('keyword', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);

		walk(inTopDir, outTopDir, inTopCorpusDir, function (err, results) {
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
	});
}
