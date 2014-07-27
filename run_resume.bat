rem #!/bin/sh
cd crawler

del raw\104\vip\20140716\*.html
del text\104\vip\20140716\*.txt
del ..\etl\text\104\job\20140716\resume\*.txt

node vip_members.js demo

pause

cd ..\etl

del corpus\104\job\20140716\resume\*.json

node corpus_detail.js resume

pause

del synonym\104\job\20140716\resume\*.json

node synonym_detail.js resume

pause

node corpus_merge.js resume

pause

del tfidf\104\job\20140716\resume\*.txt

node tfidf_detail.js resume

pause

copy tfidf\104\job\20140716\resume\resumelist.txt input\.

node similarity_job.js

pause

del recommend\104\job\20140716\2007001000\MA_KM\*.json
copy similarity\104\job\20140716\resume\sim_resume.txt input\.

node recommend_job.js

pause

del ..\output\recommendation\*.json
copy recommend\104\job\20140716\2007001000\MA_KM\*.json ..\output\recommendation

cd ..
