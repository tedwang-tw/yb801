var jobCat = require('./edu_jobcat');
var areaCat = require('./edu_areacat');
var listCourse = require('./edu_courselist');
var getCourse = require('./edu_getcourse');

var inspect = require('util').inspect;
var async = require('async');
var sprintf = require("sprintf-js").sprintf;
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var os = require('os');

//var memwatch = require('memwatch');
//var heapdump = require('heapdump');
var logHeap = false;
var initHeapMsg = '';
var beginHeapMsg = '';

var topDir = path.join(__dirname, 'raw/104/edu');
var dir = topDir;

var urlHome = 'http://learn.104.com.tw/cfdocs/edu/my104/rd_listing.cfm';
var postfix = '';
var url = urlHome + postfix;
var pageMax = 15;
var upLimit = 6000; //	must be multiples of pageMax
var pageCountMax = upLimit / pageMax;

var filename_preset = path.join(__dirname, 'edu_config.json');
var presetList;

var byArea = false;

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

function getCoursesByAllPages(params, options, callbackOuter) {
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
		listCourse(url, options, function (coursesObj) {
			//	debug
			for (var k = 0; k < coursesObj.courses.length; k++) {
				//console.log(inspect(coursesObj.courses[i]));
				logfile.write(coursesObj.courses[k].comCode + '_' + coursesObj.courses[k].classCode + ": " + coursesObj.courses[k].link + '\r\n');
			}

			getCourse({
				dir : dir,
				cat : params.cat,
				area : params.area,
				page : options.pageNum
			}, coursesObj.courses, function () {
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
	else if (!byArea && area === '') { //	don't care
		console.log('Area dont care.');
		return true;
	} else {
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

initHeapMsg = process.memoryUsage();
/*
var hd = new memwatch.HeapDiff();
memwatch.on('leak', function(info) {
console.log('\r\n' + inspect(info));
});
var gcCount = 0;
memwatch.on('stats', function(stats) {
gcCount++;
console.log('\n------------------------------------- GC times = ' + gcCount);
console.log(process.memoryUsage());
console.log('usage_trend: ' + stats.usage_trend);
});
 */

jobCat(function (catList) {
	var parentDir = newDir();
	var filename_cat = path.join(parentDir, 'job_cat.txt');
	var jobcatfile = fs.createWriteStream(filename_cat);

	jobcatfile.write(inspect(catList), function () {
		jobcatfile.end();
	});
	getPreset();

	areaCat(function (areaList) {
		var catLength = catList.length;
		var filename_area = path.join(parentDir, 'area_cat.txt');
		var areacatfile = fs.createWriteStream(filename_area);

		areacatfile.write(inspect(areaList), function () {
			areacatfile.end();
		});

		if (!byArea)
			areaList = ['']; //	don't care

		if (logHeap) {
			console.log('write heap dump...');
			//heapdump.writeSnapshot('./begin_' + Date.now() + '.heapsnapshot');
			console.log('ok.');
		}
		beginHeapMsg = process.memoryUsage();

		var i = 0;

		async.whilst(
			function () {
			return i < catLength;
		},
			function (areaCB) {
			console.log('i = ' + i);

			console.log('In cat: ' + catList[i]);
			if (!checkPresetCat(catList[i])) {
				i++;
				return areaCB();
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

				listCourse(url, options, function (coursesList) {
					console.log(catList[i] + '_' + item + ': ' + coursesList.roleCount);

					//return callback(); //	---------------------------------------

					//if (coursesList.roleCount > pageMax) {
					//	coursesList.roleCount = pageMax;
					//}

					//*
					options.checkCount = false;

					var pages = Math.floor(coursesList.roleCount / pageMax);
					var getReverse = false;
					pages += (coursesList.roleCount % pageMax === 0) ? 0 : 1;
					if (pages > pageCountMax) {
						pages = pageCountMax;
						getReverse = true;
					}

					async.series([
							function (callbackInner) { //	ascending
								getCoursesByAllPages({
									cat : catList[i],
									area : item,
									pages : pages,
									sort : '0'
								}, options, callbackInner);
							},
							function (callbackInner) { //	descending
								if (getReverse) {
									var rest = coursesList.roleCount - (pages * pageMax);
									pages = Math.floor(rest / pageMax);
									pages += (rest % pageMax === 0) ? 0 : 1;
									options.pageNum = 1; //	reset

									getCoursesByAllPages({
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
						var status = catList[i] + '_' + item + ': ' + coursesList.roleCount + '(' + results[0] + ',' + results[1] + ')';
						fs.appendFileSync(filename_status, status + '\r\n');
						console.log('\nDone asc/desc pages: ' + coursesList.roleCount + '(' + results[0] + ',' + results[1] + ')');

						callback(); //	next area
					});
				});
			}, function (err) {
				if (err) {
					// One of the iterations produced an error.
					// All processing will now stop.
				} else {
					//console.log('All areas have been processed successfully');
				}

				i++;
				areaCB();
			});
		},
			function (errArea) {
			if (errArea) {}

			var doneMsg = 'HR data collection done.';
			if (!isNormal) {
				evlog.info(doneMsg, 1000, function () {});
			}
			console.log('\n' + doneMsg);

			//var diff = hd.end();
			//console.log('\r\n' + inspect(diff));
			console.log('\nInit heap: ' + inspect(initHeapMsg));
			console.log('begin heap: ' + inspect(beginHeapMsg));
			//loop();
		});

		return;

		/*
		var i = 0;

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
		 */
	});
});

var t;
var cnt = 0;
function loop() {
	process.stdout.write('.');
	//console.log(process.memoryUsage());
	if (++cnt % 15 === 0)
		if (typeof global.gc === 'function') {
			console.log(process.memoryUsage());
			global.gc();
		}
	setTimeout(loop, 1000);
}

function endloop() {
	console.log(process.memoryUsage());

	if (logHeap) {
		console.log('write heap dump...');
		//heapdump.writeSnapshot('./end_' + Date.now() + '.heapsnapshot');
		console.log('ok.');
	}

	if (global.gc) {
		//console.log('GC...');
		//global.gc();
	}

	console.log(process.memoryUsage());

	if (logHeap) {
		console.log('write heap dump...');
		//heapdump.writeSnapshot('./gc_' + Date.now() + '.heapsnapshot');
		console.log('ok.');
	}
}
