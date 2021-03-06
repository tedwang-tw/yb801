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
var DELIMITER = ',';

var inTopDir = 'synonym/104/job';
var outTopDir = 'tfidf/104/job';
var cat_resume = 'resume';

var basename_keyword = 'input/keywords_merge.txt';
//var basename_keyword_resume = 'input/keywords_merge_resume.txt';
var basename_keywords_sort = 'keywords_merge_sort.txt';
var basename_keywords_sort_index = 'keywords_merge_sort_index.txt';
//var basename_keywords_resume_sort_index = 'keywords_merge_resume_sort_index.txt';
var basename_tf_idf = 'tf_idf.txt';
var basename_tfidf = 'tfidf.txt'; //	tf*idf
var basename_tfidf_idx = 'tfidf_index.txt'; //	index + tf*idf
var basename_tfidf_resume = 'tfidf_resume.txt'; //	tf*idf
var basename_tfidf_resume_idx = 'tfidf_resume_index.txt'; //	index + tf*idf
var basename_joblist = 'joblist.txt';
var basename_resumelist = 'resumelist.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var outFile_resume;
//var outFile_tfidf_resume;
//var outFile_tfidf_resume_idx;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

var keywords = [];
var jobList = [];
var jobWord_matrix = [];
var resumeList = [];
//var resumeItem = '';

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

function scrapeContent(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(dir, task);
		var fileData = JSON.parse(fs.readFileSync(file, 'utf8'));

		tfidf.addDocument(fileData);
		if (presetList.resume)
			jobWord_matrix.push(fileData); //	backup for later resume usage

		done(null, 1); //	for count
	});

} //	scrapeContent

function scrapeContentResume(dir, outDir, task, done) {
	if (path.extname(task) != ext) {
		return done(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(dir, task);
		var fileData = JSON.parse(fs.readFileSync(file, 'utf8'));

		tfidf.reNew();

		tfidf.addDocument(fileData);	//	resume is at first position
		jobWord_matrix.forEach(function (jobDoc) {
			tfidf.addDocument(jobDoc);
		});

		done(null, 1); //	for count
	});

} //	scrapeContentResume

function processTFIDF(dir, outDir, done, itemCounter) {
	var resumeIndex = 0;	//jobList.length;
	var resume_dir = '';
	if (presetList.resume) {
		resume_dir = '../' + cat_resume + '/'; //	force output files to resume folder
		newDir(outDir + '/../' + cat_resume);
	}

	async.series([
			function (callback) {
				var outFile = path.join(outDir, resume_dir + basename_joblist);
				emitter.emit('log', NEWLINE + 'Write job list ' + outFile);
				var fd = fs.createWriteStream(outFile);
				var dataOut = '';
				jobList.forEach(function (jobCode, i) {
					/*
					if (presetList.resume)
						if (i >= resumeIndex)
							return; //	bypass resumes					
					*/
					dataOut += jobCode + NEWLINE;
				});
				fd.write(dataOut, function () {
					fd.end();
					emitter.emit('log', '\tdone.');

					callback(null, 'one');
				});
			},
			function (callback) {
				if (!presetList.resume) {			
					var matrix = tfidf.tfidf_matrix(keywords, function (i, measure) {
							//console.log('document #' + i + ' is ' + measure);
						});
					var outFile2 = path.join(outDir, resume_dir + basename_tfidf);
					var outFile2_idx = path.join(outDir, resume_dir + basename_tfidf_idx);
					emitter.emit('log', NEWLINE + 'Write TF*IDF result to ' + outFile2 + '...');
					var fd2 = fs.createWriteStream(outFile2);
					var fd2_idx = fs.createWriteStream(outFile2_idx);
					var lines = 0;

					var dataOut2_1 = '';
					var dataOut2_2 = '';
					var dataResume = '';
					matrix.forEach(function (doc) { //	per row (document)
						var regEx = /[\[\]]/gi;
						var terms = JSON.stringify(doc).replace(regEx, '');
						/*
						if (presetList.resume) {
							if (lines === resumeIndex) { //	separate resume ouput
								dataResume = terms;

								return;
							}
						}
						*/
						lines++;
						dataOut2_1 += terms + NEWLINE;
						dataOut2_2 += lines + ',' + terms + NEWLINE;
					});
					fd2.write(dataOut2_1, function () {
						fd2.end();
						fd2_idx.write(dataOut2_2, function () {
							fd2_idx.end();
						});

						callback(null, 'two');
					});
				} else
					callback(null, 'two');
			},
			function (callback) {
				if (!presetList.resume) {			
					var matrix3 = tfidf.tf_idf_matrix(keywords, function (i, measure) {});
					var outFile3 = path.join(outDir, resume_dir + basename_tf_idf);
					emitter.emit('log', NEWLINE + 'Write TF_IDF result to ' + outFile3 + '...');
					var fd3 = fs.createWriteStream(outFile3);
					var lines3 = 0;

					var dataOut3 = '';
					matrix3.forEach(function (doc) { //	per row (document)
						var regEx = /[\[\]]/gi;
						var terms = JSON.stringify(doc).replace(regEx, '');
						dataOut3 += terms + NEWLINE;
						lines3++;
					});
					fd3.write(dataOut3, function () {
						fd3.end();

						callback(null, 'three');
					});
				} else
					callback(null, 'three');
			},
			function (callback) {
				var outFile_sort = path.join(outDir, resume_dir + basename_keywords_sort);
				var outFile_index;
				//if (presetList.resume)
				//	outFile_index = path.join(outDir, resume_dir + basename_keywords_resume_sort_index);
				//else
					outFile_index = path.join(outDir, resume_dir + basename_keywords_sort_index);
				
				var fd_sort = fs.createWriteStream(outFile_sort);
				var fd_index = fs.createWriteStream(outFile_index);
				emitter.emit('log', NEWLINE + 'Sorted keywords also saved to ' + outFile_sort);

				var lines = 0;
				var dataOut4_1 = '';
				var dataOut4_2 = '';
				keywords.forEach(function (word) {
					dataOut4_1 += word + NEWLINE;
					dataOut4_2 += lines + ',' + word + NEWLINE;
					lines++;
				});
				fd_sort.write(dataOut4_1, function () {
					fd_sort.end();
					fd_index.write(dataOut4_2, function () {
						fd_index.end();
						emitter.emit('log', '\tdone.');
						callback(null, 'four');
					});
				});
			}
		],
		// optional callback
		function (err, results) {
		done(null, itemCounter);
	});
} //	processTFIDF

function processResumeTFIDF(dir, outDir, taskCB, index) {
	var resumeTfidfIndex = 0;	//jobList.length; //	resume is appended after all jobs in the doc matrix
	var resume_dir = '';
	//if (presetList.resume)
	//	resume_dir = cat_resume + '/'; //	force output files to resume folder

	async.series([
			function (callback) {
				if (presetList.resume) {
					//var outFile_resume = path.join(outDir, resume_dir + basename_resumelist);
					emitter.emit('log', NEWLINE + 'Write resume id ' + index + '\t');
					
					var dataResume = resumeList[index] + NEWLINE;
					fs.appendFileSync(outFile_resume, dataResume);
					callback(null, 'one');
				}
			},
			function (callback) {
				var matrix = tfidf.tfidf_matrix(keywords, function (i, measure) {
						//console.log('document #' + i + ' is ' + measure);
					});
				var outFile2 = path.join(outDir, resume_dir + resumeList[index] + outExt);
				var outFile2_idx = path.join(outDir, resume_dir + resumeList[index] + '_index' + outExt);
				emitter.emit('log', NEWLINE + 'Write resume tf*idf ' + index + '\t');
				var fd2 = fs.createWriteStream(outFile2);
				//var fd2_idx = fs.createWriteStream(outFile2_idx);
				var lines = 0;

				var dataOut2_1 = '';
				var dataOut2_2 = '';
				var dataResume = '';
				matrix.forEach(function (doc) { //	per row (document)
					var regEx = /[\[\]]/gi;
					var terms = JSON.stringify(doc).replace(regEx, '');
					lines++;
					dataOut2_1 += terms + NEWLINE;
					dataOut2_2 += lines + ',' + terms + NEWLINE;
				});
				fd2.write(dataOut2_1, function () {
					fd2.end();
					//fd2_idx.write(dataOut2_2, function () {
					//	fd2_idx.end();
					//});

					callback(null, 'two');
				});
				return;
					
				dataResume = matrix[resumeTfidfIndex] + NEWLINE;
				
				emitter.emit('log', NEWLINE + 'Write resume tf*idf ' + index + '\t');

				//fs.appendFileSync(outFile_tfidf_resume, dataResume);
				//fs.appendFileSync(outFile_tfidf_resume_idx, (index + 1) + ',' + dataResume);

				emitter.emit('log', '\tdone.\t');
				callback(null, 'two');
			}
		],
		// optional callback
		function (err, results) {
		setImmediate(taskCB);
	});
} //	processResumeTFIDF

function walkJobCat(dir, outDir, done) { //	per job category
	var isResumeCat = false;
	var resume_dir = '';
	emitter.emit('log', '\n' + dir + '\n');

	if (presetList.resume) {
		if (extractLastDir(dir, true) === cat_resume) {
			isResumeCat = true;

			outFile_resume = path.join(outDir, resume_dir + basename_resumelist);
			//outFile_tfidf_resume = path.join(outDir, resume_dir + basename_tfidf_resume);
			//outFile_tfidf_resume_idx = path.join(outDir, resume_dir + basename_tfidf_resume_idx);

			//	Since later file output is in appending mode, we need to delete old files.
			if (fs.existsSync(outFile_resume))
				fs.unlinkSync(outFile_resume);
			//if (fs.existsSync(outFile_tfidf_resume))
			//	fs.unlinkSync(outFile_tfidf_resume);
			//if (fs.existsSync(outFile_tfidf_resume_idx))
			//	fs.unlinkSync(outFile_tfidf_resume_idx);
		}
	}

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
				if (isResumeCat) {
					scrapeContentResume(dir, outDir, task, function (err, count) {

						if (count > 0) {
							//resumeItem = path.basename(list[0], ext);
							resumeList.push(path.basename(task, ext)); //	record resume id
							processResumeTFIDF(dir, outDir, taskCB, itemCounter); //	processResumeTFIDF() per resume
						}
						itemCounter += count; //	inc after processResumeTFIDF()
						//setImmediate(taskCB);
					});
				} else {
					scrapeContent(dir, outDir, task, function (err, count) {
						itemCounter += count;

						if (count > 0) {
							jobList.push(path.basename(task, ext)); //	record job id
						}
						setImmediate(taskCB);
					});
				}
			}, CONCURRENCY);

		q.drain = function () {
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' jobs/files processed.');
			/*
			var countDown = 3; //	tasks count

			function emitCB(message) {
			process.stdout.write(message);
			if (countDown === 0) {
			emitter.removeListener('drainDone', emitCB);
			done(null, itemCounter);
			}
			}
			emitter.on('drainDone', emitCB);
			 */
			if (!isResumeCat)
				processTFIDF(dir, outDir, done, itemCounter); //	processTFIDF() after all jobs accumulated
			else
				done(null, itemCounter);
			return; //	--------------------------------------------------------

			async.series([
					function (callback) {
						var outFile = path.join(outDir, basename_joblist);
						emitter.emit('log', NEWLINE + 'Write job list ' + outFile);
						var fd = fs.createWriteStream(outFile);
						var dataOut = '';
						jobList.forEach(function (jobCode) {
							dataOut += jobCode + NEWLINE;
						});
						fd.write(dataOut, function () {
							fd.end();
							//countDown--;
							emitter.emit('log', '\tDone.');
							callback(null, 'one');
						});
					},
					function (callback) {
						var matrix = tfidf.tfidf_matrix(keywords, function (i, measure) {
								//console.log('document #' + i + ' is ' + measure);
							});
						var outFile2 = path.join(outDir, basename_tfidf);
						var outFile2_idx = path.join(outDir, basename_tfidf_idx);
						emitter.emit('log', NEWLINE + 'Write TF*IDF result to ' + outFile2 + '...');
						var fd2 = fs.createWriteStream(outFile2);
						var fd2_idx = fs.createWriteStream(outFile2_idx);
						var lines = 0;

						var dataOut2_1 = '';
						var dataOut2_2 = '';
						matrix.forEach(function (doc) { //	per row (document)
							var regEx = /[\[\]]/gi;
							var terms = JSON.stringify(doc).replace(regEx, '');
							lines++;
							dataOut2_1 += terms + NEWLINE;
							dataOut2_2 += lines + ',' + terms + NEWLINE;
						});
						fd2.write(dataOut2_1, function () {
							fd2.end();
							fd2_idx.write(dataOut2_2, function () {
								fd2_idx.end();
							});
							//countDown--;
							//emitter.emit('drainDone', NEWLINE + 'matrix done.');
							callback(null, 'two');
						});
					},
					function (callback) {
						var matrix3 = tfidf.tf_idf_matrix(keywords, function (i, measure) {});
						var outFile3 = path.join(outDir, basename_tf_idf);
						emitter.emit('log', NEWLINE + 'Write TF_IDF result to ' + outFile3 + '...');
						var fd3 = fs.createWriteStream(outFile3);
						var lines3 = 0;

						var dataOut3 = '';
						matrix3.forEach(function (doc) { //	per row (document)
							var regEx = /[\[\]]/gi;
							var terms = JSON.stringify(doc).replace(regEx, '');
							dataOut3 += terms + NEWLINE;
							lines3++;
						});
						fd3.write(dataOut3, function () {
							fd3.end();

							//countDown--;
							//emitter.emit('drainDone', NEWLINE + 'matrix3 done.');
							callback(null, 'three');
						});
					},
					function (callback) {
						var outFile_sort = path.join(outDir, basename_keywords_sort);
						var outFile_index = path.join(outDir, basename_keywords_sort_index);
						var fd_sort = fs.createWriteStream(outFile_sort);
						var fd_index = fs.createWriteStream(outFile_index);
						emitter.emit('log', NEWLINE + 'Sorted keywords also saved to ' + outFile_sort);

						var lines = 0;
						var dataOut4_1 = '';
						var dataOut4_2 = '';
						keywords.forEach(function (word) {
							dataOut4_1 += word + NEWLINE;
							dataOut4_2 += lines + ',' + word + NEWLINE;
							lines++;
						});
						fd_sort.write(dataOut4_1, function () {
							fd_sort.end();
							fd_index.write(dataOut4_2, function () {
								fd_index.end();
								emitter.emit('log', '\tdone.');
								callback(null, 'four');
							});
						});
					}
				],
				// optional callback
				function (err, results) {
				// results is now equal to ['one', 'two']
				emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' jobs/files processed.');
				done(null, itemCounter);
			});

			/*
			async.eachSeries(jobList, function (jobCode, callback) {
			fd.write(jobCode + NEWLINE);
			callback();
			}, function (err) {
			if (err) {
			console.log('Failed to process job code!');
			} else {
			fd.end();
			emitter.emit('doneJobCat', '\tDone.');
			}
			});
			 */

			/*
			async.eachSeries(matrix, function (doc, outerCallback) { //	per row (document)
			var regEx = /[\[\]]/gi;
			var terms = JSON.stringify(doc).replace(regEx, '');
			//emitter.emit('log', terms + NEWLINE);
			fd2.write(terms + NEWLINE);
			//emitter.emit('log', ++lines + ' ');
			lines++;
			fd2_idx.write(lines + ',' + terms + NEWLINE);
			outerCallback();
			}, function (err) {
			if (err) {
			console.log('Failed to process outer!');
			} else {
			//fd2.write(util.inspect(matrix));
			fd2.end();
			fd2_idx.end();
			//emitter.emit('log', NEWLINE + lines + ' rows Done.');
			emitter.emit('log', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' jobs/files processed.');

			var outFile_sort = path.join(outDir, basename_keywords_sort);
			var fd_sort = fs.createWriteStream(outFile_sort);
			emitter.emit('log', NEWLINE + 'Sorted keywords also saved to ' + outFile_sort);

			keywords.forEach(function (word) {
			fd_sort.write(word + NEWLINE);
			});
			fd_sort.end();

			//done(null, itemCounter);
			}
			});
			 */

			/*
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
			emitter.emit('doneJobCat', NEWLINE + 'Totally ' + itemCounter + '/' + listLen + ' jobs/files processed.');

			done(null, itemCounter);
			}
			});
			 */
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
				emitter.emit('doneDaily', NEWLINE + 'Totally ' + catCount + '/' + list.length + ' categories processed.');
				//if (presetList.resume)
				//	processTFIDF(dir, outDir, done, catCount);
				//else
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

function readKeywords(filename) {
	if (!fs.existsSync(filename)) {
		console.log('File "' + filename + '" not found!');
		process.exit(1);
	}

	var last = false;
	var count = 0;
	var synonyms = 0;

	async.doWhilst(
		function (callback) {
		// read all lines:
		lineReader.eachLine(filename, function (line) {
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
	fs.appendFileSync(filename_status, NEWLINE + getDateTime() + NEWLINE);

	getPreset();
	processOptions();

	var timeA = new Date().getTime();

	//if (presetList.resume)
	//	readKeywords(basename_keyword_resume);
	//else
		readKeywords(basename_keyword);

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
				process.stdout.write('\nTotally ' + totalItems + ' jobs processed.\n');
				fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + totalItems + ' jobs processed.' + NEWLINE);

				console.log('Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
				fs.appendFileSync(filename_status, NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
			}
		});
	});
}
