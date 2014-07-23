var inspect = require('util').inspect;
var async = require('async');
var sprintf = require("sprintf-js").sprintf;
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
//var os = require('os');


var isNormal = true; //	run as service or not
var evlog;

function newDateStr() {
	var d = new Date();

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date));
}

function newDir(topDir, dateStr) {
	var dir = path.join(topDir, '/' + dateStr);
	//console.log("Destination: " + dir);

	if (!fs.existsSync(dir)) {
		console.log("Creating dir " + dir);
		mkdirp.sync(dir);

		if (!fs.existsSync(dir)) {
			process.stderr.write("Unable to create dir " + dir);
		}
	}

	return dir;
}

var events = require('events');
var cheerio = require("cheerio");
var superagent = require('superagent');

var emitter = new events.EventEmitter();

var NEWLINE = '\r\n';

/*
function checkHome(data) {
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

function checkClosed(data) {
var correctMsg = 'We apologize for the inconvenience';
var errorTag = 'body > div.container > div > div.span9.content-block > div.content > h2';
var $ = cheerio.load(data);
var errorMsg = $(errorTag).text().trim();

if (errorMsg.indexOf(correctMsg) !== -1) //	Not found
return true;
else
return false;
}
 */

function defaultCrawler(options, env, callback) {
	var fileName_s = path.join(options.outDir, options.postfix + env.rawExt);

	if (fs.existsSync(fileName_s)) { //	already got in last turn
		process.stdout.write('o'); //	bypass!
		return callback(null, 1);
	}
	//console.log(env.baseUrl + options.postfix);

	var filename_status = path.join(options.outDir, 'status.log');

	setImmediate(function () {
		//console.log(options.postfix);
		//return callback(null, 1);

		superagent
		.post(env.baseUrl)
		.type('form')
		.send({
			id_no : options.postfix
		})
		.send({
			vrfy : '1406104246683'
		})
		.send({
			kws : ''
		})
		.set('Accept', env.headers.Accept)
		//.set('User-Agent', env.headers.UserAgent)
		//.set('Cookie', env.headers.setcookie)
		.set('Host', env.headers.Host)
		.set('Origin', env.headers.Origin)
		.set('Referer', env.headers.Referer)
		.end(function (error, res) {
			if (error) {
				//newJobs.push(item); //	try later
				console.log('\n' + inspect(error));
				var filename_log = path.join(options.outDir, options.postfix + '.log');
				fs.appendFileSync(filename_log, "Http get error: " + error.code + ", " + error.message + NEWLINE);
				callback('Glossary got error!', 0);
			} else {
				//console.log(inspect(res.status));
				//console.log(inspect(res.header));
				//console.log('body: ' + inspect(res.body));
				//console.log('text: ' + inspect(res.text));
				if (env.processError(res.text, options)) {
					fs.appendFileSync(filename_status, options.postfix + ':\tNot found!' + NEWLINE);
					process.stdout.write('*'); //	bypass!
					callback(null, 0);
				} else if (env.processProtection(res.text, options)) {
					//newJobs.push(item); //	try later
					fs.appendFileSync(filename_status, options.postfix + ':\tRobot protected?' + NEWLINE);
					process.stdout.write('X');
					callback(null, 0);
				} else {
					var sfile = fs.createWriteStream(fileName_s);
					sfile.write(res.text, function () {
						sfile.end();
						process.stdout.write('.');
						callback(null, 1);
					});
				}
			}
		});
	});
}

/*
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
 */

function startCrawler(env, dateStr, outerCallback) {
	var orgCount = 0;

	var timeA = new Date().getTime();
	var outDirDate = newDir(env.rawTopDir, dateStr);

	async.mapLimit(env.capList, env.concurrency, function (cat, callback) {
		var options = {
			postfix : cat,
			outDir : outDirDate
		};

		orgCount++;
		env.crawler(options, env, callback);
	}, function (err, results) {
		var finalCount = results.reduce(function (sum, count) {
				return (sum + count);
			}, 0);
		console.log(NEWLINE + finalCount + '/' + orgCount + ' requests have been processed successfully.');

		if (err) {
			// One of the iterations produced an error.
			// All processing will now stop.
			//console.log(NEWLINE + 'Crawling failed: ' + err);
			outerCallback(err, 'Crawling failed!');
		} else {
			var timeB = new Date().getTime();
			console.log(NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
			outerCallback(err, 'Crawling ok.');
		}
	});
}

function startScraper(env, dateStr, outerCallback) {
	var orgCount = 0;
	var rawDir = path.join(__dirname, env.rawTopDir + '/' + dateStr);

	if (!fs.existsSync(rawDir)) {
		console.log('Folder "' + rawDir + '" not found!');
		process.exit(1);
	}

	fs.readdir(rawDir, function (err, list) {
		var itemCounter = 0;
		var dayCount = 0;

		if (err)
			return console.log(err);

		var timeA = new Date().getTime();
		var outDirDate = newDir(env.textTopDir, dateStr);

		async.mapLimit(list, env.concurrency, function (file, callback) {
			var options = {
				postfix : file,
				srcDir : rawDir,
				outDir : outDirDate
			};

			orgCount++;
			env.scraper(options, env, callback);
		}, function (err, results) {
			var finalCount = results.reduce(function (sum, count) {
					return (sum + count);
				}, 0);
			console.log(NEWLINE + finalCount + '/' + orgCount + ' files have been processed successfully.');

			if (err) {
				// One of the iterations produced an error.
				// All processing will now stop.
				//console.log('Scraping failed: ' + err);
				outerCallback(err, 'Scraping failed!');
			} else {
				var timeB = new Date().getTime();
				console.log(NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
				outerCallback(null, 'Scraping ok.');
			}
		});
	});
}

function start(env, done) {
	//env.dateStr = newDateStr();	//	moved to caller

	if (!env.crawler)
		env.crawler = defaultCrawler; //	use default

	async.series([
			function (callback) {
				startCrawler(env, env.dateStr, callback);
			},
			function (callback) {
				startScraper(env, env.dateStr, callback);
			}
		],
		// optional callback
		function (err, results) {
		// results is now equal to ['one', 'two']
		if (err)
			console.log(inspect(err) + NEWLINE + inspect(results));

		done(null, results);
	});
}

module.exports = start;
