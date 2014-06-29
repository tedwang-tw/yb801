var fs = require('fs');
var path = require('path');
var inspect = require("util").inspect;
var cheerio = require("cheerio");
var superagent = require('superagent');
var async = require('async');

var ext = '.html';

var HOPCOUNT = 5;	//	per actual case
var INCREMENT = 500; //	for backoff
var HOLDUNIT = 3000; //	for backoff
var INITINTERVAL = 1000;	//	ms

var hopInt = (INCREMENT*6);
var holdInt;		//	backoff timer
var interval;

function checkHome(data) {
	var title = '104人力銀行';
	var newTitle = '104獎助金專區';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.search(newTitle) !== -1)
		return false;
	else if (titleMsg.search(title) !== -1)
		return true; //	due to protection from server side flow control
	else
		return false;
}

function checkClosed(data) {
	var correctMsg = '找不到此機構資料';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.indexOf(correctMsg) !== -1) //	CV already closed
		return true;
	else
		return false;
}

function edu_getcourse(options, courses, next) {
	var header_Host = 'learn.104.com.tw';
	var header_Origin = 'http://learn.104.com.tw';
	var header_Referer = 'http://learn.104.com.tw/cfdocs/edu/my104/rd_listing.cfm';
	var header_UserAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36';
	var header_Accept = 'text/html,application/xhtml+xml,application/xml';

	var newCourses = [];
	
	var hopStep = 0;
	holdInt = HOLDUNIT;		//	backoff timer
	interval = INITINTERVAL;

	async.whilst(
		function () {
		return courses.length > 0;
	},
		function (callbackOuter) {
		async.eachSeries(courses, function (item, callback) {
			var fileName_s = path.join(options.dir, item.comCode + '_' + item.classCode + ext);

			/*
			if (item.link.indexOf('http') === 0) { //	ignore these kind of courses
			process.stdout.write('x');
			var filename_skip = path.join(options.dir, options.cat + '_skip.log');
			fs.appendFileSync(filename_skip, options.area + ':\r\n' + inspect(item) + '\r\n');
			return callback();
			}
			 */

			if (fs.existsSync(fileName_s)) { //	already got in last turn
				process.stdout.write('o'); //	bypass!
				return callback();
			}

			setTimeout(function () {
				superagent
				.get(item.link)
				.set('Accept', header_Accept)
				.set('User-Agent', header_UserAgent)
				//.set('Cookie', setcookie)
				.set('Host', header_Host)
				//.set('Origin', header_Origin)
				.set('Referer', header_Referer)
				.end(function (error, res) {
					if (error) {
						newCourses.push(item); //	try later

						console.log('\n' + inspect(error));
						var filename_log = path.join(options.dir, item.comCode + '_' + item.classCode + '.log');
						var logfile = fs.createWriteStream(filename_log);
						logfile.write("Http get error: " + error.code + ", " + error.message);
						logfile.end();
						callback('Course get error!');
					} else {
						//console.log(inspect(res.status));
						//console.log(inspect(res.header));
						//console.log('body: ' + inspect(res.body));
						//console.log('text: ' + inspect(res.text));

						if (checkClosed(res.text)) {
							process.stdout.write('*'); //	bypass!
							//callback();
						} else if (checkHome(res.text)) {
							newCourses.push(item); //	try later
							process.stdout.write('X');
							//callback();
						} else {
							var sfile = fs.createWriteStream(fileName_s);
							sfile.write(res.text, function () {
								sfile.end();
								process.stdout.write('.');
								//callback();
							});
						}

						hopStep++;
						if (hopStep % HOPCOUNT === 0)
							setTimeout(callback, hopInt);
						else
							callback();
					}
				});
			}, interval);
		}, function (err) {
			if (err) {
				console.log('A course failed to process');
			} else {
				//console.log('All page courses have been processed successfully');
			}

			courses = newCourses;
			newCourses = [];

			if (courses.length > 0) {
				var filename_txt = path.join(options.dir, options.cat + '_retry.log');
				//var logfile = fs.createWriteStream(filename_txt);
				//logfile.write(options.area + '-' + options.page + ':\r\n' + inspect(courses) + '\r\n');
				//logfile.end();
				fs.appendFileSync(filename_txt, options.area + '-' + options.page + ':\r\n' + inspect(courses) + '\r\n');
				process.stdout.write('\nRe-try ' + courses.length + ' failed item(s): ');

				interval += INCREMENT;
				setTimeout(callbackOuter, holdInt);
				holdInt += HOLDUNIT;

				hopStep = 0; //	reset
			} else {
				callbackOuter();
			}
		});
	},
		function (err) {
		next(); //	return
	});

}

/*
var eduListCourse = require('./edu_courselist');
var testUrl = 'http://learn.104.com.tw/cfdocs/edu/my104/rd_listing.cfm';
var courseList = [];
var options1 = {
	dir : 'edu/tmp',
	cat : '2007001000',
	area : '', //	'6001001000',
	page : 63
};

eduListCourse(testUrl, {
	jobCat : options1.cat,
	pageNum : options1.page,
	checkCount : false,
	area : options1.area
}, function (courseList1) {
	courseList = courseList1;
	console.log(courseList1);

	console.log('Course len = ' + courseList.courses.length);
	edu_getcourse(options1, courseList.courses, function () {});
});
*/

module.exports = edu_getcourse;
