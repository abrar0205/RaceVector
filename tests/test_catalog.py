from datetime import datetime, timezone
from pipeline.catalog import build_catalog


def test_catalog_keeps_real_schedule_and_filters_testing():
    def get(endpoint, query):
        assert query == {'year': 2026}
        if endpoint == 'meetings':
            return [
                {'meeting_key': 2, 'meeting_name': 'Demo Grand Prix', 'country_name': 'Test',
                 'date_start': '2026-12-01T00:00:00Z', 'circuit_short_name': 'Circuit'},
                {'meeting_key': 1, 'meeting_name': 'Pre-Season Testing', 'date_start': '2026-01-01T00:00:00Z'},
                {'meeting_key': 3, 'meeting_name': 'Cancelled Race', 'date_start': '2026-04-01T00:00:00Z', 'is_cancelled': True},
            ]
        return [
            {'meeting_key': 2, 'session_key': 20, 'session_name': 'Race', 'session_type': 'Race',
             'date_start': '2026-12-03T15:00:00Z', 'date_end': '2026-12-03T17:00:00Z'},
            {'meeting_key': 2, 'session_key': 19, 'session_name': 'Qualifying', 'session_type': 'Qualifying',
             'date_start': '2026-12-02T15:00:00Z', 'date_end': '2026-12-02T16:00:00Z'},
            {'meeting_key': 1, 'session_key': 18, 'session_type': 'Testing',
             'date_start': '2026-01-01T00:00:00Z'},
        ]
    c = build_catalog(range(2026, 2027), get, datetime(2026, 11, 20, tzinfo=timezone.utc))
    assert c['source'].startswith('OpenF1')
    assert c['seasons'][0]['meetings'][0]['meeting_key'] == 2
    assert [x['session_name'] for x in c['seasons'][0]['meetings'][0]['sessions']] == ['Qualifying', 'Race']
    assert 'car' not in str(c) and 'location' not in str(c)


def test_empty_catalog_is_rejected():
    import pytest
    with pytest.raises(RuntimeError, match='empty catalog'):
        build_catalog(range(2027, 2028), lambda *args: [])