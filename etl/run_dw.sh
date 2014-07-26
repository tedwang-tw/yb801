#!/bin/sh
node cluster_group.js   
echo -n "Press any key... "
read text

node corpus_cluster.js
echo -n "Press any key... "
read text

node tfidf_cluster.js


