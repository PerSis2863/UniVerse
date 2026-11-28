#!/usr/bin/env python3
# M583: checks Hyperion's AUTOSAR files (M580) with the official tools, once the owner has them. Off until then: with
# neither option it only says what it would need.
#   --xsd FILE   the official AUTOSAR schema (AUTOSAR_00049.xsd for R20-11, from autosar.org's
#                AUTOSAR_MMOD_XMLSchema download). Needs lxml (pip install lxml).
#   --tool CMD   a paid tool's own command-line check or import (Vector DaVinci, EB tresos, …), {file} standing for
#                the ARXML, e.g. --tool "my-tool --check {file}". Exit code 0 counts as passed.
# Usage: python3 arxml-official.py [--xsd FILE] [--tool CMD] file.arxml ... ; prints ALL OK or the problems (exit 1).
import argparse, shlex, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('--xsd'); ap.add_argument('--tool'); ap.add_argument('files', nargs='+')
a = ap.parse_args()
if not a.xsd and not a.tool:
    print('SKIPPED: give --xsd (the official AUTOSAR schema) and/or --tool (a paid tool\'s command)'); sys.exit(0)
ok = True
schema = None
if a.xsd:
    from lxml import etree
    schema = etree.XMLSchema(etree.parse(a.xsd))
for f in a.files:
    if schema is not None:
        from lxml import etree
        if schema.validate(etree.parse(f)): print('schema ok', f)
        else:
            ok = False
            for e in schema.error_log: print('  SCHEMA', f, f'line {e.line}:', e.message)
    if a.tool:
        cmd = [p.replace('{file}', f) for p in shlex.split(a.tool)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0: print('tool ok', f)
        else:
            ok = False; print('  TOOL', f, f'exit {r.returncode}:', (r.stdout + r.stderr).strip()[-2000:])
print('ALL OK' if ok else 'PROBLEMS')
sys.exit(0 if ok else 1)
