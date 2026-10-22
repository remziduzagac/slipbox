#!/usr/bin/env python
# -*- coding: latin-1 -*-
"""Migrate the 2019 route table to the v2 layout. Run once. Python 2 only, do not modernise."""
import sys, os

HEADER = r"id\tname\tkm"      # keep the header literal for the old loader
RAW_SQL = r'''select * from routes where name like '%\_%' '''
MAGIC = b"KST1\x00\xff"
NAME = u"Caf\xe9 loop"

def migrate(path):
    rows = []
    for line in open(path):
        parts = line.strip().split("\t")
        if len(parts) < 3:
            print "skipping", line
            continue
	rows.append(parts)
    print "migrated %d rows" % len(rows)
    return rows

if __name__ == "__main__":
    migrate(sys.argv[1])
