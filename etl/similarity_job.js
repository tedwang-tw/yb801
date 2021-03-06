var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");
var lineReader = require('line-reader');
//var TfIdf = require('./tfidf');
//var tfidf = new TfIdf();
var cosineSim = require('./cosine_sim.js');

var CONCURRENCY = 1;
//var NORM_CONDS = 8; //	per actual job detail on web

var ext = '.txt'; //	null;	//	input file filter
var outExt = '.txt';

var NEWLINE = '\r\n';
var DELIMITER = ',';

var inTopDir = 'tfidf/104/job';
var outTopDir = 'similarity/104/job';
var cat_resume = 'resume';

//var basename_keyword = 'input/keywords_merge.txt';
//var basename_keyword_resume = 'input/keywords_merge_resume.txt';
var basename_resumelist = 'input/resumelist.txt';
//var basename_keywords_sort = 'keywords_merge_sort.txt';
//var basename_keywords_sort_index = 'keywords_merge_sort_index.txt';
//var basename_tf_idf = 'tf_idf.txt';
var basename_tfidf = 'tfidf.txt'; //	tf*idf
//var basename_tfidf_idx = 'tfidf_index.txt'; //	index + tf*idf
var basename_tfidf_resume = 'tfidf_resume.txt'; //	tf*idf
//var basename_joblist = 'joblist.txt';
var basename_sim_resume = 'sim_resume.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;
var outFile_simResume;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

var keywords = [];
var jobList = [];
var resumeList = [];
var resumeItem = '';

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
			process.exit(1);
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

function scrapeContent(dir, outDir, resumeTfidf, jobsTfidf, index, done) {

	setImmediate(function () {
		//var fileResume = path.join(dir, basename_tfidf_resume);
		//var fileJobs = path.join(dir, basename_tfidf);
		//var em = cosineSim.create(fileResume, fileJobs, true);

		var em = cosineSim.createData(resumeTfidf, jobsTfidf, false);

		var allData = '';

		function dataCB(inData) {
			allData += inData;
		}
		function endCB(msg) {
			em.removeListener('data', dataCB);
			em.removeListener('end', endCB);
			//process.stdout.write(allData);

			emitter.emit('log', NEWLINE + 'Write resume similarity ' + index);
			fs.appendFileSync(outFile_simResume, allData);
			//allData = null;
			emitter.emit('log', '\tdone.');

			done(null, 1); //	for count
		}

		em.on('data', dataCB);
		em.on('end', endCB);

		cosineSim.start();
	});

} //	scrapeContent

function loadMatrix(filename, matrix) {
	if (!fs.existsSync(filename)) {
		process.stderr.write('File "' + filename + '" not found!');
		process.exit(1);
	}

	var docs = fs.readFileSync(filename, 'utf8').split(NEWLINE);
	docs.forEach(function (doc) {
		if (doc.trim().length > 0)
			matrix.push(JSON.parse('[' + doc.trim() + ']'));
	});
}

function loadMixMatrix(filename, resumeMat, jobMat) {
	if (!fs.existsSync(filename)) {
		process.stderr.write('File "' + filename + '" not found!');
		process.exit(1);
	}

	var docs = fs.readFileSync(filename, 'utf8').split(NEWLINE);
	docs.forEach(function (doc, i) {
		if (doc.trim().length > 0) {
			if (i !== 0)
				jobMat.push(JSON.parse('[' + doc.trim() + ']'));
			else //	resume is at first position per tfidf_detail.js
				resumeMat.push(JSON.parse('[' + doc.trim() + ']'));
		}
	});
	//docs = null;
}

function walkJobCat(dir, outDir, done) { //	per job category
	emitter.emit('log', '\n' + dir + '\n');

	if (presetList.resume) {
		if (extractLastDir(dir, true) !== cat_resume)
			return done(null, 0);
	}

	var jobsTfidfs = [];
	var resumeTfidfs = [];

	outFile_simResume = path.join(outDir, basename_sim_resume);
	if (fs.existsSync(outFile_simResume))
		fs.unlinkSync(outFile_simResume);

	newDir(outDir);
	var itemCounter = 0;

	async.eachLimit(resumeList, CONCURRENCY, function (resume, callback) {
		var fileTfidf = path.join(dir, resume + ext);
		jobsTfidfs = [];
		resumeTfidfs = [];
		loadMixMatrix(fileTfidf, resumeTfidfs, jobsTfidfs);

		scrapeContent(dir, outDir, resumeTfidfs, jobsTfidfs, itemCounter, function (err, count) {
			itemCounter += count;
			//jobsTfidfs = [];
			//resumeTfidfs = [];
			callback();
		});
	}, function (err) {
		if (err) {
			// One of the iterations produced an error.
			// All processing will now stop.
			console.log('A file failed to process');
		} else {
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + jobsTfidfs.length + ' resumes/jobs processed.');
			done(null, itemCounter);
		}
	});
	return;

	var fileJobs = path.join(dir, basename_tfidf);
	var fileResume = path.join(dir, basename_tfidf_resume);
	loadMatrix(fileJobs, jobsTfidfs);
	loadMatrix(fileResume, resumeTfidfs);

	//console.log('resume #: ' + resumeTfidfs.length);
	//process.exit(1);

	async.each(resumeTfidfs, function (resume, callback) {
		scrapeContent(dir, outDir, [resume], jobsTfidfs, itemCounter, function (err, count) {
			itemCounter += count;
			callback();
		});
	}, function (err) {
		if (err) {
			// One of the iterations produced an error.
			// All processing will now stop.
			console.log('A file failed to process');
		} else {
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + jobsTfidfs.length + ' resumes/jobs processed.');
			done(null, itemCounter);
		}
	});
	return;

	resumeTfidfs.forEach(function (resume, i) {
		scrapeContent(dir, outDir, resume, jobsTfidfs, i, function (err, count) {
			itemCounter += count;
			emitter.emit('drainDone', ' ' + i);
		});
	});

	//done(null, itemCounter);

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
	if (process.argv.length > 2) {
		if (cat_resume === process.argv[2].toLowerCase()) {}
	}
	console.log('\nProcess resumes!');
	presetList.cat = [];
	presetList.cat.push(cat_resume);
	presetList.resume = true;
}

function readInputFiles() {
	if (!fs.existsSync(basename_resumelist)) {
		console.log('File "' + basename_resumelist + '" not found!');
		process.exit(1);
	}

	async.parallel({
		resumelist : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_resumelist, function (line) {
				var resume = line.trim();
				if (resume.length > 0)
					resumeList.push(resume);
			}).then(function () {
				callback(null, resumeList.length);
			});
		}
	},
		function (err, results) {
		// results is now equals to: {one: 1, two: 2}
		//process.exit();
		emitter.emit('keyword', NEWLINE + 'Totally ' + results.resumelist + ' resumes counted.');
	});
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
	fs.appendFileSync(filename_status, NEWLINE + getDateTime() + NEWLINE);

	getPreset();
	processOptions();
	readInputFiles();

	var timeA = new Date().getTime();

	emitter.on('keyword', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);

		walk(inTopDir, outTopDir, function (err, results) {
			var timeB = new Date().getTime();

			if (err) {
				console.err(util.inspect(err));
			}

			if (results) {
				totalItems += results;
				process.stdout.write('\nTotally ' + totalItems + ' resumes processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' resumes processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
				fs.appendFileSync(filename_status, NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
			}
		});
	});
}
