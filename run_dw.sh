#!/bin/sh

cd etl

rm -r -f group/104/job/20140716/2007001000/MA_KM/*.json

node cluster_group.js   

echo -n "Press any key... "
read text

rm -r -f ../output/clusters/jobs/*.json
cp group/104/job/20140716/2007001000/MA_KM/*.json ../output/clusters/jobs

rm -r -f corpus_group/104/job/20140716/2007001000/MA_KM/*.json

node corpus_cluster.js

echo -n "Press any key... "
read text

rm -r -f tfidf_group/104/job/20140716/2007001000/MA_KM/*.json

node tfidf_cluster.js

echo -n "Press any key or CTRL-C... "
read text

rm -f -r ../output/clusters/keywords/*.json
cp tfidf_group/104/job/20140716/2007001000/MA_KM/*.json ../output/clusters/keywords

cd ..
