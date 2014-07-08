/*
Copyright (c) 2011, Rob Ellis, Chris Umbel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */

var _ = require("underscore")._,
Tokenizer = require('./regexp_tokenizer').WordTokenizer,
tokenizer = new Tokenizer(),
stopwords = require('./stopwords').words,
fs = require('fs');

function buildDocument(text, key) {
	var stopOut;

	if (typeof text === 'string') {
		text = tokenizer.tokenize(text.toLowerCase());
		stopOut = true;
	} else if (!_.isArray(text)) {
		return text;
		stopOut = false;
	}

	return text.reduce(function (document, term) {
		// next line solves https://github.com/NaturalNode/natural/issues/119
		if (typeof document[term] === 'function')
			document[term] = 0;
		if (!stopOut || stopwords.indexOf(term) < 0)
			document[term] = (document[term] ? document[term] + 1 : 1);
		return document;
	}, {
		__key : key
	});
}

function tf(term, document) {
	return document[term] ? document[term] : 0;
}

function documentHasTerm(term, document) {
	return document[term] && document[term] > 0;
}

function TfIdf(deserialized) {
	if (deserialized)
		this.documents = deserialized.documents;
	else
		this.documents = [];

	this._idfCache = {};
}

module.exports = TfIdf;
TfIdf.tf = tf;

TfIdf.prototype.idf = function (term, force) {

	// Lookup the term in the New term-IDF caching,
	// this will cut search times down exponentially on large document sets.
	if (this._idfCache[term] && typeof this._idfCache[term] !== "function" && force !== true)
		return this._idfCache[term];

	var docsWithTerm = this.documents.reduce(function (count, document) {
			return count + (documentHasTerm(term, document) ? 1 : 0);
		}, 0);

	if (docsWithTerm === 0)
		console.log('idf[' + term + '] == 0');
	var idf = Math.log((this.documents.length) / (docsWithTerm));

	//console.log('total doc=' + this.documents.length);

	// Add the idf to the term cache and return it
	this._idfCache[term] = idf;
	return idf;
};

// If restoreCache is set to true, all terms idf scores currently cached will be recomputed.
// Otherwise, the cache will just be wiped clean
TfIdf.prototype.addDocument = function (document, key, restoreCache) {
	this.documents.push(buildDocument(document, key));

	// make sure the cache is invalidated when new documents arrive
	if (restoreCache === true) {
		for (var term in this._idfCache) {
			// invoking idf with the force option set will
			// force a recomputation of the idf, and it will
			// automatically refresh the cache value.
			this.idf(term, true);
		}
	} else {
		this._idfCache = {};
	}
};

// If restoreCache is set to true, all terms idf scores currently cached will be recomputed.
// Otherwise, the cache will just be wiped clean
TfIdf.prototype.addFileSync = function (path, encoding, key, restoreCache) {
	if (!encoding)
		encoding = 'UTF-8';

	var document = fs.readFileSync(path, 'UTF-8');
	this.documents.push(buildDocument(document, key));

	// make sure the cache is invalidated when new documents arrive
	if (restoreCache === true) {
		for (var term in this._idfCache) {
			// invoking idf with the force option set will
			// force a recomputation of the idf, and it will
			// automatically refresh the cache value.
			this.idf(term, true);
		}
	} else {
		this._idfCache = {};
	}
};

TfIdf.prototype.tfidf = function (terms, d) {
	var _this = this;

	if (!_.isArray(terms))
		terms = tokenizer.tokenize(terms.toString().toLowerCase());

	return terms.reduce(function (value, term) {
		return value + (tf(term, _this.documents[d]) * _this.idf(term));
	}, 0.0);
};

TfIdf.prototype.tfidf_new = function (terms, d) { //	tf*idf
	var _this = this;
	var arr = [];
	var idf = [];

	terms.forEach(function (term) {
		arr.push(tf(term, _this.documents[d]));
		idf.push(_this.idf(term));
	});

	var sum = arr.reduce(function (value, freq) {
			return value + freq;
		}, 0);

	if (sum) {
		idf.forEach(function (value, i) {
			arr[i] *= value;
		});
		arr = arr.map(function (freq) {
				return freq / sum;
			});
	}

	return arr;
};

TfIdf.prototype.tf_d = function (terms, d) {
	var _this = this;
	var arr = [];

	terms.forEach(function (term) {
		arr.push(tf(term, _this.documents[d]));
	});

	var sum = arr.reduce(function (value, freq) {
			return value + freq;
		}, 0);

	if (sum)
		arr = arr.map(function (freq) {
				return freq / sum;
			});

	return arr;
};

TfIdf.prototype.idf_t = function (terms) {
	var _this = this;
	var arr = [];

	terms.forEach(function (term) {
		arr.push(_this.idf(term));
	});

	return arr;
};

TfIdf.prototype.listTerms = function (d) {
	var terms = [];

	for (var term in this.documents[d]) {
		if (term != '__key')
			terms.push({
				term : term,
				tfidf : this.tfidf(term, d)
			});
	}

	return terms.sort(function (x, y) {
		return y.tfidf - x.tfidf;
	});
};

TfIdf.prototype.tfidfs = function (terms, callback) {
	var tfidfs = new Array(this.documents.length);

	for (var i = 0; i < this.documents.length; i++) {
		tfidfs[i] = this.tfidf(terms, i);

		if (callback)
			callback(i, tfidfs[i], this.documents[i].__key);
	}

	return tfidfs;
};

TfIdf.prototype.tf_idf_matrix = function (terms, callback) { //	tf+idf
	var tf_idf_arr = [];

	for (var i = 0; i < this.documents.length; i++) {
		tf_idf_arr.push(this.tf_d(terms, i));

		if (callback)
			callback(i, tf_idf_arr[i], this.documents[i].__key);
	}
	tf_idf_arr.push(this.idf_t(terms));

	return tf_idf_arr;
};

TfIdf.prototype.tfidf_matrix = function (terms, callback) { //	tf*idf
	var tfidf_arr = [];

	for (var i = 0; i < this.documents.length; i++) {
		tfidf_arr.push(this.tfidf_new(terms, i));

		if (callback)
			callback(i, tfidf_arr[i], this.documents[i].__key);
	}

	return tfidf_arr;
};
