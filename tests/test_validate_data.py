"""Structural validation of data.json produced by L2."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from scripts.validate_data import validate  # noqa: E402


def _sample():
    return {
        'schema_version': '0.1',
        'updated_at': '2026-04-20T16:00:00+09:00',
        'user': {
            'name': '吴昊',
            'level': 1,
            'level_name': '史莱姆',
            'total_points': 240,
            'streak_days': 3,
        },
        'today': {
            'date': '2026-04-20',
            'points': 150,
            'entries': [
                {
                    'time': '09:30',
                    'task': '跑步',
                    'project_id': 'weight_loss',
                    'project_delta_pct': 2,
                    'points': 50,
                }
            ],
        },
        'yesterday': {'date': '2026-04-19', 'points': 120},
        'projects': [
            {
                'id': pid,
                'name': pid,
                'pct': 0,
                'today_delta_pct': 0,
                'color': '#000000',
                'category': 'misc',
            }
            for pid in [
                'knowledge_v4',
                'knight_lv4',
                'streak',
                'japanese_n1',
                'clsbiogate',
                'weight_loss',
                'appearance',
            ]
        ],
    }


def test_valid_sample_passes():
    assert validate(_sample()) == []


def test_missing_top_key_caught():
    data = _sample()
    del data['user']
    errors = validate(data)
    assert any('user' in e for e in errors), f'expected missing-user error, got {errors}'


def test_missing_project_id_caught():
    data = _sample()
    data['projects'] = data['projects'][:6]  # drop one
    errors = validate(data)
    assert any('missing projects' in e for e in errors), f'expected missing-projects error, got {errors}'


def test_malformed_entry_caught():
    data = _sample()
    data['today']['entries'] = [{'time': '09:30'}]
    errors = validate(data)
    assert any('entries[0]' in e for e in errors), f'expected entries[0] error, got {errors}'


def test_non_dict_root_caught():
    errors = validate('not a dict')
    assert len(errors) > 0
