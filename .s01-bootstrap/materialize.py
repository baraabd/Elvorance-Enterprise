"""Materialize only the reviewed source payload; fail on any transport mismatch."""
from pathlib import Path
import base64
import hashlib
import lzma
import os
import shutil
import subprocess

BASE = '699df1bfd80a45e03b6883307aa8b863955c2fbe'
parent = subprocess.check_output(['git', 'rev-parse', 'HEAD^'], text=True).strip()
if parent != BASE:
    raise SystemExit(f'Unexpected bootstrap parent: {parent}')
root = Path('.s01-bootstrap')
output = Path(os.environ['RUNNER_TEMP']) / 's01-closure-input'
output.mkdir(mode=0o700)

def blob(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

# Correct one recorded transport-character loss, then verify the ORIGINAL bytes.
# This does not modify the reviewed patch. Both reconstructed and compressed
# payload digests below must match before any code is executed or applied.
bad = (root / 'source.0').read_bytes()
if blob(bad) != 'e3fc73b7cf84ff4c4e9d8eebcb97bf3f10759f3f':
    raise SystemExit('Unexpected transport fragment')
encoded = base64.b64encode(bad).decode().rstrip('=')
if len(encoded) != 8743:
    raise SystemExit('Unexpected fragment length')
encoded = encoded[:1472] + '+' + encoded[1472:]
encoded = encoded[:-4] + '7AoJ'
first = base64.b64decode(encoded, validate=True)
if blob(first) != '077ad6a9deddc510d0c3520d7a613def24663444':
    raise SystemExit('Transport reconstruction mismatch')
source = first + b''.join((root / f'source.{n}').read_bytes() for n in range(1, 4))
builder = b''.join((root / f'builder.{n}').read_bytes() for n in range(2))
for name, data, digest in [
    ('source.patch', source, '82644974c6d2fbe000a0050ede0c0bf8cf69c7562562e4893b99c2909fd71cee'),
    ('binding-builder.py', builder, 'e63aaec2fe780ae54c5206021724bd81d30d89f2fb0f98ce58e5cd47f904dd58'),
]:
    if hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit(f'Payload SHA-256 mismatch: {name}')
    (output / name).write_bytes(lzma.decompress(data))
# Remove temporary transport from actual-source discovery without adding a
# scanner exclusion. The final connector commit removes it from the Git tree.
shutil.rmtree(root)
Path('.github/workflows/s01-closure-bootstrap.yml').unlink()
subprocess.run(['git', 'apply', '--check', str(output / 'source.patch')], check=True)
subprocess.run(['git', 'apply', str(output / 'source.patch')], check=True)
print('Verified and applied reviewed source; temporary transport removed from worktree.')
