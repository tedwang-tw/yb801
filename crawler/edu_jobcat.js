var fs = require('fs');
var request = require('request');
var cheerio = require("cheerio");
var superagent = require('superagent');
var inspect = require("util").inspect;

var JOBCAT_JS = "jsonJobCat.js";
var CAT_STRING = 'jsonJobCatRoot';

var urlHome = "http://learn.104.com.tw";
var postfix = '/cfdocs/edu/search/mixsearch.cfm';

// Utility function that downloads a URL and invokes
// callback with the data.
function download(url, callback) {
	console.log('http request: ' + url);

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
}

function downloadScript(url, callback) {
	var header_Host = 'learn.104.com.tw';
	var header_Origin = 'http://learn.104.com.tw';
	var header_Accept = 'text/html,application/xhtml+xml,application/xml';

	console.log('Script url: ' + url);

	superagent
	.get(url)
	//.set('Accept', header_Accept)
	//.set('User-Agent', header_UserAgent)
	//.set('Cookie', setcookie)
	//.set('Host', header_Host)
	//.set('DNT', '1')
	//.set('Origin', header_Origin)
	//.set('Referer', header_Referer)
	.end(function (error, res) {
		if (error) {
			console.log('\nError: ' + inspect(error));
			callback('');
		} else {
			callback(res.text);
		}
	});
}

function scrapData(srcData, url) {
	var catList = [];
	var found = false;

	if (srcData && (srcData.search(CAT_STRING) !== -1)) {
		var LEVEL_LIST = 'n';
		var CAT_CODE = 'no';

		found = true;
		eval(srcData); //	will got the json object: JobCatRoot

		var firstLevel = JobCatRoot[LEVEL_LIST];
		//console.log('1st levels: ' + firstLevel.length);
		
		for (var i = 0; i < firstLevel.length; i++) {
			var secondLevel = firstLevel[i][LEVEL_LIST];
			//console.log('2nd levels: ' + secondLevel.length);
			for (var j = 0; j < secondLevel.length; j++) {
				catList.push(secondLevel[j][CAT_CODE]);
				console.log(secondLevel[j].des + ': ' + secondLevel[j][CAT_CODE]);
			}
		}
	}

	if (!found) {
		console.log('Incorrect JS! ' + url);
		if (srcData) {
			var targetFile = 'response.html';
			var file_resp = fs.createWriteStream(targetFile);
			file_resp.write(srcData, function () {
				file_resp.end();
			});
		}
	}

	return catList;
}

function getScript(srcData, callback) {
	var catItem = 'script';
	var catAttr = 'src';

	var $ = cheerio.load(srcData);

	var found = false;

	$(catItem).each(function (i, e) {
		if (!found) {
			var link = $(e).attr(catAttr);
			//console.log(link);
			if (link && (link.search(JOBCAT_JS) !== -1)) {
				found = true;
				download(urlHome + link, function (data) {
					callback(scrapData(data, link));
				});
			}
		}
	});

	if (!found) {
		console.log('Wrong way!');
		callback([]);
	}
}

function edu_jobcat(callback) {
	download(urlHome + postfix, function (data) {
		getScript(data, callback);
	});
}

/*
edu_jobcat(function (list) {
console.log(list);
});
*/

module.exports = edu_jobcat;
