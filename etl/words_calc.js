/* @author Rob W, created on 16-17 September 2011, on request for Stackoverflow (http://stackoverflow.com/q/7085454/938089)
 * Modified on 17 juli 2012, fixed bug by replacing [,] with [null]
 * This script will calculate words. For the simplicity and efficiency,
 * there's only one loop through a block of text.
 * A 100% accuracy requires much more computing power, which is usually unnecessary
 **/

var fs = require('fs');
var path = require('path');

var filename_src = '';
var timeA, timeB;

if (process.argv.length <= 2) {
	process.stderr.write("Please input source file name!\n");
	process.stderr.write('Usage:\t' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' source.txt');
	process.exit(1);
} else {
	filename_src = process.argv[2];
	if (!fs.existsSync(filename_src)) {
		process.stderr.write('File "' + filename_src + '" not found!');
		process.exit(1);
	}
}

timeA = new Date().getTime();

var text = fs.readFileSync(filename_src, 'utf8');
process.stderr.write('File "' + filename_src + '" read ok.\nProcessing...');

//var text = "A quick brown fox jumps over the lazy old bartender who said 'Hi!' as a response to the visitor who presumably assaulted the maid's brother, because he didn't pay his debts in time. In time in time does really mean in time. Too late is too early? Nonsense! 'Too late is too early' does not make any sense.";

var atLeast = 2; // Show results with at least .. occurrences
var numWords = 5; // Show statistics for one to .. words
var ignoreCase = true; // Case-sensitivity
var REallowedChars = /[^a-zA-Z'\-\+\/&0-9]+/g;
// RE pattern to select valid characters. Invalid characters are replaced with a whitespace

var i, j, k, textlen, len, s;
// Prepare key hash
var keys = [null]; //"keys[0] = null", a word boundary with length zero is empty
var results = [];
numWords++; //for human logic, we start counting at 1 instead of 0
for (i = 1; i <= numWords; i++) {
	keys.push({});
}

// Remove all irrelevant characters
text = text.replace(REallowedChars, " ").replace(/^\s+/, "").replace(/\s+$/, "");

// Create a hash
if (ignoreCase)
	text = text.toLowerCase();
text = text.split(/\s+/);
for (i = 0, textlen = text.length; i < textlen; i++) {
	s = text[i];
	keys[1][s] = (keys[1][s] || 0) + 1;
	for (j = 2; j <= numWords; j++) {
		if (i + j <= textlen) {
			s += " " + text[i + j - 1];
			keys[j][s] = (keys[j][s] || 0) + 1;
		} else
			break;
	}
}

// Prepares results for advanced analysis
for (var k = 1; k <= numWords; k++) {
	results[k] = [];
	var key = keys[k];
	for (var i in key) {
		if (key[i] >= atLeast)
			results[k].push({
				"word" : i,
				"count" : key[i]
			});
	}
}

// Result parsing
var outputHTML = []; // Buffer data. This data is used to create a table using `.innerHTML`

var f_sortAscending = function (x, y) {
	return y.count - x.count;
};
for (k = 1; k < numWords; k++) {
	results[k].sort(f_sortAscending); //sorts results

	// Customize your output. For example:
	var words = results[k];
	//if (words.length)
	//	outputHTML.push('<td colSpan="3" class="num-words-header">' + k + ' word' + (k == 1 ? "" : "s") + '</td>');
	for (i = 0, len = words.length; i < len; i++) {
		//Characters have been validated. No fear for XSS
		outputHTML.push(words[i].word + " : " +
			words[i].count);
		//+ ", " +
		//Math.round(words[i].count / textlen * 10000) / 100 + "%");
		// textlen defined at the top
		// The relative occurence has a precision of 2 digits.
	}
}
/*
outputHTML = '<table id="wordAnalysis"><thead><tr>' +
'<td>Phrase</td><td>Count</td><td>Relativity</td></tr>' +
'</thead><tbody><tr>' + outputHTML.join("</tr><tr>") +
"</tr></tbody></table>";
document.getElementById("RobW-sample").innerHTML = outputHTML;
 */

timeB = new Date().getTime();

var NEWLINE = '\r\n';
function stringifyList(list) {
	list.forEach(function (pair) {
		process.stdout.write(pair + NEWLINE);
	});
}

process.stderr.write('\tDone.');
//console.log(outputHTML);
stringifyList(outputHTML);
process.stderr.write('\nElapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
