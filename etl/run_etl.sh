#!/bin/sh
node corpus_detail.js

echo -n "Press any key... "
read text

node synonym_detail.js

echo -n "Press any key... "
read text

node corpus_merge.js

echo -n "Press any key... "
read text

cp corpus_merge/104/job/20140716/2007001000/keywords_merge.txt input/.

node tfidf_detail.js

echo -n "Press any key... "
read text

node corpus_mapreduce.js

