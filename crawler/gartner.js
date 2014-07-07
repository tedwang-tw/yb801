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
	var title = 'Technology Research';
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
	var correctMsg = 'We apologize for the inconvenience';
	var errorTag = 'body > div.container > div > div.span9.content-block > div.content > h2';
	var $ = cheerio.load(data);
	var errorMsg = $(errorTag).text().trim();

	if (errorMsg.indexOf(correctMsg) !== -1) //	Not found
		return true;
	else
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

		var CSSpath = 'body > div > div > div.span9.content-block > div.content > div.browse-list > div.row-fluid > div a';
		var phrases = $(CSSpath);

		phrases.each(function (i, el) {
			outText += $(el).text() + NEWLINE;
		});
		outText += NEWLINE;
		//console.log(outText);

		var fd = fs.createWriteStream(outFile);
		fd.write(outText, function () {
			fd.end();
			callback(null, 1); //	for count
		});
	});
}

var newEnv = {
	baseUrl : 'http://www.gartner.com/it-glossary/',
	headers : {
		Host : 'www.gartner.com',
		Origin : 'http://www.gartner.com',
		Referer : 'http://www.gartner.com/it-glossary/',
		UserAgent : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36',
		Accept : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*'
	},
	capList : ['num', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
	rawTopDir : 'raw/gartner/glossary',
	rawExt : '.html',
	textTopDir : 'text/gartner/glossary',
	extExt : '.txt',
	//crawler : newCrawler,
	processProtection : checkHome,
	processError : checkClosed,
	scraper : newScraper,
	concurrency : 2
};

itGlossary(newEnv);
