//var http = require("http");
var fs = require('fs');
var path = require('path');
//var util = require("util");
var cheerio = require("cheerio");
var superagent = require('superagent');
var async = require('async');

// Utility function that downloads a URL and invokes
// callback with the data.
function download(url, options, callback) {
	var jobsource = '104_bank1';
	var role = '1'; //	full time
	var order = '2'; //	by modification time

	var disFlag = 'list';
	var returnUrl = 'http://pda.104.com.tw/forward.cfm?fun_code=14dsafdfdf';
	var pageRecords = '30';

	var header_Host = 'www.104.com.tw';
	var header_Origin = 'http://www.104.com.tw';
	//var header_Referer = 'http://www.104.com.tw/jb/category/?cat=1&no=2007001000&step=area';
	var header_UserAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36';
	var header_Accept = 'text/html,application/xhtml+xml,application/xml';

	//console.log('http request: ' + url);

	superagent
	.post(url)
	.query({
		jobsource : jobsource
	})
	.query({
		ro : role
	})
	.query({
		jobcat : options.jobCat
	})
	.query({
		area : options.area
	})
	.query({
		order : order
	})
	.query({
		asc : options.sort
	})
	.query({
		page : options.pageNum
	})
	.type('form')
	.send({
		return_url : returnUrl
	})
	.send({
		url_destination : ''
	})
	.send({
		dis_flag : disFlag
	})
	.send({
		pagerecords : pageRecords
	})
	.send({
		flagload : '1'
	})
	.send({
		kwslog : ''
	})
	.set('Accept', header_Accept)
	//.set('User-Agent', header_UserAgent)
	//.set('Cookie', setcookie)
	.set('Host', header_Host)
	.set('Origin', header_Origin)
	.set('Referer', header_Origin)
	.end(function (error, res) {
		if (error) {
			console.log('err code: ' + error.code);
			console.log('err msg: ' + error.message);
			callback(null);
		} else {
			callback(res.text);
		}
	});

	/*
	request(
	url,
	function (err, res, body) {
	if (err) {
	console.log('err code: ' + err.code);
	console.log('err msg: ' + err.message);
	callback(null);
	} else {
	callback(body);
	}
	});
	 */
}

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

var logNum = 1;

function scrapData(srcData, options, targetFile) {
	var jobItem = '.j_cont';
	var jobTag = '.jobname';
	var comTag = '.compname';
	var comCodeAttr = 'input[name="custno_item"]';
	var jobCodeAttr = 'input[type="checkbox"]';
	//var jobCodeAttr = 'input[name="cookie_names"]';
	var codeAttr = 'value';

	var jobList = {
		roleCount : 0,
		jobs : []
	};

	if (checkHome(srcData)) {
		jobList.roleCount = -1;
		console.log('\nPage no list info! Retry...');
		return jobList;
	}

	var $ = cheerio.load(srcData);

	if (options.checkCount) {
		var roleCountObj = $('#joblist_selectall').find('.joblist_bar').find('.right');
		var roleCount = 0;

		if (roleCountObj.length > 0)
			roleCount = parseInt(roleCountObj.text().split(' ')[1], 10);
		jobList.roleCount = roleCount;

		/*
		if (isNaN(roleCount)) {
		var logfile = fs.createWriteStream('Nanlog/NaNdata' + (logNum++) + '.html');
		logfile.write(srcData);
		logfile.end();
		} else {
		var logfile2 = fs.createWriteStream('Nanlog/OKdata' + (logNum++) + '.html');
		logfile2.write(srcData);
		logfile2.end();
		}
		 */

		return jobList;
	}

	$(jobItem).each(function (i, e) {
		//var link = $(e).find("a").attr("href");
		var comLink = $(e).find(comTag).find("a");
		var comName = $(comLink).find('span').text();
		var comCode = $(e).find(comCodeAttr).attr(codeAttr);
		var jobLink = $(e).find(jobTag).find("a");
		var jobName = $(jobLink).find('span').text();
		var jobLinkHref = jobLink.attr("href");
		var jobCode = $(e).find(jobCodeAttr).attr(codeAttr).split(',').shift(); //	split + shift is to remove the ','
		var jobRecord = comName + '(' + comCode + ')' + ": " + jobName + '(' + jobCode + ')' + ", <" + jobLinkHref + ">";

		jobList.jobs.push({
			comCode : comCode,
			jobCode : jobCode,
			link : jobLinkHref
		});

		if (targetFile)
			fs.appendFileSync(targetFile, jobRecord + '\n');
		//console.log((i + 1) + '. ' + jobRecord);
	});

	if (jobList.jobs.length === 0) {
		console.log('\nPage no link info! Retry...');
		/*
		var filename_joblist = path.join(options.dir, options.jobCat + '_' + options.area + '_' + options.pageNum + '_noLink.html');
		var sfile = fs.createWriteStream(filename_joblist);
		sfile.write(srcData, function () {
		sfile.end();
		console.log(filename_joblist);
		});
		 */
	}

	return jobList;
}

function hr_joblist(url, options, callback) {
	var jobList;

	async.doWhilst(
		function (callbackOuter) {
		download(url, options, function (data) {
			//var targetFile = 'job_list_Dynamic.txt';
			//fs.appendFileSync('response.html', data);
			jobList = scrapData(data, options);
			callbackOuter();
		});
	},
		function () {
		if (options.checkCount)
			return (jobList.roleCount === -1);
		else
			return (jobList.jobs.length === 0);
	},
		function (err) {
		callback(jobList);
	});
}

module.exports = hr_joblist;
