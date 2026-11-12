#!/bin/sh
# Post step files to the QA8 driver: scripts/qa8/run.sh file.js [file2.js ...]
for f in "$@"; do curl -s --max-time 1800 --data-binary @"$f" 127.0.0.1:${QA_CTL:-4505}/run; done
