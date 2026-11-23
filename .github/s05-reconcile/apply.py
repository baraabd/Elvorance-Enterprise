"""Digest-checked source transfer to an existing development branch; never deploys."""
import base64
import hashlib
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys

BASE = 'ab2e4af8d26a5624759de7b23d78130d54281613'
TARGET = 'work/s05-admin-platform-20261123'
PACKED_HASH = '90ec580708c3195d0da75bec00607ae1a0e43438ce62c36922ddc0b25b55fbc5'
TEMP = Path(os.environ['RUNNER_TEMP'])
INPUT = TEMP / 's05-reconcile-input.json'
ROOT = Path.cwd().resolve()

def git(*args, **kwargs):
    return subprocess.check_output(['git', *args], **kwargs).decode().strip()

def safe_path(name):
    p = PurePosixPath(name)
    assert not p.is_absolute() and '..' not in p.parts and '.git' not in p.parts
    assert str(p) == name
    if p.parts[0] == '.github':
        assert name == '.github/workflows/full-ci.yml'
    else:
        assert p.parts[0] in {'apps', 'docs', 'packages', 'services', 'tests', 'tooling'} or name in {'package.json', 'package-lock.json', 'tsconfig.json'}
    dest = ROOT / name
    assert dest.resolve().is_relative_to(ROOT) and not dest.is_symlink()
    return dest

def verify(hashes):
    for name, expected in hashes.items():
        actual = hashlib.sha256(safe_path(name).read_bytes()).hexdigest()
        assert actual == expected, f'Content mismatch: {name}: {actual} != {expected}'

if sys.argv[1] == 'apply':
    packed = Path('.github/s05-reconcile/input.xz').read_bytes()
    assert len(packed) == 10428 and hashlib.sha256(packed).hexdigest() == PACKED_HASH
    raw = lzma.decompress(packed, memlimit=128 * 1024 * 1024)
    assert len(raw) == 29486
    data = json.loads(raw)
    assert (data['baseCommit'], data['targetBranch']) == (BASE, TARGET)
    assert len(data['beforeSha256']) == 8 and len(data['sha256']) == 39 and len(data['derivedSha256']) == 6
    for name in data['sha256'] | data['derivedSha256']:
        safe_path(name)
    INPUT.write_bytes(raw)
    git('checkout', '--detach', BASE)
    git('switch', '-c', TARGET)
    verify(data['beforeSha256'])
    patch = TEMP / 's05-reconcile.patch'
    patch.write_text(data['patch'])
    git('apply', '--check', str(patch))
    git('apply', '--index', str(patch))
    verify(data['sha256'])
    print('Verified source reconciliation and owned-browser cleanup on exact PR18 base; no remote changes.')
elif sys.argv[1] == 'publish':
    data = json.loads(INPUT.read_bytes())
    hashes = data['sha256'] | data['derivedSha256']
    verify(hashes)
    assert git('rev-parse', 'HEAD') == BASE
    git('add', '--', *sorted(hashes))
    expected = set(data['beforeSha256']) | (set(data['derivedSha256']) - {'docs/production/workflow-debt.json'})
    changed = set(git('diff', '--cached', '--name-only').splitlines())
    assert changed == expected, f'Unexpected staged changes: {changed.symmetric_difference(expected)}'
    assert not any(name.startswith('.github/') for name in changed), 'No workflow permission is requested.'
    assert not git('diff', '--name-only'), 'Unstaged tracked changes remain.'
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    git('commit', '-m', 'fix(admin): reconcile Sprint04 terms and await Chromium profile cleanup')
    commit = git('rev-parse', 'HEAD')
    assert git('rev-parse', 'HEAD^') == BASE
    assert not git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.github/s05-reconcile', '.github/workflows/s05-reconcile.yml')
    env = os.environ.copy()
    token = env.pop('GH_TOKEN')
    env['GIT_CONFIG_COUNT'] = '1'
    env['GIT_CONFIG_KEY_0'] = 'http.https://github.com/.extraheader'
    env['GIT_CONFIG_VALUE_0'] = 'AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode()
    ref = 'refs/heads/' + TARGET
    remote = git('ls-remote', '--exit-code', 'origin', ref, env=env)
    assert remote.split()[0] == BASE, 'Concurrent feature-branch update detected; refusing to overwrite.'
    git('push', 'origin', 'HEAD:' + ref, env=env)
    receipt = {'baseCommit': BASE, 'commit': commit, 'tree': git('rev-parse', 'HEAD^{tree}'), 'branch': TARGET, 'sourceSha256': hashes, 'deploymentPerformed': False, 'ciAcceptance': 'NOT_ESTABLISHED_BY_SOURCE_TRANSFER'}
    (TEMP / 's05-reconcile-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({k: v for k, v in receipt.items() if k != 'sourceSha256'}, indent=2))
else:
    raise SystemExit('Unknown operation')
