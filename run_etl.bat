rem #!/bin/sh
cd etl

node corpus_detail.js

pause

node synonym_detail.js

pause

node corpus_merge.js

pause

copy corpus_merge\104\job\20140716\2007001000\keywords_merge.txt input\.

node tfidf_detail.js

pause

del ..\output\mapreduce.*.txt

copy tfidf\104\job\20140716\2007001000\keywords_merge_sort_index.txt ..\output\mapreduce

node corpus_mapreduce.js

pause

copy corpus_merge\104\job\20140716\2007001000\jobword_merge.txt ..\output\mapreduce

cd ..
