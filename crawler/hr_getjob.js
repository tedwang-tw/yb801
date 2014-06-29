var fs = require('fs');
var path = require('path');
var inspect = require("util").inspect;
var cheerio = require("cheerio");
var superagent = require('superagent');
var async = require('async');

var ext = '.html';
var interval = 550; //	ms


function checkHome(data) {
	var title = '104人力銀行';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.indexOf(title) === 0)
		return true; //	due to protection from server side flow control
	else
		return false;
}

function checkClosed(data) {
	var correctMsg = '錯誤頁';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.indexOf(correctMsg) !== -1) //	CV already closed
		return true;
	else
		return false;
}

function hr_getjob(options, jobs, next) {
	var header_Host = 'www.104.com.tw';
	var header_Origin = 'http://www.104.com.tw';
	var header_Referer = 'http://www.104.com.tw/jobbank/joblist/joblist.cfm?';
	var header_UserAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36';
	var header_Accept = 'text/html,application/xhtml+xml,application/xml';

	var newJobs = [];

	async.whilst(
		function () {
		return jobs.length > 0;
	},
		function (callbackOuter) {
		async.eachSeries(jobs, function (item, callback) {
			var fileName_s = path.join(options.dir, item.comCode + '_' + item.jobCode + ext);

			if (item.link.indexOf('http') === 0) { //	ignore these kind of jobs
				process.stdout.write('x');
				var filename_skip = path.join(options.dir, options.cat + '_skip.log');
				fs.appendFileSync(filename_skip, options.area + ':\r\n' + inspect(item) + '\r\n');
				return callback();
			}
			if (fs.existsSync(fileName_s)) { //	already got in last turn
				process.stdout.write('o'); //	bypass!
				return callback();
			}

			setTimeout(function () {
				superagent
				.get(header_Origin + item.link)
				.set('Accept', header_Accept)
				.set('User-Agent', header_UserAgent)
				//.set('Cookie', setcookie)
				.set('Host', header_Host)
				.set('Origin', header_Origin)
				.set('Referer', header_Referer)
				.end(function (error, res) {
					if (error) {
						newJobs.push(item); //	try later

						console.log('\n' + inspect(error));
						var filename_log = path.join(options.dir, item.comCode + '_' + item.jobCode + '.log');
						var logfile = fs.createWriteStream(filename_log);
						logfile.write("Http get error: " + error.code + ", " + error.message);
						logfile.end();
						callback('Job get error!');
					} else {
						//console.log(inspect(res.status));
						//console.log(inspect(res.header));
						//console.log('body: ' + inspect(res.body));
						//console.log('text: ' + inspect(res.text));
						if (checkClosed(res.text)) {
							process.stdout.write('*'); //	bypass!
							callback();
						} else if (checkHome(res.text)) {
							newJobs.push(item); //	try later
							process.stdout.write('X');
							callback();
						} else {
							var sfile = fs.createWriteStream(fileName_s);
							sfile.write(res.text, function () {
								sfile.end();
								process.stdout.write('.');
								callback();
							});
						}
					}
				});
			}, interval);
		}, function (err) {
			if (err) {
				console.log('A job failed to process');
			} else {
				//console.log('All page jobs have been processed successfully');
			}

			jobs = newJobs;
			newJobs = [];
			if (jobs.length > 0) {
				var filename_txt = path.join(options.dir, options.cat + '_retry.log');
				//var logfile = fs.createWriteStream(filename_txt);
				//logfile.write(options.area + '-' + options.page + ':\r\n' + inspect(jobs) + '\r\n');
				//logfile.end();
				fs.appendFileSync(filename_txt, options.area + '-' + options.page + ':\r\n' + inspect(jobs) + '\r\n');
				process.stdout.write('\nRe-try ' + jobs.length + ' failed item(s): ');
			}

			callbackOuter();
			//next();
		});
	},
		function (err) {
		next(); //	return
	});

}

module.exports = hr_getjob;
