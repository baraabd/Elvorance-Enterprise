# Sprint 05 source transfer — not a deployment

This temporary branch transports the locally authored and tested Admin increment when the execution container cannot resolve github.com for git push. The nine binary parts concatenate to a standard XZ-compressed UTF-8 JSON source manifest, SHA-256 `ecd2f4ebc80f65564c3858d5c8dfd86774e19ba04ff42f2b4f820aa861c640a1`. The manifest contains a normal patch, new text files, and expected file hashes, not dependencies or secrets.

The pinned Actions job verifies the compressed digest, checks out main's exact reviewed base `453242e1256f6d876d170142b8ad235be9120344`, applies the source, runs a locked install and checks, regenerates inventories without baseline resets, verifies all 45 resulting file digests, and creates **only** the new `work/s05-admin-platform-20261123` branch. It refuses an existing target. No main update, PR merge, infrastructure operation, or deployment is performed.

The feature commit's parent is the original main commit; this transport workflow and payload never enter feature history. The resulting PR must remain draft: local DOM/HTTP tests are not PostgreSQL/Chromium acceptance, identity role administration and audit APIs are missing, and the per-screen matrix records additional gaps. The normal FULL-CI workflow is triggered by the subsequently created PR, not represented by this authoring job.
