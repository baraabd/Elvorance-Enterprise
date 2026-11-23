#!/usr/bin/env python3
"""Export the checked source inventory; never infer executed coverage from test links."""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE_SHA = "453242e1256f6d876d170142b8ad235be9120344"


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def write_csv(name, rows, fields):
    with (OUT / name).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="raise")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                             if isinstance(value, (list, dict)) else value
                             for key, value in row.items()})


def classification(feature):
    if feature["mode"] == "demo":
        if "/features/configuration/" in feature["source"]["path"]:
            return "جزئي", "Optional configuration API sync; not a complete server workspace."
        return "غير مرتبط", "Demo registration/local state is separate from server workspace; local functionality may work."
    return "جزئي", "Implementation/source trace observed; no exhaustive hosted workflow acceptance."


def main():
    inventory = load("docs/production/feature-matrix.json")
    for source in inventory["sourceFiles"]:
        actual = hashlib.sha256((ROOT / source["path"]).read_bytes()).hexdigest()
        if actual != source["sha256"]:
            raise RuntimeError("Stale inventory source: " + source["path"])
    rows = []
    for feature in inventory["features"]:
        status, reason = classification(feature)
        rows.append({
            "id": feature["id"], "kind": feature["kind"], "key": feature["key"],
            "apps": feature["apps"], "mode": feature["mode"], "classification": status,
            "classificationScope": reason, "source": feature["source"]["path"],
            "line": feature["source"]["line"], "endLine": feature["source"]["endLine"],
            "sourceFingerprint": feature["source"]["fingerprint"],
            "owningService": feature["owningService"], "proposedTargetService": feature["targetService"],
            "endpoints": feature["endpoints"], "authorization": feature["authorization"],
            "persistenceEvents": feature["persistenceEvent"], "testCandidates": feature["tests"]["related"],
            "testEvidenceScope": feature["tests"]["verification"],
            "remainingWarnings": feature["unresolved"], "proposedSprint": feature["targetSprint"],
        })
    fields = list(rows[0])
    write_csv("observations.csv", rows, fields)
    for kind, filename in [("route", "screens.csv"), ("action", "actions.csv"),
                           ("api-route", "api-routes.csv"), ("permission", "permissions.csv")]:
        write_csv(filename, [row for row in rows if row["kind"] == kind], fields)
    registered = {feature["id"]: feature for feature in inventory["features"] if feature["kind"] == "api-route"}
    operations = []
    for operation in load("packages/contracts/route-inventory.json"):
        path = re.sub(r"\{([^}]+)\}", r":\1", operation["servicePath"])
        key = f"api-route:{operation['service']}:backend:{operation['method']} {path}"
        if key not in registered:
            raise RuntimeError("Unregistered documented operation: " + key)
        feature = registered[key]
        operations.append({**operation, "classification": "جزئي", "registrationId": key,
                           "source": feature["source"], "sourceAuthorization": feature["authorization"],
                           "persistenceEvents": feature["persistenceEvent"],
                           "testCandidates": feature["tests"]["related"],
                           "caveat": "Declared roles and source guards are not an executed role/tenant/owner deny matrix."})
    write_csv("api-operations.csv", operations, list(operations[0]))
    dependencies = []
    for folder in ["apps", "packages", "services"]:
        for manifest in sorted((ROOT / folder).glob("*/package.json")):
            doc = json.loads(manifest.read_text())
            for scope in ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]:
                for name, version in sorted(doc.get(scope, {}).items()):
                    dependencies.append({"workspace": doc["name"], "manifest": str(manifest.relative_to(ROOT)),
                                         "scope": scope, "dependency": name, "declaredVersion": version})
    root = load("package.json")
    for scope in ["dependencies", "devDependencies"]:
        for name, version in sorted(root.get(scope, {}).items()):
            dependencies.append({"workspace": root["name"], "manifest": "package.json", "scope": scope,
                                 "dependency": name, "declaredVersion": version})
    write_csv("dependencies.csv", dependencies, list(dependencies[0]))
    summary = {"schemaVersion": 1, "baseSha": BASE_SHA, "sourceDigest": inventory["sourceDigest"],
               "scope": "Source-derived inventory; classifications are not production acceptance.",
               "totals": inventory["totals"], "classifications": dict(Counter(row["classification"] for row in rows)),
               "businessOperations": len(operations),
               "businessOperationsByService": dict(Counter(row["service"] for row in operations)),
               "limitations": inventory["limitations"],
               "missingAndBrokenCapabilities": "See FEATURE-GAPS.md; absence is not an invented registration.",
               "boundedCompletedSlices": "See FEATURE-GAPS.md and local-results.json; candidate links alone never grant completion."}
    (OUT / "inventory-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"observations": len(rows), "businessOperations": len(operations),
                      "sourceDigest": inventory["sourceDigest"]}))


if __name__ == "__main__":
    main()
