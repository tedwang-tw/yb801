var fs = require('fs');
var request = require('request');
var cheerio = require("cheerio");

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

function scrapData(srcData, targetFile) {
	var catItem = '#tab_home_jobcat';
	var catAttr = 'no';

	var $ = cheerio.load(srcData);

	var catList = [];

	$(catItem + ' ' + 'li').each(function (i, e) {
		var link = $(e).find("a");
		var catName = link.text();
		var catCode = $(e).attr(catAttr);
		var catRecord = catName + ": " + catCode + ", <" + link.attr("href") + ">";

		catList.push(catCode);

		if (targetFile)
			fs.appendFileSync(targetFile, catRecord + '\n');
		console.log((i + 1) + '. ' + catRecord);
	});

	return catList;
}

/*
var file = 'job_cat.html';
var outfile = 'job_cat_Static.txt';

var fileData = fs.readFileSync(file, 'utf8');
scrapData(fileData, outfile);
 */

var urlHome = "http://www.104.com.tw";
var postfix = '';

function hr_jobcat(callback) {
	download(urlHome + postfix, function (data) {
		//var targetFile = 'job_cat_Dynamic.txt';
		//fs.appendFileSync('response.html', data);
		callback(scrapData(data));
	});
}

module.exports = hr_jobcat;
