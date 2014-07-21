//var _ = require('underscore');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var events = require('events');

var docDoubles = [];
var resumeDoubles = [];
var docMags = [];
var resumeMags = [];
var simMatrix = [];
var NEWLINE = '\r\n';

var isTriangular = true;
var isPreset = true;

var testMode = false;

var emitter = new events.EventEmitter();
var emitOut = null;

var freqVector = function (word, letters) {
	var freq = _.groupBy(word.split(''), function (l) {
			return l;
		});
	return _.map(letters, function (l) {
		return freq[l] ? freq[l].length : 0;
	});
};

var dot = function (v1, v2) {
	//return _.reduce(_.zip(v1, v2), function (acc, els) {
	//	return acc + els[0] * els[1];
	//}, 0);

	var sum = 0;
	//v1.forEach(function (els, i) {
	//	sum += v1[i] * v2[i];
	//});
	var len = v1.length;
	for (var i = 0; i < len; i++)
		sum += v1[i] * v2[i];
	return sum;
};

var mag = function (v) {
	return Math.sqrt(_.reduce(v, function (acc, el) {
			return acc + el * el;
		}, 0));

	//var sum = 0;
	//var len = v.length;
	//for (var i = 0; i < len; i++)
	//	sum += v[i] * v[i];
	//return Math.sqrt(sum);
};

/*
var f = function (word1, word2) {
var letters = _.union(word1.split(''), word2.split(''));
var v1 = freqVector(word1, letters);
var v2 = freqVector(word2, letters);
return dot(v1, v2) / (mag(v1) * mag(v2));
};

var args = process.argv;
process.stdout.write(f(args[2], args[3]) + '\n');
 */

function cosSim(v1, v2, mag1, mag2) {
	if (mag1 === 0 || mag2 === 0)
		return 0;
	return dot(v1, v2) / (mag1 * mag2);
}

function loadMatrix(filename, matrix) {
	var docs = fs.readFileSync(filename, 'utf8').split(NEWLINE);
	docs.forEach(function (doc) {
		if (doc.trim().length > 0)
			matrix.push(JSON.parse('[' + doc.trim() + ']'));
	});
}

function prepareMag(docs) {
	return docs.map(function (doc) {
		//console.log(mag(doc));
		return mag(doc);
	});
}

function initMatrix(matrixSize, vectorSize) {
	for (var i = 0; i < matrixSize; i++) {
		if (isPreset) {
			simMatrix.push(new Float64Array(vectorSize));

			/*
			var row = [];
			for (var j = 0; j < size; j++) {
			row.push(0.0);
			}
			simMatrix.push(row);
			 */
		} else {
			simMatrix.push([]);
		}
	}
}

function initVector(size) {
	var vector = [];
	for (var i = 0; i < size; i++)
		vector.push(0.0);
	return vector;
}

function convertVector(v1, v2) {
	var len = v1.length;
	for (var i = 0; i < len; i++)
		v2[i] = v1[i];
}

emitter.on('log', function (message) {
	process.stderr.write(message);
});

function start() {
	var timeA = new Date().getTime();

	process.stderr.write(NEWLINE + 'Start calculating...\t');

	var resumeLen = resumeDoubles.length;
	var docsLen = docDoubles.length;

	//console.log('resumeLen=' + resumeLen)
	//console.log('docsLen=' + docsLen)

	//resumeDoubles.forEach(function (docOuter, i) {
	for (var i = 0; i < resumeLen; i++) {
		//docDoubles.forEach(function (docInner, j) {
		for (var j = 0; j < docsLen; j++) {
			if (isTriangular) {
				if (j < i) {
					if (isPreset)
						simMatrix[i][j] = simMatrix[j][i];
					else
						simMatrix[i].push(simMatrix[j][i]);
				} else
					if (isPreset)
						//simMatrix[i][j] = cosSim(docOuter, docInner, resumeMags[i], docMags[j]);
						simMatrix[i][j] = cosSim(resumeDoubles[i], docDoubles[j], resumeMags[i], docMags[j]);
					else
						simMatrix[i].push(cosSim(resumeDoubles[i], docDoubles[j], resumeMags[i], docMags[j]));
			} else {
				if (isPreset)
					//simMatrix[i][j] = cosSim(docOuter, docInner, resumeMags[i], docMags[j]);
					simMatrix[i][j] = cosSim(resumeDoubles[i], docDoubles[j], resumeMags[i], docMags[j]);
				else
					simMatrix[i].push(cosSim(resumeDoubles[i], docDoubles[j], resumeMags[i], docMags[j]));
			}
		}
		//});
		if (testMode)
			emitter.emit('log', '.');
		//});
	}

	var timeB = new Date().getTime();

	if (testMode) {
		process.stderr.write('\tdone.');
		process.stderr.write('\nElapsed time: ' + (timeB - timeA) / 1000 + ' sec.');
		process.stderr.write('\nOutput result...\t');
	}

	var len1 = simMatrix.length;
	//console.log('len1=' + len1)
	var vector = initVector(len1);

	for (var ii = 0; ii < len1; ii++) {
		/*
		var len2 = simMatrix[ii].length;
		for (var jj = 0; jj < len2; jj++) {
		if (jj > 0)
		process.stdout.write(',');
		process.stdout.write(simMatrix[ii][jj].toString());
		}
		 */

		convertVector(simMatrix[ii], vector);
		//process.stdout.write(vector.join(','));
		//process.stdout.write(NEWLINE);
		emitOut.emit('data', vector.join(',') + NEWLINE);

		if (testMode)
			emitter.emit('log', 'o');
	}

	emitOut.emit('end', null);

	//console.log(simMatrix);
	//if (testMode)
	//	process.stderr.write('\tdone.\n');
}

function create(filename_src_resume, filename_src, tMode) {
	if (tMode)
		testMode = true;

	if (!fs.existsSync(filename_src_resume)) {
		process.stderr.write('File "' + filename_src_resume + '" not found!');
		process.exit(1);
	}

	if (!fs.existsSync(filename_src)) {
		process.stderr.write('File "' + filename_src + '" not found!');
		process.exit(1);
	}

	process.stderr.write(NEWLINE + 'Load data...\t');

	loadMatrix(filename_src_resume, resumeDoubles);
	loadMatrix(filename_src, docDoubles);
	//console.log(resumeDoubles.length);
	//console.log(docDoubles.length);
	//process.exit(1);
	resumeMags = prepareMag(resumeDoubles);
	docMags = prepareMag(docDoubles);
	//console.log(resumeMags.length);
	//console.log(docMags.length);
	//process.exit(1);

	initMatrix(resumeDoubles.length, docDoubles.length);

	process.stderr.write('done.');

	emitOut = new events.EventEmitter();

	return emitOut;
} //	create

function createData(src_resume, src_jobs, tMode) {
	if (tMode)
		testMode = true;

	process.stderr.write(NEWLINE + 'Load data...\t');
	/*
	delete docDoubles;
	delete resumeDoubles;
	delete docMags;
	delete resumeMags;
	delete simMatrix;
	 */
	docDoubles = [];
	resumeDoubles = [];
	docMags = [];
	resumeMags = [];
	simMatrix = [];

	resumeDoubles = src_resume;
	docDoubles = src_jobs;
	//console.log(resumeDoubles.length);
	//console.log(docDoubles.length);
	//process.exit(1);
	resumeMags = prepareMag(resumeDoubles);
	docMags = prepareMag(docDoubles);
	//console.log(resumeMags.length);
	//console.log(docMags.length);
	//process.exit(1);

	initMatrix(resumeDoubles.length, docDoubles.length);

	process.stderr.write('done.');

	emitOut = new events.EventEmitter();

	return emitOut;
} //	createData

function main() {
	var filename_src;
	var filename_src_resume;

	if (process.argv.length <= 3) {
		process.stderr.write("Please input source file name!\n");
		process.stderr.write('Usage:\t' + path.basename(process.argv[0]) + ' ' + path.basename(process.argv[1]) + ' tfidf_resume.txt tfidf.txt');
		process.exit(1);
	} else {
		filename_src_resume = process.argv[2];
		filename_src = process.argv[3];
	}

	create(filename_src_resume, filename_src, true);
	start();
}

// usage:
// $ node cosine-sim.js apple application
// => 0.6416889479197478

//main();

module.exports.create = create;
module.exports.createData = createData;
module.exports.start = start;
