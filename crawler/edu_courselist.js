var request = require("request");
var fs = require('fs');
var path = require('path');
var util = require("util");
var inspect = util.inspect;
var cheerio = require("cheerio");
var superagent = require('superagent');
var async = require('async');

var header_Host = 'learn.104.com.tw';
var header_Origin = 'http://learn.104.com.tw';
var header_Referer = 'http://learn.104.com.tw/cfdocs/edu/search/mixsearch.cfm';
var header_UserAgent = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:29.0) Gecko/20100101 Firefox/29.0';
var header_Accept = 'text/html,application/xhtml+xml,application/xml';

var HOPCOUNT = 5; //	per actual case
var HOLDUNIT = 3000; //	for backoff
var INCREMENT = 500; //	for backoff

var holdInt; //	backoff timer
var hopInt = (INCREMENT * 6);

// Utility function that downloads a URL and invokes
// callback with the data.
function download(url, options, callback) {
	if (!options.area)
		options.area = '';

	//console.log('http request: ' + url);
	//console.log('options: ' + util.inspect(options));

	superagent
	.post(url)
	.type('form')
	.send({
		job_no : options.jobCat
	})
	.send({
		Job1 : ''
	})
	.send({
		Job2 : options.jobCat
	})
	.send({
		area : options.area
	})
	.set('Accept', header_Accept)
	//.set('User-Agent', header_UserAgent)
	//.set('Cookie', setcookie)
	.set('Host', header_Host)
	//.set('Origin', header_Origin)
	.set('Referer', header_Referer)
	.end(function (error, res) {
		if (error) {
			console.log('err code: ' + error.code);
			console.log('err msg: ' + error.message);
			callback(null);
		} else {
			callback(res.text);
		}
	});
}

function downloadGet(url, options, callback) {
	if (!options.area)
		options.area = '';

	//console.log('http request: ' + url);
	//console.log('options: ' + util.inspect(options));

	superagent
	.get(url)
	.query({
		job_no : options.jobCat
	})
	.query({
		page : options.pageNum
	})
	.query({
		area : options.area
	})
	.set('Accept', header_Accept)
	//.set('User-Agent', header_UserAgent)
	//.set('Cookie', setcookie)
	.set('Host', header_Host)
	//.set('Origin', header_Origin)
	.set('Referer', header_Referer)
	//.set('Cache-Control' , 'max-age=0')
	//.set('Connection', 'keep-alive')
	//.set('DNT', '1')
	.end(function (error, res) {
		if (error) {
			console.log('err code: ' + error.code);
			console.log('err msg: ' + error.message);
			callback(null);
		} else {
			callback(res.text);
			/*
			var tmp = res.text;			
			setImmediate(function() {
				callback(tmp);
				tmp = null;
			});
			*/
		}
	});
}

function downloadGetReq(url, options, callback) {
	//console.log('http request: ' + url);

	if (!options.area)
		options.area = '';

	var formBody = {
		job_no : options.jobCat,
		Job1 : '',
		Job2 : options.jobCat,
		area : options.area
	};
	var qsBody = {
		job_no : options.jobCat,
		page : options.pageNum,
		area : options.area
	};
	var reqOptions = {
		url : url,
		method : options.method,	//'POST',
		headers : {
			'Accept' : header_Accept,
			//'User-Agent': header_UserAgent,
			//'Cookie': setcookie,
			'Host' : header_Host,
			//'Origin': header_Origin,
			'Referer' : header_Referer
		},
		form : formBody,
		qs : qsBody
	};

	request(reqOptions, function (err, res, body) {
		if (err) {
			throw err;
		}
		callback(body);
		/*
		var tmp = body;
		setImmediate(function() {
			callback(tmp);
			tmp = null;
		});
		*/
		/*
		console.log(inspect({
				err : err,
				res : {
					statusCode : res.statusCode,
					headers : res.headers
				},
				body : JSON.parse(body)
			}));
		*/
	});
}

function checkHome(data) {
	var title = '104人力銀行';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.search(title) !== -1) {
		//delete $;
		return true; //	due to protection from server side flow control
	} else {
		//delete $;
		return false;
	}
}

var logNum = 1;

function scrapData(srcData, options, targetFile) {
	var topTdAttr = 'valign';
	var topTdValue = 'top';
	var startPos = 3; //	per actual web content
	var linkColumnPos = 1;

	var courseList = {
		roleCount : 0,
		courses : []
	};

	if (checkHome(srcData)) {
		//srcData = null;
		courseList.roleCount = -1;
		console.log('\nPage no list info! Retry...');
		return courseList;
	}

	var $ = cheerio.load(srcData);

	console.log('\ncheckCount: ' + options.checkCount);

	if (options.checkCount) {
		var roleCountObj = $('#hot_tit').find('span').first();
		var roleCount = 0;

		if (roleCountObj.length > 0)
			roleCount = parseInt(roleCountObj.text().split('(')[1], 10);
		courseList.roleCount = roleCount;

		//srcData = null;
		//delete $;
		
		return courseList;
	} else {
		//return courseList;
	}

	//*
	var topTd = $('body').children('table').eq(1).children('tr').children('td');

	if (topTd.attr(topTdAttr) === topTdValue) {
		var list = topTd.children('table').eq(startPos).children('form').children('tr');
		//console.log('List len = ' + list.length);

		list.each(function (i, e) {
			var link = $(e).find('td').eq(linkColumnPos).find('a');
			var linkHref = link.attr("href");
			var linkName = link.text();
			if (linkName) {
				var courseStr = linkHref.split('=');
				var classCode = parseInt(courseStr[1], 10);
				var comCode = parseInt(courseStr[2], 10);
				var courseRecord = linkName + ": " + linkHref;

				courseList.courses.push({
					comCode : comCode,
					classCode : classCode,
					link : linkHref
				});

				if (targetFile)
					fs.appendFileSync(targetFile, courseRecord + '\n');
				//console.log((i + 1) + '. ' + courseRecord);
			}
		});
	}

	if (courseList.courses.length === 0) {
		console.log('\nWrong way!');

		var filename_joblist = 'course_noLink.html';
		var sfile = fs.createWriteStream(filename_joblist);
		sfile.write(srcData, function () {
			sfile.end();
			console.log(filename_joblist);
		});
	}

	return courseList;
	//*/
}

function edu_courselist(url, options, callback) {
	var courseList;
	holdInt = HOLDUNIT; //	backoff timer
	var hopStep = 0;

	async.doWhilst(
		function (callbackOuter) {
		options.method = 'GET';
		downloadGet(url, options, function (data) {
			courseList = scrapData(data, options);

			if (courseList.roleCount === -1) {
				setTimeout(callbackOuter, holdInt);
				holdInt += HOLDUNIT;
			} else {
				hopStep++;
				if (hopStep % HOPCOUNT === 0)
					setTimeout(callbackOuter, hopInt);
				else
					callbackOuter();
			}
		});
	},
		function () {
		if (options.checkCount)
			return (courseList.roleCount === -1);
		else
			return (courseList.courses.length === 0);
	},
		function (err) {
		callback(courseList);
		//if (typeof gc === 'function') 
		//	gc();
	});
}

/*
var testUrl = 'http://learn.104.com.tw/cfdocs/edu/my104/rd_listing.cfm';

edu_courselist(testUrl, {
	jobCat : '2001002000',
	pageNum : '1',
	checkCount : true,
	//area : '6001001000'
}, function (courseList) {
	console.log(courseList);
});
edu_courselist(testUrl, {
	jobCat : '2001002000',
	pageNum : '1',
	checkCount : false,
	//area : '6001001000'
}, function (courseList) {
	console.log(courseList);
});
//*/

module.exports = edu_courselist;
