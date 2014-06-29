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
	var areaAttr = 'name';
	var areaValue = 'area';
	var areaOptionValue = 'value';

	var $ = cheerio.load(srcData);

	var areaList = [];
	var found = false;

	$('select').each(function (i, e) {
		if (!found) {
			if ($(e).attr(areaAttr) === areaValue) {
				found = true;
				$(e).children('option').each(function (j, item) {
					var areaCode = $(item).attr(areaOptionValue);
					if (areaCode !== '') {
						areaList.push(areaCode);

						var areaName = $(item).text();
						var areaRecord = areaName + ": " + areaCode;
						if (targetFile)
							fs.appendFileSync(targetFile, areaRecord + '\n');
						console.log(areaRecord);
					}
				});
			}
		}
	});

	if (!found) {
		console('Areas not found!');
	}

	return areaList;
}

/*
var file = 'cat_step_area.html';
var outfile = 'area_list_Static.txt';
var fileData = fs.readFileSync(file, 'utf8');

scrapData(fileData, '.third-step', outfile);
 */

var urlHome = "http://learn.104.com.tw/cfdocs/edu/search/mixsearch.cfm";
var postfix = '';

function edu_areacat(callback) {

	download(urlHome + postfix, function (data) {
		//var targetFile = 'area_list_Dynamic.txt';
		//fs.appendFileSync('response.html', data);
		callback(scrapData(data));
	});
}

/*
edu_areacat(function (areas) {
	console.log(areas);
});
*/

module.exports = edu_areacat;
