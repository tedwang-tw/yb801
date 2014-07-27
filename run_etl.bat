rem #!/bin/sh
node corpus_detail.js

pause

node synonym_detail.js

pause

node corpus_merge.js

pause

copy corpus_merge\104\job\20140716\2007001000\keywords_merge.txt input\.

node tfidf_detail.js

pause

node corpus_mapreduce.js

