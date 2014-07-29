rem #!/bin/sh
cd etl

del group\104\job\20140716\2007001000\MA_KM\*.json
copy ..\crawler\raw\104\job\20140716\2007001000\2007001000_url.txt input\joburl.txt
copy tfidf\104\job\20140716\2007001000\joblist.txt input\

node cluster_group.js   

pause

del ..\output\clusters\jobs\*.json
copy group\104\job\20140716\2007001000\MA_KM\*.json ..\output\clusters\jobs
move ..\output\clusters\jobs\clustergroup.json ..\output\clusters

del corpus_group\104\job\20140716\2007001000\MA_KM\*.json

node corpus_cluster.js

pause

del tfidf_group\104\job\20140716\2007001000\MA_KM\*.json

node tfidf_cluster.js

pause


del ..\output\clusters\keywords\*.json
copy tfidf_group\104\job\20140716\2007001000\MA_KM\*.json ..\output\clusters\keywords

cd ..
