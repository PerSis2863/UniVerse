#!/usr/bin/env python3
# M582: checks Hyperion's AUTOSAR files (M580) with autosar-data (pip install autosar-data), a real ARXML library
# built from the AUTOSAR schemas. Usage: python3 arxml-check.py file.arxml ... ; prints ALL OK or the problems (exit 1).
"""Strict AUTOSAR check: schema-known elements and value formats (autosar-data's strict load), element order
inside every sequence, and every reference resolving (with a stand-in AUTOSAR_Platform package)."""
import sys, autosar_data as ad
PLATFORM = '''<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd">
<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_Platform</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>ImplementationDataTypes</SHORT-NAME><ELEMENTS>
%s
</ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>''' % '\n'.join(
  f'<IMPLEMENTATION-DATA-TYPE><SHORT-NAME>{n}</SHORT-NAME><CATEGORY>VALUE</CATEGORY></IMPLEMENTATION-DATA-TYPE>'
  for n in ['boolean','uint8','uint16','uint32','uint64','sint8','sint16','sint32','sint64','float32','float64'])
ok = True
def order(e):
    global ok
    t = e.element_type
    if str(t.content_mode).endswith('Sequence'):
        names = [s.element_name for s in t.sub_elements_spec]
        idx = [names.index(c.element_name) if c.element_name in names else -1 for c in e.sub_elements]
        if -1 in idx or idx != sorted(idx):
            ok = False; print('  ORDER', e.xml_path, [c.element_name for c in e.sub_elements])
    for c in e.sub_elements: order(c)
for f in sys.argv[1:]:
    m = ad.AutosarModel()
    try:
        fl, warnings = m.load_file(f, strict=True)
        m.load_buffer(PLATFORM, 'platform.arxml', strict=True)
    except Exception as e:
        ok = False; print('FAIL', f, e); continue
    print('loaded', f.split('/')[-1], fl.version, 'warnings:', warnings)
    bad = m.check_references()
    for e in bad: ok = False; print('  BROKEN REF', e.xml_path, e.character_data)
    order(m.root_element)
print('ALL OK' if ok else 'PROBLEMS')
sys.exit(0 if ok else 1)
