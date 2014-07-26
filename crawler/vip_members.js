var vipDetail = require('./vip_detail');

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
var cat_resume = 'resume';
var demo_mode = 'demo';

var filename_preset = path.join(__dirname, 'hr_config.json');
var presetList;

var newEnv = {
	baseUrl : 'http://vip.104.com.tw/9/main/before/post/search_resume_detail.cfm',
	headers : {
		Host : 'vip.104.com.tw',
		Origin : 'http://vip.104.com.tw',
		Referer : 'http://vip.104.com.tw/9/search/search_result.cfm?jobcat=2007001000',
		UserAgent : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36',
		Accept : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*'
	},
	capList : [],
	rawTopDir : 'raw/104/vip',
	rawExt : '.html',
	textTopDir : 'text/104/vip',
	textResumeTopDir : '../etl/text/104/job',
	extExt : '.txt',
	//crawler : newCrawler,
	processProtection : checkHome,
	processError : checkClosed,
	scraper : newScraper,
	dateStr : '',
	concurrency : 2
};

function getPreset() {
	if (fs.existsSync(filename_preset)) {
		presetList = JSON.parse(fs.readFileSync(filename_preset, 'utf8'));
		console.log('Read ' + filename_preset + ' ok.');
	} else { //	empty means count all
		presetList = {
			"cat" : [],
			"area" : []
		};
	}
	console.log(presetList);
}

function checkPresetCat(cat) {
	if (presetList.cat.length === 0)
		return true;
	else {
		for (var i = 0; i < presetList.cat.length; i++)
			if (cat == presetList.cat[i])
				return true;
		return false; //	no match
	}
}

function checkPresetArea(area) {
	if (presetList.area.length === 0)
		return true;
	else {
		for (var i = 0; i < presetList.area.length; i++)
			if (area == presetList.area[i])
				return true;
		return false; //	no match
	}
}

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
	return false;

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
		var outText = '';

		var $ = cheerio.load(fileData);

		var CSSpath = '#content > div > div.master_bg > div > div:nth-child(7) > dl > dd'; //	技能專長
		var rows = $(CSSpath);

		//outText += rows.slice(0, 1).text() + NEWLINE; //	擅長工具
		//outText += rows.slice(1, 2).text() + NEWLINE; //	工作技能

		var cert = '證照：';
		var ucodes = '';
		for (var i = 0; i < cert.length; i++) {
			ucodes += '\\u' + cert.charCodeAt(i).toString(16);
		}
		var newExp = new RegExp(ucodes);

		rows.each(function (i, elem) {
			var record = $(this).text().trim();
			if (i < 2) { //	only extract 擅長工具 and 工作技能
				//console.log(record);
				if (record.indexOf(cert) < 0)
					//if (!record.match(newExp))
					outText += record + NEWLINE;
				else
					console.log('Bypass cert!');
			}
		});

		//console.log(outText);
		//return callback(null, 1); //	for count

		var outFile = path.join(options.outDir, path.basename(options.postfix, env.rawExt) + env.extExt);
		var fd = fs.createWriteStream(outFile);
		fd.write(outText, function () {
			fd.end();

			var etlDir = path.join(newEnv.textResumeTopDir, newEnv.dateStr + '/' + cat_resume);
			newDir(etlDir, '');
			var outFile2 = path.join(etlDir, path.basename(options.postfix, env.rawExt) + env.extExt);
			if (fs.existsSync(outFile2))
				fs.unlinkSync(outFile2);
			fs.appendFileSync(outFile2, outText);

			callback(null, 1); //	for count
		});
	});
}

function scrapeList(inData, callback) {
	setImmediate(function () {
		var $ = cheerio.load(inData);

		var CSSpath = '#right_sidebar755 > div > div.resume_tit > div > span.id_no'; //	代碼
		var codes = $(CSSpath);

		//console.log('codes.len = ' + codes.length);

		codes.each(function (i, elem) {
			var record = $(this).text().trim(); //.replace('：', ':');
			var offset = record.search(/[a-z]/i);
			newEnv.capList.push(record.slice(offset));
		});

		callback();
	});
}

function getMembers(inData, callback) {
	newEnv.capList = []; //	reset
	scrapeList(inData, function () {
		vipDetail(newEnv, function (err, results) {
			if (err)
				callback(err);
			else
				callback();
		});
	});
}

function getCatPage(cat, callback) {
	var baseUrl = 'http://vip.104.com.tw/9/search/search_result.cfm';
	var header_Referer = 'http://vip.104.com.tw/9/search/search.cfm';

	console.log('cat: ' + cat);

	superagent
	.get(baseUrl)
	.query({
		jobcat : cat
	})
	.set('Accept', newEnv.headers.header_Accept)
	.set('User-Agent', newEnv.headers.header_UserAgent)
	//.set('Cookie', setcookie)
	.set('Host', newEnv.headers.header_Host)
	.set('Origin', newEnv.headers.header_Origin)
	.set('Referer', header_Referer)
	.end(function (error, res) {
		if (error) {
			console.log('\n' + inspect(error));
			var filename_log = path.join(newEnv.rawTopDir, cat + '.log');
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
				process.stdout.write('X');
				callback();
			} else {
				//fs.appendFileSync('search.html', res.text);
				getMembers(res.text, callback);
			}
		}
	});

}

function getList() {
	if (presetList.demo)
		newEnv.dateStr = presetList.date[0];
	else
		newEnv.dateStr = newDateStr();

	async.eachSeries(presetList.cat, function (cat, callback) {
		getCatPage(cat, callback);
	}, function (err) {
		if (err) {
			// One of the iterations produced an error.
			// All processing will now stop.
			console.log('A category failed to process');
		} else {}
	});

}

function processOptions() {
	//console.log(process.argv);
	//console.log(process.argv.length);
	if (process.argv.length > 2) {
		if (demo_mode === process.argv[2].toLowerCase()) {
			console.log('\nIn demo mode!');
			presetList.demo = true;
			if (presetList.date.length === 0) {
				console.log('No date preset for demo!');
				process.exit(1);
			} else {
				console.log('Demo date: ' + presetList.date[0]);
			}
		}
	}
}

function main() {
	getPreset();
	processOptions();
	getList();
}

main();
