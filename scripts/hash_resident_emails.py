#!/usr/bin/env python3
"""Generate data/resident_emails.json from a plain-text list of resident emails.

Usage:
    python3 scripts/hash_resident_emails.py residents.txt > data/resident_emails.json

Input: one email per line. Emails are lowercased/trimmed and SHA-256 hashed,
so the actual addresses never ship in the built site.
"""
import sys, json, hashlib
src = sys.argv[1] if len(sys.argv) > 1 else '/dev/stdin'
out = set()
with open(src) as f:
    for line in f:
        e = line.strip().lower()
        if e and '@' in e:
            out.add(hashlib.sha256(e.encode()).hexdigest())
print(json.dumps(sorted(out), indent=2))
