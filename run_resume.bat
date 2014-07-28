rem #!/bin/sh
cd crawler

del raw\104\vip\20140716\*.html
del text\104\vip\20140716\*.txt
del ..\etl\text\104\job\20140716\resume\*.txt

node vip_members.js demo

if /i [%1]==[demo] goto step1
pause

:step1
cd ..\etl

del corpus\104\job\20140716\resume\*.json

node corpus_detail.js resume

if /i [%1]==[demo] goto step2
pause

:step2
del synonym\104\job\20140716\resume\*.json

node synonym_detail.js resume

if /i [%1]==[demo] goto step3
pause

:step3
node corpus_merge.js resume

if /i [%1]==[demo] goto step4
pause

:step4
del tfidf\104\job\20140716\resume\*.txt

node tfidf_detail.js resume

if /i [%1]==[demo] goto step5
pause

:step5
copy tfidf\104\job\20140716\resume\resumelist.txt input\.

node similarity_job.js

if /i [%1]==[demo] goto step6
pause

:step6
del recommend\104\job\20140716\2007001000\MA_KM\*.json
copy similarity\104\job\20140716\resume\sim_resume.txt input\.

node recommend_job.js

if /i [%1]==[demo] goto step7
pause

:step7
del ..\output\recommendation\*.json
copy recommend\104\job\20140716\2007001000\MA_KM\*.json ..\output\recommendation

cd ..
