#!/bin/sh

cd etl

node corpus_detail.js

echo -n "Press any key... "
read text

node synonym_detail.js

echo -n "Press any key... "
read text

node corpus_merge.js

echo -n "Press any key or CTRL-C... "
read text

cp corpus_merge/104/job/20140716/2007001000/keywords_merge.txt input/.

node tfidf_detail.js

echo -n "Press any key or CTRL-C... "
read text

rm -r -f ../output/mapreduce/*.txt

cp tfidf/104/job/20140716/2007001000/keywords_merge_sort_index.txt ../output/mapreduce
cp tfidf/104/job/20140716/2007001000/tfidf.txt ../output/mapreduce

node corpus_mapreduce.js

echo -n "Press any key or CTRL-C... "
read text

#cp corpus_merge/104/job/20140716/2007001000/joblist.txt ../output
cp corpus_merge/104/job/20140716/2007001000/jobword_merge.txt ../output/mapreduce

cd ..
