#!/bin/sh
cd crawler

rm -r -f raw/104/vip/20140716/*.html
rm -r -f text/104/vip/20140716/*.txt
rm -r -f ../etl/text/104/job/20140716/resume/*.txt

node vip_members.js demo

if [ "$1" != "demo" ]
then
echo -n "Press any key... "
read text
fi

cd ../etl

rm -r -f corpus/104/job/20140716/resume/*.json

node corpus_detail.js resume

if [ "$1" != "demo" ]
then
echo -n "Press any key... "
read text
fi

rm -r -f synonym/104/job/20140716/resume/*.json

node synonym_detail.js resume

if [ "$1" != "demo" ]
then
echo -n "Press any key... "
read text
fi

node corpus_merge.js resume

if [ "$1" != "demo" ]
then
echo -n "Press any key... "
read text
fi

#cp corpus_merge/104/job/20140716/2007001000/keywords_merge.txt input/.
rm -r -f tfidf/104/job/20140716/resume/*.txt

node tfidf_detail.js resume

if [ "$1" != "demo" ]
then
echo -n "Press any key or CTRL-C... "
read text
fi

cp tfidf/104/job/20140716/resume/resumelist.txt input/.

node similarity_job.js

if [ "$1" != "demo" ]
then
echo -n "Press any key or CTRL-C... "
read text
fi

rm -r -f recommend/104/job/20140716/2007001000/MA_KM/*.json
cp similarity/104/job/20140716/resume/sim_resume.txt input/.

node recommend_job.js

if [ "$1" != "demo" ]
then
echo -n "Press any key or CTRL-C... "
read text
fi

rm -r -f ../output/recommendation/*.json
cp recommend/104/job/20140716/2007001000/MA_KM/*.json ../output/recommendation


cd ..
