"""Build a small, public meeting/session *metadata* index for RaceVector.

No car telemetry or driver positions are redistributed. Run this during Pages
builds and on a daily schedule so visitors do not hammer OpenF1 for calendars.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from pipeline.ingest import get


def build_catalog(years: range, getter=get, now: datetime | None = None) -> dict:
    seasons = []
    for year in years:
        raw_meetings = getter('meetings', {'year': year})
        raw_sessions = getter('sessions', {'year': year})
        grouped = {}
        for s in raw_sessions:
            if s.get('session_type') == 'Testing' or s.get('session_name') == 'Testing':
                continue
            key = s.get('meeting_key')
            if key is None or not s.get('session_key') or not s.get('date_start'):
                continue
            grouped.setdefault(key, []).append({
                'session_key': s['session_key'],
                'session_name': s.get('session_name') or 'Session',
                'session_type': s.get('session_type') or '',
                'date_start': s['date_start'],
                'date_end': s.get('date_end') or '',
            })
        meetings = []
        for m in raw_meetings:
            if m.get('meeting_key') is None or not m.get('date_start'):
                continue
            name = m.get('meeting_name') or m.get('country_name') or 'Grand Prix'
            if 'testing' in name.lower() or m.get('is_cancelled') is True:
                continue
            meetings.append({
                'meeting_key': m['meeting_key'],
                'meeting_name': name,
                'country_name': m.get('country_name') or '',
                'circuit_short_name': m.get('circuit_short_name') or '',
                'date_start': m['date_start'],
                'date_end': m.get('date_end') or '',
                'sessions': sorted(grouped.get(m['meeting_key'], []), key=lambda s: s['date_start']),
            })
        if meetings:
            seasons.append({'year': year, 'meetings': sorted(meetings, key=lambda m: m['date_start'])})
    if not seasons:
        raise RuntimeError('OpenF1 calendar had no meetings; refusing to deploy an empty catalog')
    stamp = (now or datetime.now(timezone.utc)).isoformat()
    return {'schema_version': 1, 'source': 'OpenF1 meeting/session schedule metadata',
            'updated_at': stamp, 'seasons': seasons}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    today = datetime.now(timezone.utc).year
    parser.add_argument('--from-year', type=int, default=2023)
    parser.add_argument('--through-year', type=int, default=today + 1)
    parser.add_argument('--out', default='web/data/catalog.json')
    args = parser.parse_args()
    if args.through_year < args.from_year:
        parser.error('End year precedes start year')
    catalog = build_catalog(range(args.from_year, args.through_year + 1))
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(catalog, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Updated {path}: {sum(len(x["meetings"]) for x in catalog["seasons"])} real scheduled meetings '
          f'({catalog["seasons"][0]["year"]}–{catalog["seasons"][-1]["year"]})')


if __name__ == '__main__':
    main()