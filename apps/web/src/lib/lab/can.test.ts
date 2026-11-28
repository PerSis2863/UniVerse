import { describe, expect, it } from 'vitest';
import * as C from './can';
import { readOSM } from './osm';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Struct, type Cell } from './values';
import './machines-lab';

// M576: CAN (DBC, both byte orders, signs, value tables, multiplexing; .asc and candump logs) and OpenStreetMap roads.
const DBC = `VERSION ""
BO_ 291 EngineData: 8 ECU
 SG_ EngineSpeed : 7|16@0+ (0.25,0) [0|16383.75] "rpm" Vector__XXX
 SG_ CoolantTemp : 16|8@1+ (1,-40) [-40|215] "degC" Vector__XXX
 SG_ Torque : 24|12@1- (0.5,0) [-1024|1023.5] "Nm" Vector__XXX
 SG_ Gear : 39|4@0+ (1,0) [0|15] "" Vector__XXX
BO_ 2147484160 WheelSpeeds: 8 ABS
 SG_ Mode M : 0|2@1+ (1,0) [0|3] "" Vector__XXX
 SG_ FL m0 : 8|16@1+ (0.01,0) [0|655.35] "km/h" Vector__XXX
 SG_ RL m1 : 8|16@1+ (0.01,0) [0|655.35] "km/h" Vector__XXX
VAL_ 291 Gear 0 "Park" 1 "Reverse" 2 "Neutral" 3 "Drive" ;
`;
const OSM = `<?xml version="1.0"?><osm version="0.6">
<node id="1" lat="51.5000" lon="-0.1200"/><node id="2" lat="51.5000" lon="-0.1186"/><node id="3" lat="51.5009" lon="-0.1186"/>
<node id="4" lat="51.5004" lon="-0.1200"/><node id="5" lat="51.5004" lon="-0.1190"/>
<way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="primary"/><tag k="name" v="High Street"/><tag k="lanes" v="4"/></way>
<way id="11"><nd ref="4"/><nd ref="5"/><tag k="highway" v="footway"/></way>
<way id="12"><nd ref="4"/><nd ref="5"/><tag k="building" v="yes"/></way>
<way id="13"><nd ref="1"/><nd ref="4"/><tag k="highway" v="residential"/></way>
</osm>`;

describe('Hyperion recorded driving data (M576)', () => {
  const db = C.readDBC(DBC);
  it('decodes Motorola and Intel signals, signs, offsets and multiplexing, and encodes them back', () => {
    expect(db.map((m) => [m.name, m.id, m.extended])).toEqual([['EngineData', 291, false], ['WheelSpeeds', 512, true]]);
    const data = [0x12, 0x34, 0x5a, 0xfe, 0x3f, 0, 0, 0];
    expect(C.decodeFrame(db[0], data)).toEqual({ EngineSpeed: 1165, CoolantTemp: 50, Torque: -1, Gear: 3 });
    expect(C.encodeFrame(db[0], { EngineSpeed: 1165, CoolantTemp: 50, Torque: -1, Gear: 3 })).toEqual(data);
    expect(db[0].signals[3].values![3]).toBe('Drive');
    expect(C.decodeFrame(db[1], C.encodeFrame(db[1], { Mode: 1, RL: 12.34 }))).toEqual({ Mode: 1, RL: 12.34 });
    expect(C.encodeFrame(db[0], { CoolantTemp: 999 })[2]).toBe(255); // held to its 8 bits
  });
  it('reads Vector ASCII and candump logs, and writes .asc back', () => {
    const asc = C.writeASC([{ t: 0.01, channel: 1, id: 291, extended: false, data: [1, 2, 3, 4, 5, 6, 7, 8] }, { t: 0.02, channel: 2, id: 512, extended: true, data: [1, 0, 4] }]);
    const back = C.readCANLog(asc);
    expect(back.map((f) => [f.t, f.channel, f.id, f.extended, f.data.length])).toEqual([[0.01, 1, 291, false, 8], [0.02, 2, 512, true, 3]]);
    const cd = C.readCANLog('(1600000000.100000) can0 123#12345AFE3F000000\n(1600000000.200000) can1 00000200#0034040000000000\n(1600000000.3) can0 123#R\n(1600000000.4) can0 123##1AABBCC');
    expect(cd.map((f) => [f.id, f.extended, f.channel, f.data.length])).toEqual([[0x123, false, 1, 8], [0x200, true, 2, 8], [0x123, false, 1, 3]]);
    const tt = C.signalTimetables(cd, db);
    expect(tt.EngineData.signals.EngineSpeed[0]).toBe(1165); expect(tt.WheelSpeeds.signals.FL[0]).toBeCloseTo(10.76); expect(tt.WheelSpeeds.signals.RL[0]).toBeNaN();
  });
  it('reads OpenStreetMap roads in metres, drivable ones only', () => {
    const { roads } = readOSM(OSM);
    expect(roads.map((r) => [r.name, r.lanes])).toEqual([['High Street', 4], ['residential 2', 2]]);
    // 0.0014° of longitude at 51.5° is about 97 m; 0.0009° of latitude about 100 m
    const hs = roads[0].centers;
    expect(hs[1][0] - hs[0][0]).toBeCloseTo(97, 0); expect(hs[2][1] - hs[1][1]).toBeCloseTo(100, 0);
  });
  it('in the language', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files });
    files.putText('car.dbc', DBC); files.putText('map.osm', OSM);
    files.putText('drive.log', '(1.0) can0 123#12345AFE3F000000\n(1.1) can0 123#13345AFE3F000000\n');
    l.run(`db = canDatabase('car.dbc'); f = readCANLog('drive.log'); tt = canSignalTimetable(f, db); e = canSignalTimetable(f, db, 'EngineData');
d = canFrame(db, 'EngineData', struct('EngineSpeed', 1500, 'Gear', 3)); writeCANLog(f, 'out.asc'); g = readCANLog('out.asc');
s = drivingScenario(); s = roadNetwork(s, 'OpenStreetMap', 'map.osm');`);
    expect(toMat((l.vars.get('e') as Struct).f.get('EngineSpeed')!).d[1]).toBe(0x1334 * 0.25);
    expect(toMat(l.vars.get('d')!).d[0]).toBe(0x17); // 1500 rpm / 0.25 = 6000 = 0x1770
    expect(toMat((l.vars.get('g') as Struct).f.get('ID')!).d[0]).toBe(0x123);
    expect(((l.vars.get('s') as Struct).f.get('Roads') as Cell).d).toHaveLength(2);
  });
});
