"""Structural validator for lifeflow data.json (L2 output check)."""

REQUIRED_TOP_KEYS = {
    'schema_version', 'updated_at', 'user', 'today', 'yesterday', 'projects'
}
REQUIRED_USER_KEYS = {'name', 'level', 'level_name', 'total_points', 'streak_days'}
REQUIRED_TODAY_KEYS = {'date', 'points', 'entries'}
REQUIRED_YESTERDAY_KEYS = {'date', 'points'}
REQUIRED_ENTRY_KEYS = {
    'time', 'task', 'project_id', 'project_delta_pct', 'points'
}
REQUIRED_PROJECT_KEYS = {
    'id', 'name', 'pct', 'today_delta_pct', 'color', 'category'
}
EXPECTED_PROJECT_IDS = {
    'knowledge_v4', 'knight_lv4', 'streak', 'japanese_n1',
    'clsbiogate', 'weight_loss', 'appearance',
}


def validate(data):
    """Return a list of error strings. Empty list means valid."""
    errors = []
    if not isinstance(data, dict):
        return ['root: not a dict']

    missing_top = REQUIRED_TOP_KEYS - set(data.keys())
    if missing_top:
        errors.append(f'root missing keys: {sorted(missing_top)}')

    if isinstance(data.get('user'), dict):
        errors.extend(_missing(data['user'], REQUIRED_USER_KEYS, 'user'))

    today = data.get('today')
    if isinstance(today, dict):
        errors.extend(_missing(today, REQUIRED_TODAY_KEYS, 'today'))
        entries = today.get('entries')
        if isinstance(entries, list):
            for i, entry in enumerate(entries):
                errors.extend(_missing(entry, REQUIRED_ENTRY_KEYS, f'today.entries[{i}]'))

    if isinstance(data.get('yesterday'), dict):
        errors.extend(_missing(data['yesterday'], REQUIRED_YESTERDAY_KEYS, 'yesterday'))

    projects = data.get('projects')
    if projects is not None:
        if not isinstance(projects, list):
            errors.append('projects: not a list')
        else:
            found_ids = set()
            for i, p in enumerate(projects):
                errors.extend(_missing(p, REQUIRED_PROJECT_KEYS, f'projects[{i}]'))
                if isinstance(p, dict) and isinstance(p.get('id'), str):
                    found_ids.add(p['id'])
            missing_projects = EXPECTED_PROJECT_IDS - found_ids
            if missing_projects:
                errors.append(f'missing projects: {sorted(missing_projects)}')

    return errors


def _missing(obj, required, path):
    if not isinstance(obj, dict):
        return [f'{path}: not a dict']
    gap = required - set(obj.keys())
    if gap:
        return [f'{path} missing keys: {sorted(gap)}']
    return []
