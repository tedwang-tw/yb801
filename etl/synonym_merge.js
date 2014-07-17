var fs = require('fs');
var path = require('path');
var util = require("util");
var events = require('events');
var mkdirp = require('mkdirp');
var sprintf = require("sprintf-js").sprintf;
var async = require('async');
//var cheerio = require("cheerio");
var lineReader = require('line-reader');

var CONCURRENCY = 2;

var ext = '.txt'; //	null;	//	input file filter
var outExt = '.txt';

var NEWLINE = '\r\n';
var DELIMITER = /[,\t]/;

//var inTopDir = 'corpus/104/job';
var outTopDir = 'synonym/glossary';

var basename_glossary_pure = 'input/glossary_normal_pure.txt';
var basename_synonym_hyphen = 'input/synonym_hyphen.txt';
var basename_synonym_parentheses = 'input/synonym_parentheses.txt';
var basename_synonym_group = 'synonym_group.txt';
var basename_synonym_join = 'synonym_join.txt';
var basename_glossary_all = 'glossary_all.txt';
var basename_err = 'error.txt';
var basename_status = 'status.txt';
var filename_status;

var filename_preset = path.join(__dirname, 'etl_config.json');
var presetList;

var keywords = [];
var glossaryAll = [];
var synonymDict = {};

var emitter = new events.EventEmitter();

function extractLastDir(file, isDir) {
	var parents;
	if (isDir)
		parents = file;
	else
		parents = path.dirname(file);
	var index = parents.match(/[\/\\]/);
	if (index != null) {
		parents = parents.split(index[0]);
		return parents[parents.length - 1];
	} else
		return null;
} //	extractLastDir

function isDate(tdate) {
	if (tdate.trim().length == 8) {
		var year = parseInt(tdate.slice(0, 4), 10);
		if (!isNaN(year)) {
			if (year > 1970)
				return true;
		}
	}
	return false;
}

function newDir(dir) {
	console.log("\nDestination: " + dir);
	if (!fs.existsSync(dir)) {
		console.log("Creating dir " + dir);
		mkdirp.sync(dir);

		if (!fs.existsSync(dir)) {
			process.stderr.write("Unable to create dir " + dir + "\n");
		}
	}
}

function getTimeStamp(msec) {
	var d = new Date(msec);

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	var curr_hour = d.getHours();
	var curr_min = d.getMinutes();
	var curr_sec = d.getSeconds();

	//return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + '_' + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
	/*	for d3.time.format('%Y%m%d%H%M%S')	*/
	return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
}

function getDateTime() {
	var d = new Date();

	var curr_date = d.getDate();
	var curr_month = d.getMonth();
	curr_month++;
	var curr_year = d.getFullYear();

	var curr_hour = d.getHours();
	var curr_min = d.getMinutes();
	var curr_sec = d.getSeconds();

	return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + '_' + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
	/*	for d3.time.format('%Y%m%d%H%M%S')	*/
	//return (curr_year + sprintf('%02d', curr_month) + sprintf('%02d', curr_date) + sprintf('%02d', curr_hour) + sprintf('%02d', curr_min) + sprintf('%02d', curr_sec));
}

function subKeyword(list, pos, word) { //	check sub-string like
	for (var key in list) {
		if (key.length > word.length) {
			if (key.indexOf(word) !== -1) {
				//emitter.emit('log', '<' + key + '-' + word + '>');
				for (var i = 0; i < list[key].length; i++) {
					if (pos >= list[key][i][0] && pos <= list[key][i][1]) {
						//emitter.emit('log', '[' + list[key][i][0] + ',' + list[key][i][1] + ']');
						return true;
					}
				}
			}
		}
	}
	return false;
}

function readKeywords() {
	if (!fs.existsSync(basename_synonym_hyphen)) {
		console.log('File "' + basename_synonym_hyphen + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_synonym_parentheses)) {
		console.log('File "' + basename_synonym_parentheses + '" not found!');
		process.exit(1);
	}
	if (!fs.existsSync(basename_glossary_pure)) {
		console.log('File "' + basename_glossary_pure + '" not found!');
		process.exit(1);
	}

	var hyphenCnt = 0;
	var parenthesesCnt = 0;
	var pureCnt = 0;

	async.series({
		hyphen : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_synonym_hyphen, function (line) {
				if (line.trim().length > 0) {
					var terms = line.trim().split(DELIMITER);
					if (terms.length > 0) {
						keywords.push(terms.map(function (term) {
								return term.trim().toLowerCase();
							}));
						hyphenCnt++;
					}
				}
			}).then(function () {
				callback(null, hyphenCnt);
			});
		},
		parentheses : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_synonym_parentheses, function (line) {
				if (line.trim().length > 0) {
					var terms = line.trim().split(DELIMITER);
					if (terms.length > 0) {
						keywords.push(terms.map(function (term) {
								return term.trim().toLowerCase();
							}));
						parenthesesCnt++;
					}
				}
			}).then(function () {
				callback(null, parenthesesCnt);
			});
		},
		pure : function (callback) {
			// read all lines:
			lineReader.eachLine(basename_glossary_pure, function (line) {
				var term = line.trim();
				if (term.length > 0) {
					glossaryAll.push(term);
					pureCnt++;
				}
			}).then(function () {
				callback(null, pureCnt);
			});
		}
	},
		function (err, results) {
		//console.log(keywords);
		//console.log(keywords_en);
		emitter.emit('log', NEWLINE + 'Totally:' +
			'\n\t' + results.hyphen + ' hyphen keywords counted.' +
			'\n\t' + results.parentheses + ' parentheses keywords counted.' +
			'\n\t' + results.pure + ' pure keywords counted.');
		//process.exit();
		// results is now equals to: {one: 1, two: 2}
		emitter.emit('keyword', NEWLINE + 'Totally ' + (results.hyphen + results.parentheses) + ' synonyms counted.');
	});
}

function checkTermSim(terms1, terms2) {
	for (var i = 0; i < terms1.length; i++) {
		if (terms2.indexOf(terms1[i]) !== -1)
			return true;
	}

	return false;
}

function groupPair(index1, terms1, index2, terms2) {
	if (!synonymDict[index1])
		synonymDict[index1] = terms1.sort();
	if (!synonymDict[index2])
		synonymDict[index2] = terms2.sort();
}

function groupSimilar() {
	var len = keywords.length;

	keywords.forEach(function (terms, i) {
		for (var j = i + 1; j < len; j++) {
			if (checkTermSim(terms, keywords[j]))
				groupPair(i, terms, j, keywords[j]);
		}
	});
}

function joinPair(newDocs, index, terms) {
	for (var i = 0; i < terms.length; i++) {
		if (newDocs[index].indexOf(terms[i]) < 0)
			newDocs[index].push(terms[i]);
	}
}

function joinSimilar(orgDocs) {
	var len = orgDocs.length;
	var newDocs = [];
	//console.log('orgDocs len = ' + len);

	orgDocs.forEach(function (line) {
		var terms = line.split(',');
		var joined = false;
		for (var j = 0; j < newDocs.length; j++) {
			if (checkTermSim(terms, newDocs[j])) {
				joinPair(newDocs, j, terms);
				joined = true;
				break;
			}
		}
		if (!joined)
			newDocs.push(terms);
	});

	return newDocs;
}

function reduceDimention(orgGroups) {
	var newGroups = [];
	//console.log('orgGroups len = ' + orgGroups.length);

	for (var index in orgGroups) {
		newGroups.push(orgGroups[index].sort(function (a, b) { //	sort as longest prefix match
				if (a.length < b.length)
					return -1;
				else if (a.length > b.length)
					return 1;
				else
					return a.localeCompare(b);
			}).join(','));
	}

	return newGroups;
}

function sortUnique(orgKeywords) {
	//console.log('orgKeywords len = ' + orgKeywords.length);

	orgKeywords.sort(function (a, b) { //	sort as longest prefix match
		/*
		if (a.length < b.length)
		return -1;
		else if (a.length > b.length)
		return 1;
		else
		 */
		return a.localeCompare(b);
	}).reverse();

	var newKeywords = [];

	orgKeywords.forEach(function (word) {
		if (newKeywords.indexOf(word) === -1)
			newKeywords.push(word);
	});

	return newKeywords;
}

function glosaryAddSynonym(synonymGroups) {
	synonymGroups.forEach(function (line) {
		var synonyms = line.split(',');
		synonyms.forEach(function (synonym) {
			if (glossaryAll.indexOf(synonym) < 0)
				glossaryAll.push(synonym);
		});
	});

	glossaryAll.sort(function (a, b) { //	sort as longest prefix match
		if (a.length < b.length)
			return -1;
		else if (a.length > b.length)
			return 1;
		else
			return a.localeCompare(b);
	}).reverse();
}

function main() {
	newDir(outTopDir);

	emitter.on('log', function (message) {
		process.stdout.write(message);
	});
	emitter.on('err', function (err, dir, outDir) {
		if (err) {
			var filename_err = path.join(outDir, basename_err);
			var fd_err = fs.createWriteStream(filename_err);
			fd_err.write(util.inspect(err));
			fd_err.end();
			console.log('\nerror: ' + util.inspect(err));
		}
	});

	filename_status = path.join(outTopDir, basename_status);
	fs.appendFileSync(filename_status, NEWLINE + getDateTime() + NEWLINE);

	var timeA = new Date().getTime();

	readKeywords();

	emitter.on('keyword', function (message) {
		process.stdout.write(message);
		fs.appendFileSync(filename_status, message);

		emitter.emit('log', NEWLINE + 'Start grouping synonyms...\t');

		/*
		groupSimilar();

		emitter.emit('log', '\nTotally ' + Object.keys(synonymDict).length + ' synonyms lines.\n');
		 */

		var outFile = path.join(outTopDir, basename_synonym_group);
		emitter.emit('log', '\nWrite to ' + outFile + '...');

		var fd = fs.createWriteStream(outFile);
		var groups2 = sortUnique(reduceDimention(keywords)); //	synonymDict));
		groups2.forEach(function (terms) {
			fd.write(terms + NEWLINE);
		});
		fd.end();

		emitter.emit('log', '\tdone.');
		emitter.emit('log', '\nTotally ' + groups2.length + ' grouped synonym lines.\n');

		outFile = path.join(outTopDir, basename_synonym_join);
		emitter.emit('log', '\nWrite to ' + outFile + '...');

		fd = fs.createWriteStream(outFile);
		var uniqueGroup = sortUnique(reduceDimention(joinSimilar(groups2)));
		uniqueGroup.forEach(function (terms) {
			fd.write(terms + NEWLINE);
		});
		fd.end();

		emitter.emit('log', '\tdone.');
		emitter.emit('log', '\nTotally ' + uniqueGroup.length + ' joined synonym lines.\n');
		fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + uniqueGroup.length + ' joined synonyms lines.' + NEWLINE);

		outFile = path.join(outTopDir, basename_glossary_all);
		emitter.emit('log', '\nWrite to ' + outFile + '...');

		fd = fs.createWriteStream(outFile);
		glosaryAddSynonym(uniqueGroup);
		glossaryAll.forEach(function (term) {
			fd.write(term + NEWLINE);
		});
		fd.end();

		emitter.emit('log', '\tdone.');
		emitter.emit('log', '\nTotally ' + glossaryAll.length + ' glossary.\n');

		var timeB = new Date().getTime();

		fs.appendFileSync(filename_status, NEWLINE + 'Totally ' + glossaryAll.length + ' glossary.' + NEWLINE);

		console.log('\nElapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
		fs.appendFileSync(filename_status, NEWLINE + 'Elapsed time: ' + (timeB - timeA) / 1000 + ' sec.' + NEWLINE);
	});
}

main();
