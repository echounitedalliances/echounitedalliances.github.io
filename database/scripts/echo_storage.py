"""Supabase Storage for Echo's local tools, over its S3 protocol.

The keys live in .env at the repository root (git-ignored; .env.example
lists them). They are read here and nowhere else, and never printed: an S3
access key can write anything in the project's Storage, so it stays on the
machine that runs the weekly build.

The bucket the site reads is public -- anyone may GET a file by its URL,
which is what lets the departure boards and timetables load without a key --
and only these keys may write to it.
"""
from __future__ import annotations

import gzip
import os
import re
from pathlib import Path

import boto3
from botocore.config import Config

REPO = Path(__file__).resolve().parents[2]
PROJECT_REF = 'ehthjudmsptplumafglo'
BUCKET = 'schedule'
PUBLIC_BASE = f'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/{BUCKET}/'


def _env() -> dict[str, str]:
    values: dict[str, str] = {}
    path = REPO / '.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$', line)
            if m:
                values[m[1]] = m[2].strip('\'"')
    # The process environment wins, so a CI runner can supply them instead.
    for k in list(values) + ['SUPABASE_S3_ACCESS_KEY_ID', 'SUPABASE_S3_SECRET_ACCESS_KEY']:
        if os.environ.get(k):
            values[k] = os.environ[k]
    return values


def client():
    env = _env()
    missing = [k for k in ('SUPABASE_S3_ENDPOINT', 'SUPABASE_S3_REGION',
                           'SUPABASE_S3_ACCESS_KEY_ID', 'SUPABASE_S3_SECRET_ACCESS_KEY')
               if not env.get(k)]
    if missing:
        raise SystemExit(f'.env is missing {", ".join(missing)} (see .env.example).')
    return boto3.client(
        's3',
        endpoint_url=env['SUPABASE_S3_ENDPOINT'],
        region_name=env['SUPABASE_S3_REGION'],
        aws_access_key_id=env['SUPABASE_S3_ACCESS_KEY_ID'],
        aws_secret_access_key=env['SUPABASE_S3_SECRET_ACCESS_KEY'],
        config=Config(s3={'addressing_style': 'path'}, retries={'max_attempts': 5, 'mode': 'standard'},
                      max_pool_connections=32),
    )


def put_json(s3, key: str, body: bytes, *, compress: bool = True, max_age: int = 1800) -> None:
    """One file, gzip-compressed, cacheable for half an hour by default."""
    extra = {'ContentType': 'application/json', 'CacheControl': f'public, max-age={max_age}'}
    if compress:
        body = gzip.compress(body, compresslevel=9, mtime=0)
        extra['ContentEncoding'] = 'gzip'
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, **extra)
