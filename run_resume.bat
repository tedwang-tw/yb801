rem #!/bin/sh
cd crawler

node vip_members.js demo

pause

cd ../etl

node corpus_detail.js resume

pause

node synonym_detail.js resume

pause
node corpus_merge.js resume

pause

#cp corpus_merge/104/job/20140716/2007001000/keywords_merge.txt input/.

node tfidf_detail.js resume

pause

copy tfidf\104\job\20140716\resume\resumelist.txt input\.

node similarity_job.js

pause

copy similarity\104\job\20140716\resume\sim_resume.txt input\.

node recommend_job.js

cd ..
