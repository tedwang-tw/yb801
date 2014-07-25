var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
var cheerio = require("cheerio");
var lineReader = require('line-reader');
var TfIdf = require('./tfidf');
var tfidf = new TfIdf();

var CONCURRENCY = 2;
//var NORM_CONDS = 8; //	per actual job detail on web

var ext = '.json'; //	null;	//	input file filter
var outExt = '.txt';

var NEWLINE = '\r\n';
//var DELIMITER = ',';

var inTopDir = 'corpus_group/104/job';
var outTopDir = 'tfidf_group/104/job';

var basename_keyword = 'input/keywords_merge.txt';
var basename_keywords_sort = 'keywords_merge_sort.txt';
var basename_prefix = 'rep_';
var basename_tf_idf = 'tf_icf.txt';
var basename_tfidf = 'tficf.txt'; //	tf*idf
var basename_tf_cluster = 'tf_cluster.txt'; //	term freq
var basename_joblist = 'clusterlist.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

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
			"cat" : [],
			"alg" : []
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

function checkPresetAlg(alg) {
	if (presetList.alg.length === 0)
		return true;
	else {
		return (presetList.alg.indexOf(alg) !== -1);
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

function genDocTF(doc, tf_idfs) {
	var list = [];
	doc.forEach(function (tfidf, i) {
		if (tfidf > 0) //	only count appeared words
			list.push({
				tfidf : tfidf,
				tf : tf_idfs[i],
				keyword : keywords[i],
				freq : 0,
				rfreq : 0 //	reduced frequency
			});
	});

	list.sort(function (a, b) {
		if (a.tfidf > b.tfidf)
			return -1;
		else if (a.tfidf < b.tfidf)
			return 1;
		else
			return 0;
	});

	var size = list.length;
	list.map(function (item, i) {
		item.freq = size - i;	//	i + 1;
		item.rfreq = Math.floor(item.freq / 10) + 1; //	to fit the two-digits limitation of the wordcloud2.js
		return item;
	});

	return list;
}

function genClustersTF(outDir, clusterFileList, tfidf_mat, tf_idf_mat) {
	var FREQ_DELIMITER = ' ';
	var FREQ_NEWLINE = '\n';

	clusterFileList.forEach(function (file, i) {
		var outFile = path.join(outDir, file + outExt);
		var outFile_rep = path.join(outDir, basename_prefix + file + outExt);
		var fd = fs.createWriteStream(outFile);
		var fd_rep = fs.createWriteStream(outFile_rep);
		//var fd_rep = fs.openSync(outFile_rep, "w");

		var repData = '';
		var data = '';
		var docTf = genDocTF(tfidf_mat[i], tf_idf_mat[i]);

		var outFile_json = path.join(outDir, file + '.json');
		emitter.emit('log', NEWLINE + 'Write cloud json ' + outFile_json);
		var fd_json = fs.createWriteStream(outFile_json);
		var docJson = JSON.stringify({
				cloud : docTf
			});

		docTf.forEach(function (item) {
			//fd.write(item.rfreq + FREQ_DELIMITER + item.keyword + FREQ_NEWLINE);
			data += item.rfreq + FREQ_DELIMITER + item.keyword + FREQ_NEWLINE;

			var buffer = item.keyword + FREQ_NEWLINE;
			for (var i = 0; i < item.freq; i++)
				//fs.writeSync(fd_rep, buffer);
				repData += buffer;
		});

		//emitter.emit('log', ' ' + i);

		async.series([
				function (callback) {
					fd_json.write(docJson, function () {
						fd_json.end();
						callback(null, 'one');
					});
				},
				function (callback) {
					fd.write(data, function () {
						fd.end();
						callback(null, 'two');
					});
				},
				function (callback) {
					fd_rep.write(repData, function () {
						fd_rep.end();
						callback(null, 'three');
					});
					//fs.closeSync(fd_rep);
				}
			],
			// optional callback
			function (err, results) {
			// results is now equal to ['one', 'two']
			emitter.emit('drainDone', ' ' + i);
		});
	});
}

function scrapeContent(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(dir, task);
		var fileData = JSON.parse(fs.readFileSync(file, 'utf8'));

		tfidf.addDocument(fileData);

		done(null, 1); //	for count
	});

} //	scrapeContent

function walkAlgorithm(dir, outDir, done) { //	per algorithm
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
		var jobList = [];

		var q = async.queue(function (task, taskCB) {
				scrapeContent(dir, outDir, task, function (err, count) {
					itemCounter += count;
					if (count > 0) {
						jobList.push(path.basename(task, ext)); //	record job id
					}
					setImmediate(taskCB);
				});
			}, CONCURRENCY);

		q.drain = function () {
			var countDown = jobList.length;

			function emitCB(message) {
				process.stdout.write(message.toString());
				if (--countDown === 0) {
					emitter.removeListener('drainDone', emitCB);

					done(null, itemCounter);
				}
			}
			emitter.on('drainDone', emitCB);

			async.series([
					function (callback) {
						var outFile = path.join(outDir, basename_joblist);
						emitter.emit('log', NEWLINE + 'Write job list ' + outFile);
						var fd = fs.createWriteStream(outFile);
						var data1 = '';
						jobList.forEach(function (jobCode) {
							data1 += jobCode + NEWLINE;
						});
						fd.write(data1, function () {
							fd.end();
							emitter.emit('log', '\tDone.');
							callback(null, 'one');
						});
					},
					function (callback) {
						var outFile_sort = path.join(outDir, basename_keywords_sort);
						var fd_sort = fs.createWriteStream(outFile_sort);
						emitter.emit('log', NEWLINE + 'Sorted keywords also saved to ' + outFile_sort);

						var data2_1 = '';
						keywords.forEach(function (word) {
							data2_1 += word + NEWLINE;
						});
						fd_sort.write(data2_1, function () {
							fd_sort.end();
							callback(null, 'two');
						});
					},
					function (callback) {
						var matrix = tfidf.tfidf_matrix(keywords, function (i, measure) {
								//console.log('document #' + i + ' is ' + measure);
							});
						//console.log(matrix);
						var outFile2 = path.join(outDir, basename_tfidf);
						////var outFile2_idx = path.join(outDir, basename_tfidf_idx);
						emitter.emit('log', NEWLINE + 'Write TF*IDF result to ' + outFile2 + '...');
						var fd2 = fs.createWriteStream(outFile2);
						////var fd2_idx = fs.createWriteStream(outFile2_idx);
						var lines = 0;

						var data2 = '';
						matrix.forEach(function (doc) { //	per row (document)
							var regEx = /[\[\]]/gi;
							var terms = JSON.stringify(doc).replace(regEx, '');
							data2 += terms + NEWLINE;
							lines++;
						});
						fd2.write(data2, function () {
							fd2.end();
							emitter.emit('log', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' cluster/files processed.');

							//countDown--;
							//emitter.emit('drainDone', NEWLINE + 'matrix done.');
							callback(null, matrix);
						});
					},
					function (callback) {
						var matrix3 = tfidf.tf_idf_matrix(keywords, function (i, measure) {});
						var outFile3 = path.join(outDir, basename_tf_idf);
						emitter.emit('log', NEWLINE + 'Write TF_IDF result to ' + outFile3 + '...');
						var fd3 = fs.createWriteStream(outFile3);
						var lines3 = 0;

						var data3 = '';
						matrix3.forEach(function (doc) { //	per row (document)
							var regEx = /[\[\]]/gi;
							var terms = JSON.stringify(doc).replace(regEx, '');
							data3 += terms + NEWLINE;
							lines3++;
						});
						fd3.write(data3, function () {
							fd3.end();
							emitter.emit('log', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' cluster/files processed.');

							//countDown--;
							//emitter.emit('drainDone', NEWLINE + 'matrix3 done.');
							callback(null, matrix3);
						});
					}
				],
				// optional callback
				function (err, results) {
				// results is now equal to ['one', 'two']
				emitter.emit('log', NEWLINE + 'Generate cloud freq per cluster...');
				genClustersTF(outDir, jobList, results[2], results[3]);
				emitter.emit('log', '\tdone.');
			});

			/*
			async.eachSeries(matrix, function (doc, outerCallback) { //	per row (document)
			var regEx = /[\[\]]/gi;
			var terms = JSON.stringify(doc).replace(regEx, '');
			//emitter.emit('log', terms + NEWLINE);
			fd2.write(terms + NEWLINE);
			//emitter.emit('log', ++lines + ' ');
			lines++;
			////fd2_idx.write(lines + ',' + terms + NEWLINE);
			outerCallback();
			}, function (err) {
			if (err) {
			console.log('Failed to process outer!');
			} else {
			//fd2.write(util.inspect(matrix));
			fd2.end();
			////fd2_idx.end();
			//emitter.emit('log', NEWLINE + lines + ' rows Done.');
			emitter.emit('log', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' cluster/files processed.');

			var outFile_sort = path.join(outDir, basename_keywords_sort);
			var fd_sort = fs.createWriteStream(outFile_sort);
			emitter.emit('log', NEWLINE + 'Sorted keywords also saved to ' + outFile_sort);

			keywords.forEach(function (word) {
			fd_sort.write(word + NEWLINE);
			});
			fd_sort.end();

			countDown--;
			emitter.emit('drainDone', NEWLINE + 'matrix done.');
			//done(null, itemCounter);
			}
			});

			async.eachSeries(matrix3, function (doc, outerCallback) { //	per row (document)
			var regEx = /[\[\]]/gi;
			var terms = JSON.stringify(doc).replace(regEx, '');
			fd3.write(terms + NEWLINE);
			lines3++;
			outerCallback();
			}, function (err) {
			if (err) {
			console.log('Failed to process outer!');
			} else {
			fd3.end();
			//emitter.emit('log', NEWLINE + lines3 + ' rows Done.');
			emitter.emit('log', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' cluster/files processed.');

			countDown--;
			emitter.emit('drainDone', NEWLINE + 'matrix3 done.');
			//done(null, itemCounter);
			}
			});
			 */
		};
		q.empty = function () {
			enQueue(q, list, CONCURRENCY);
		};

		enQueue(q, list, CONCURRENCY); //	trigger start
	});
} //	walkAlgorithm

function walkJobCat(dir, outDir, done) { //	per category
	emitter.emit('log', '\n' + dir);

	fs.readdir(dir, function (err, list) {
		var itemCounter = 0;
		var algCount = 0;

		if (err)
			return done(err, 0);

		async.eachSeries(list.sort(), function (baseFolder, callback) {
			if (!checkPresetAlg(baseFolder)) {
				return callback(); //	bypass;
			}

			var folder = path.join(dir, baseFolder);
			fs.stat(folder, function (errStat, stat) {
				if (stat && stat.isDirectory()) {
					//emitter.emit('log', NEWLINE + baseFolder);
					walkAlgorithm(folder, path.join(outDir, baseFolder), function (err, count) {
						itemCounter += count;
						algCount++;
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
				emitter.emit('doneJobCat', NEWLINE + 'Totally ' + algCount + '/' + list.length + ' algorithms processed.');
				done(null, itemCounter);
			}
		});
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

function readKeywords() {
	if (!fs.existsSync(basename_keyword)) {
		console.log('File "' + basename_keyword + '" not found!');
		process.exit(1);
	}

	var last = false;
	var count = 0;
	var synonyms = 0;

	async.doWhilst(
		function (callback) {
		// read all lines:
		lineReader.eachLine(basename_keyword, function (line) {
			var item = line.trim();
			if (item.length > 0) {
				keywords.push(line.trim());
				count++;
				synonyms += item.length;
			}
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

function processOptions() {
	//console.log(process.argv);
	//console.log(process.argv.length);
	if (process.argv.length > 2) {
		var alg = process.argv[2].toUpperCase();
		presetList.alg.push(alg);
		console.log('\nProcess algorithm: ' + alg);
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
	fs.appendFileSync(filename_status, NEWLINE + getDateTime() + NEWLINE);

	getPreset();
	processOptions();

	var timeA = new Date().getTime();

	readKeywords();

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
				process.stdout.write('\nTotally ' + totalItems + ' clusters processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' clusters processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
				fs.appendFileSync(filename_status, NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
			}
		});
	});
}
