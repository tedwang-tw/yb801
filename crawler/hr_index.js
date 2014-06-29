var jobCat = require('./hr_jobcat');
var areaCat = require('./hr_areacat');
var jobList = require('./hr_joblist');
var getJob = require('./hr_getjob');

var inspect = require('util').inspect;
var async = require('async');
var sprintf = require("sprintf-js").sprintf;
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var os = require('os');

var topDir = path.join(__dirname, 'raw/104/job');
var dir = topDir;

var urlHome = 'http://www.104.com.tw/jobbank/joblist/joblist.cfm?';
var postfix = '';
var url = urlHome + postfix;
var pageMax = 30;
var upLimit = 3000;
var pageCountMax = upLimit / pageMax;

var filename_preset = path.join(__dirname, 'hr_config.json');
var presetList;

var isNormal = true; //	run as service or not
var evlog;

function newDir() {
	var d = new Date();

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	dir = path.join(topDir, '/' + curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date));
	console.log("Destination: " + dir);

	if (!fs.existsSync(dir)) {
		console.log("Creating dir " + dir);
		mkdirp.sync(dir);

		if (!fs.existsSync(dir)) {
			process.stderr.write("Unable to create dir " + dir);
		}
	}

	return dir;
}

function newDirCat(parentDir, cat) {
	dir = path.join(parentDir, '/' + cat);
	console.log("Destination: " + dir);

	if (!fs.existsSync(dir)) {
		console.log("Creating dir " + dir);
		mkdirp.sync(dir);

		if (!fs.existsSync(dir)) {
			process.stderr.write("Unable to create dir " + dir);
		}
	}
}

function getJobsByAllPages(params, options, callbackOuter) {
	if (params.pages === 0)
		return callbackOuter(null, params.pages);

	var count = 0;
	var filename_link = path.join(dir, params.cat + '_' + params.area + '_sort' + params.sort + '.txt');
	var logfile = fs.createWriteStream(filename_link);

	console.log("\nPage count = " + params.pages + ', sort = ' + params.sort);

	options.sort = params.sort;

	//	get jobs page by page
	async.whilst(
		function () {
		return ++count <= params.pages;
	},
		function (callbackInner) {
		console.log('\npage# ' + options.pageNum);
		jobList(url, options, function (jobsObj) {
			//	debug
			for (var k = 0; k < jobsObj.jobs.length; k++) {
				//console.log(inspect(jobsObj.jobs[i]));
				logfile.write(jobsObj.jobs[k].comCode + '_' + jobsObj.jobs[k].jobCode + ": " + jobsObj.jobs[k].link + '\r\n');
			}

			getJob({
				dir : dir,
				cat : params.cat,
				area : params.area,
				page : options.pageNum
			}, jobsObj.jobs, function () {
				options.pageNum++;
				callbackInner();
			});
		});
	},
		function (err) {
		logfile.end();
		callbackOuter(null, params.pages);
	});
}

function getPreset() {
	if (fs.existsSync(filename_preset)) {
		presetList = JSON.parse(fs.readFileSync(filename_preset, 'utf8'));
		console.log('Read ' + filename_preset + ' ok.');
	} else { //	empty means count all
		presetList = {
			"cat" : [],
			"area" : []
		};
	}
	console.log(presetList);
}

function checkPresetCat(cat) {
	if (presetList.cat.length === 0)
		return true;
	else {
		for (var i = 0; i < presetList.cat.length; i++)
			if (cat == presetList.cat[i])
				return true;
		return false; //	no match
	}
}

function checkPresetArea(area) {
	if (presetList.area.length === 0)
		return true;
	else {
		for (var i = 0; i < presetList.area.length; i++)
			if (area == presetList.area[i])
				return true;
		return false; //	no match
	}
}

if (os.type() == 'Windows_NT' || os.platform() == 'win32') {
	/*
	the node-windows default path is C:\Windows\System32,
	we need to switch back to our own working directory.
	 */
	var dirDaemon = path.join(__dirname, 'daemon');

	if (fs.existsSync(dirDaemon)) {
		fs.readdir(dirDaemon, function (err, list) {
			if (err) {
				console.log('Check daemon folder failed!');
				return;
			}
			for (var i = 0; i < list.length; i++) {
				var file = list[i++];
				if (!file)
					break;
				if (path.extname(file) == '.exe' || path.extname(file) == '.xml') {
					isNormal = false; //	invoked as background process
					break;
				}
			}
			if (isNormal) {
				console.log('Normally start as a foreground process.');
			} else {
				var EventLogger = require('node-windows').EventLogger;
				evlog = new EventLogger('HR Data Logger');
				//topDir = path.join(__dirname, dir);
				//dir = topDir;
				evlog.info('Working directory: ' + dir, 1000, function () {});
			}
		});
	}
}

jobCat(function (catList) {
	var parentDir = newDir();
	var filename_cat = path.join(parentDir, 'job_cat.txt');
	var jobcatfile = fs.createWriteStream(filename_cat);

	jobcatfile.write(inspect(catList), function () {
		jobcatfile.end();
	});
	getPreset();

	areaCat(function (areaList) {
		var i = 0;
		var catLength = catList.length;
		var filename_area = path.join(parentDir, 'area_cat.txt');
		var areacatfile = fs.createWriteStream(filename_area);

		areacatfile.write(inspect(areaList), function () {
			areacatfile.end();
		});

		(function nextCat() {
			console.log('i = ' + i);

			if (i >= catLength) {
				var doneMsg = 'HR data collection done.';
				if (!isNormal) {
					evlog.info(doneMsg, 1000, function () {});
				}
				console.log('\n' + doneMsg);
				return; //	done
			}

			if (!checkPresetCat(catList[i])) {
				i++;
				return nextCat(); //	bypass
			}
			newDirCat(parentDir, catList[i]);

			async.eachSeries(areaList, function (item, callback) {
				var options = {
					jobCat : catList[i],
					area : item,
					sort : '0', //ascending
					pageNum : '1',
					dir : dir
				};

				if (item.split(',').length > 1) {
					console.log('Bypass multi areas: ' + item);
					return callback(); //	bypass the multi-areas
				}

				if (!checkPresetArea(item)) {
					return callback(); //	bypass
				}

				options.checkCount = true; //	first get jobs total count per 'cat + area' conditions

				jobList(url, options, function (jobsList) {
					console.log(catList[i] + '_' + item + ': ' + jobsList.roleCount);

					options.checkCount = false;

					var pages = Math.floor(jobsList.roleCount / pageMax);
					var getReverse = false;
					pages += (jobsList.roleCount % pageMax === 0) ? 0 : 1;
					if (pages > pageCountMax) {
						pages = pageCountMax;
						getReverse = true;
					}

					async.series([
							function (callbackInner) { //	ascending
								getJobsByAllPages({
									cat : catList[i],
									area : item,
									pages : pages,
									sort : '0'
								}, options, callbackInner);
							},
							function (callbackInner) { //	descending
								if (getReverse) {
									var rest = jobsList.roleCount - (pages * pageMax);
									pages = Math.floor(rest / pageMax);
									pages += (rest % pageMax === 0) ? 0 : 1;
									options.pageNum = 1; //	reset

									getJobsByAllPages({
										cat : catList[i],
										area : item,
										pages : pages,
										sort : '1'
									}, options, callbackInner);
								} else {
									callbackInner(null, 0); //	done
								}
							}
						],
						function (err, results) {
						var filename_status = path.join(dir, catList[i] + '_status.log');
						var status = catList[i] + '_' + item + ': ' + jobsList.roleCount + '(' + results[0] + ',' + results[1] + ')';
						fs.appendFileSync(filename_status, status + '\r\n');
						console.log('\nDone asc/desc pages: ' + jobsList.roleCount + '(' + results[0] + ',' + results[1] + ')');

						callback(); //	next area
					});
				});
			}, function (err) {
				if (err) {
					// One of the iterations produced an error.
					// All processing will now stop.
				} else {
					//console.log('All areas have been processed successfully');
					i++;
					nextCat();
				}
			});
		})();
	});
});
