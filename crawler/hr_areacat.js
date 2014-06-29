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

function scrapData(srcData, stepItem, targetFile) {
	var cateItem = '.cate-list';
	var areaAttr = 'no';

	var $ = cheerio.load(srcData);
	var cateList = $(stepItem + ' ' + cateItem);

	var areaList = [];

	$(cateList).find('li').each(function (i, e) {
		var link = $(e).find("a");
		var areaName = $(link).text();
		var areaCode = link.attr(areaAttr);
		var areaRecord = areaName + ": " + areaCode;

		areaList.push(areaCode);

		if (targetFile)
			fs.appendFileSync(targetFile, areaRecord + '\n');
		console.log((i + 1) + '. ' + areaRecord);
	});

	return areaList;
}

/*
var file = 'cat_step_area.html';
var outfile = 'area_list_Static.txt';
var fileData = fs.readFileSync(file, 'utf8');

scrapData(fileData, '.third-step', outfile);
 */

var urlHome = "http://www.104.com.tw";
var postfix = '/jb/category/?cat=2';

function hr_areacat(callback) {

	download(urlHome + postfix, function (data) {
		//var targetFile = 'area_list_Dynamic.txt';
		//fs.appendFileSync('response.html', data);
		callback(scrapData(data, '.first-step-area'));
	});
}

module.exports = hr_areacat;
