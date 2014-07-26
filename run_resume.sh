#!/bin/sh
cd crawler

node vip_members.js demo

echo -n "Press any key... "
read text

cd ../etl

node corpus_detail.js resume

echo -n "Press any key... "
read text

node synonym_detail.js resume

echo -n "Press any key... "
read text

node corpus_merge.js resume

echo -n "Press any key... "
read text

#cp corpus_merge/104/job/20140716/2007001000/keywords_merge.txt input/.

node tfidf_detail.js resume

echo -n "Press any key... "
read text

cp tfidf/104/job/20140716/resume/resumelist.txt input/.

node similarity_job.js

echo -n "Press any key... "
read text

cp similarity/104/job/20140716/resume/sim_resume.txt input/.

node recommend_job.js

cd ..
