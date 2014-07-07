var itGlossary = require('./it_glossary');

var inspect = require('util').inspect;
var async = require('async');
var sprintf = require("sprintf-js").sprintf;
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
//var os = require('os');

var events = require('events');
var cheerio = require("cheerio");
var superagent = require('superagent');

var emitter = new events.EventEmitter();

var NEWLINE = '\r\n';

function checkHome(data, options) {
	return false;

	var title = 'Techopedia - Where IT and Business Meet';
	var headTag = 'head';
	var titleTag = 'title';
	var $ = cheerio.load(data);
	var titleMsg = $(headTag).find(titleTag).text().trim();

	if (titleMsg.indexOf(title) === 0)
		return true; //	due to protection from server side flow control
	else
		return false;
}

function checkClosed(data, options) {
	var correctMsg = 'Sorry';
	var errorTag = '#MainContent_leftColumnPlaceHolder_divErrorMessage';
	var displayAttr = 'style';
	var displayOff = 'display:none';
	var $ = cheerio.load(data);
	var errorStatus = $(errorTag).attr(displayAttr).trim();
	var errorMsg = $(errorTag).text().trim();

	if (errorStatus.indexOf(displayOff) === -1) { //	Not found
		//var filename_status = path.join(options.outDir, 'status.log');
		//fs.appendFileSync(filename_status, options.postfix + ':\t' + errorMsg + NEWLINE);
		return true;
	} else
		return false;
}

function newScraper(options, env, callback) {
	if (path.extname(options.postfix) != env.rawExt) {
		return callback(null, 0); //	skip
	}

	setImmediate(function () {
		var file = path.join(options.srcDir, options.postfix);

		//console.log(file);

		var fileData = fs.readFileSync(file, 'utf8');
		var outFile = path.join(options.outDir, path.basename(options.postfix, env.rawExt) + env.extExt);
		var outText = '';

		var $ = cheerio.load(fileData);

		var CSSpath = '#pageWrapper > div.main > div.rightmenu.twoColWide > div > div.col1 > div > ul > li a';
		var phrases = $(CSSpath);

		phrases.each(function (i, el) {
			outText += $(el).text() + NEWLINE;
		});
		outText += NEWLINE;

		//console.log(outText);
		//return callback(null, 1); //	for count

		var fd = fs.createWriteStream(outFile);
		fd.write(outText, function () {
			fd.end();
			callback(null, 1); //	for count
		});
	});
}

var newEnv = {
	baseUrl : 'http://www.techopedia.com/it-terms/',
	headers : {
		Host : 'www.techopedia.com',
		Origin : 'http://www.techopedia.com',
		Referer : 'http://www.techopedia.com/it-dictionary',
		UserAgent : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36',
		Accept : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*'
	},
	capList : ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
	rawTopDir : 'raw/techopedia/glossary',
	rawExt : '.html',
	textTopDir : 'text/techopedia/glossary',
	extExt : '.txt',
	//crawler : newCrawler,
	processProtection : checkHome,
	processError : checkClosed,
	scraper : newScraper,
	concurrency : 2
};

itGlossary(newEnv);
