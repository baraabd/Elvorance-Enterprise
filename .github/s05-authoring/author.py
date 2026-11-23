"""One-time source transfer, not a deployment; only creates a new feature branch."""
import base64
import hashlib
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys

BASE = '453242e1256f6d876d170142b8ad235be9120344'
TREE = '6534bc4e7c7475e54e855095f652236f672ed052'
TARGET = 'work/s05-admin-platform-20261123'
PACKED_HASH = 'ecd2f4ebc80f65564c3858d5c8dfd86774e19ba04ff42f2b4f820aa861c640a1'
TEMP = Path(os.environ['RUNNER_TEMP'])
INPUT = TEMP / 's05-input.json'
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
    assert dest.resolve().is_relative_to(ROOT)
    assert not dest.is_symlink()
    return dest

def verify(hashes):
    for name, expected in hashes.items():
        actual = hashlib.sha256(safe_path(name).read_bytes()).hexdigest()
        assert actual == expected, f'Content mismatch: {name}: {actual} != {expected}'

if sys.argv[1] == 'apply':
    parts = sorted(Path('.github/s05-authoring').glob('part-*.xz'))
    assert len(parts) == 9
    packed = b''.join(p.read_bytes() for p in parts)
    assert len(packed) == 56840 and hashlib.sha256(packed).hexdigest() == PACKED_HASH
    raw = lzma.decompress(packed, memlimit=128 * 1024 * 1024)
    assert len(raw) == 300734
    data = json.loads(raw)
    assert (data['schemaVersion'], data['baseCommit'], data['baseTree'], data['targetBranch']) == (1, BASE, TREE, TARGET)
    assert len(data['sha256']) == 39 and len(data['derivedSha256']) == 6
    for name in data['sha256'] | data['derivedSha256']:
        safe_path(name)
    INPUT.write_bytes(raw)
    assert git('rev-parse', BASE + '^{tree}') == TREE
    git('checkout', '--detach', BASE)
    git('switch', '-c', TARGET)
    patch = TEMP / 's05-source.patch'
    patch.write_text(data['patch'])
    git('apply', '--check', str(patch))
    git('apply', '--index', str(patch))
    for name, content in data['newFiles'].items():
        assert name in data['sha256']
        dest = safe_path(name)
        assert not dest.exists(), f'Refusing overwrite of new file: {name}'
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)
    verify(data['sha256'])
    print('Verified and applied 39 authored source files on the exact main base; no remote branch changed.')
elif sys.argv[1] == 'publish':
    data = json.loads(INPUT.read_bytes())
    hashes = data['sha256'] | data['derivedSha256']
    verify(hashes)
    assert git('rev-parse', 'HEAD') == BASE
    git('add', '--', *sorted(hashes))
    changed = set(git('diff', '--cached', '--name-only').splitlines())
    assert changed == set(hashes), f'Unexpected staged paths: {changed.symmetric_difference(hashes)}'
    assert not git('diff', '--name-only'), 'Unstaged tracked changes remain'
    # GITHUB_TOKEN lacks workflows permission. Publish ordinary source only;
    # the existing authorized connector must write the verified workflow next.
    workflow = '.github/workflows/full-ci.yml'
    git('restore', '--source=' + BASE, '--staged', '--worktree', '--', workflow)
    assert set(git('diff', '--cached', '--name-only').splitlines()) == set(hashes) - {workflow}
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    git('commit', '-m', 'feat(admin): add real API workspace and browser acceptance source')
    commit = git('rev-parse', 'HEAD')
    assert git('rev-parse', 'HEAD^') == BASE
    assert not git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.github/s05-authoring', '.github/workflows/s05-authoring.yml')
    env = os.environ.copy()
    token = env.pop('GH_TOKEN')
    env['GIT_CONFIG_COUNT'] = '1'
    env['GIT_CONFIG_KEY_0'] = 'http.https://github.com/.extraheader'
    env['GIT_CONFIG_VALUE_0'] = 'AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode()
    ref = 'refs/heads/' + TARGET
    existing = subprocess.run(['git', 'ls-remote', '--exit-code', 'origin', ref], env=env, capture_output=True)
    assert existing.returncode == 2, 'Target branch must not exist; authentication failures also abort.'
    git('push', 'origin', 'HEAD:' + ref, env=env)
    receipt = {'baseCommit': BASE, 'baseTree': TREE, 'commit': commit, 'tree': git('rev-parse', 'HEAD^{tree}'), 'branch': TARGET, 'sourceSha256': {k: v for k, v in hashes.items() if k != workflow}, 'pendingAuthorizedWorkflowWrite': {workflow: hashes[workflow]}, 'deploymentPerformed': False, 'ciAcceptance': 'NOT_ESTABLISHED_BY_AUTHORING_JOB'}
    (TEMP / 's05-authoring-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({k: v for k, v in receipt.items() if k != 'sourceSha256'}, indent=2))
else:
    raise SystemExit('Unknown operation')
