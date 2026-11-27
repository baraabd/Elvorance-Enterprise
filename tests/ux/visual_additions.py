"""Explicit new-route evidence, never a blanket exemption for missing screenshots.

Sprint 07 adds Representative's schedule. A baseline predating that route cannot
supply its screenshots. Keep every old comparison and record these three new
captures separately; independent visual approval remains outstanding.
"""
import hashlib
import json
from PIL import Image

# Reviewed route additions only. Unknown additions and all removals still fail.
DECLARED_NEW_ROUTES = {('rep', 'schedule')}
CAPTURE_WIDTHS = {390, 768, 1440}


def _audit(folder, captures):
    rows = json.loads((folder / 'results.json').read_text())
    if not isinstance(rows, list) or not rows:
        raise ValueError('Missing browser audit rows')
    named = [row['screenshot'] for row in rows if row.get('screenshot')]
    if len(named) != len(set(named)) or set(named) != set(captures):
        raise ValueError('Screenshot files do not match the executed browser audit')
    return rows


def declared_additions(before_folder, after_folder, before, after):
    """Validate the *entire* difference against recorded, clean new-route cases."""
    if not before or set(before) - set(after):
        raise ValueError('An existing baseline screenshot is missing')
    added = set(after) - set(before)
    if not added:
        return []
    old_rows = _audit(before_folder, before)
    new_rows = _audit(after_folder, after)
    old_routes = {(row['app'], row['route']) for row in old_rows}
    new_routes = {(row['app'], row['route']) for row in new_rows} - old_routes
    if not new_routes or not new_routes <= DECLARED_NEW_ROUTES:
        raise ValueError('Undeclared route addition')
    expected = {
        f'{app}-{route}-{width}-records.png'
        for app, route in new_routes for width in CAPTURE_WIDTHS
    }
    if added != expected:
        raise ValueError('Missing, extra, or renamed new-route screenshot')
    evidence = []
    for app, route in sorted(new_routes):
        rows = [row for row in new_rows if (row['app'], row['route']) == (app, route)]
        cases = [(row['width'], row['scenario']) for row in rows]
        required = {(320, 'records'), (390, 'records'), (768, 'records'),
                    (1440, 'records'), (390, 'empty'), (390, 'error')}
        if len(cases) != len(required) or set(cases) != required:
            raise ValueError('New route lacks the complete responsive/state audit')
        for row in rows:
            diagnostics = row['diagnostics']
            if (diagnostics['overflow'] or diagnostics['overlappingNavLabels'] or
                    row['pageErrors'] or row['unexpectedRequests'] or row['axe']['violations']):
                raise ValueError('New route failed browser acceptance')
            if row['scenario'] != 'records' or row['width'] not in CAPTURE_WIDTHS:
                continue
            name = f"{app}-{route}-{row['width']}-records.png"
            if row['screenshot'] != name:
                raise ValueError('New route screenshot does not match its audit case')
            path = after[name]
            with Image.open(path) as image:
                image.load()
                if image.width != row['width'] or image.height < 900:
                    raise ValueError('New route screenshot has invalid viewport dimensions')
                size = image.size
            evidence.append({'screenshot': name, 'afterSize': size,
                             'afterSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                             'baseline': 'ROUTE_NOT_PRESENT',
                             'visualApproval': 'REQUIRES_REVIEW_NOT_A_GOLDEN_BASELINE'})
    return evidence
