// Worked example scripts for Hyperion's machines and vehicles toolboxes (M482–M491), listed in the code window
// after the others (LabApp's EXAMPLES). Each runs as it is; `% slider lo hi` lines get a live control.

export const MACHINE_EXAMPLES: { name: string; code: string }[] = [
  { name: 'robot_arm.m', code: `% Robot arms: a six-axis arm, where its tool is, how to reach a point, and the torques
r = loadrobot('sixaxis');
q = [0 -0.6 0.9 0 0.5 0];
shoulder = -35;   % slider -120 40
q(2) = shoulder*pi/180;
show(r, q)
T = getTransform(r, q)
% Reach a point with the tool pointing straight down
goal = trvec2tform([0.5 0.2 0.4]) * eul2tform([0 pi 0]);
[qi, info] = robotIK(r, goal, q);
fprintf('robotIK: %s after %d steps\\n', info.Status, info.Iterations)
figure; show(r, qi)
% What holding that pose costs each motor (N·m), and how near a singular pose it is
tau = gravityTorque(r, qi)
m = manipulability(r, qi)
% A two-link arm let go from level: it swings down under gravity (ode45 on forwardDynamics)
two = loadrobot('twolink');
f = @(t, x) [x(3:4); forwardDynamics(two, x(1:2)', x(3:4)', [0 0])'];
[t, x] = ode45(f, [0 3], [0; 0; 0; 0]);
figure; plot(t, x(:, 1), t, x(:, 2)); legend('shoulder', 'elbow'); xlabel('t (s)'); ylabel('angle (rad)'); grid on
% Two arms on one waist: each hand is a tool of its own
d = loadrobot('dualarm');
q = [0.3 0.4 -0.8 0.6 -0.4 0.8 -0.6];
figure; show(d, q)
[qr, info] = robotIK(d, [0.35 -0.3 1.1], q, 'EndEffector', 7);   % the right hand reaches a point
% Is anything in the way? A ball near the right hand, and the arm against itself
[hit, gap] = checkCollision(d, qr, 'Spheres', [0.35 -0.3 1.1 0.1])
% A post and a wedge (any convex shape by its corners) near the left arm
wedge = [0.2 0.4 0.9; 0.5 0.4 0.9; 0.35 0.7 0.9; 0.35 0.55 1.3];
[hit, gap, selfPairs, hits] = checkCollision(d, q, 'Cylinders', [0.6 0 0 1.5 0.05], 'Meshes', {wedge})
` },
  { name: 'robot_motion.m', code: `% Robot motion: smooth joint moves, planning through a warehouse, and driving the path
% A joint moving 0 -> 90 deg -> 45 deg: cubic and quintic pieces, and a trapezoid with limits
t = 0:0.01:4;
[q3, qd3] = cubicpolytraj([0 90 45], [0 2 4], t);
[q5, qd5] = quinticpolytraj([0 90 45], [0 2 4], t);
subplot(1, 2, 1); plot(t, qd3, t, qd5); legend('cubic', 'quintic'); title('Speed (deg/s)'); grid on
[qt, qdt, ~, tt] = trapveltraj([0 90 45], 400, 'PeakVelocity', 80, 'Acceleration', 120);
subplot(1, 2, 2); plot(tt, qdt); title('Trapezoid: speed (deg/s)'); grid on
% Plan across a warehouse for a robot 0.4 m in radius
[map, res] = robotMap('warehouse');
grown = inflateMap(map, 0.4, res);
figure; astarGrid(grown, [2 2], [23 23], 'Resolution', res)
figure; rrtPlan(grown, [2 2], [23 23], 'Resolution', res, 'Star', true)
% Cut the corners and drive it by pure pursuit
p = astarGrid(grown, [2 2], [23 23], 'Resolution', res);
p = shortenPath(p, grown, res);
lookahead = 1;   % slider 0.3 3
figure; followPath(p, 'LookAhead', lookahead, 'Speed', 0.8, 'Map', map, 'Resolution', res)
% A car can't turn on the spot: the shortest forward-only way between two poses (a Dubins path)
figure; dubinsPath([0 0 0], [12 4 pi], 3)
% Allowed to reverse (Reeds–Shepp), a one-metre shuffle sideways is a short wiggle, not a loop
figure; reedsSheppPath([0 0 0], [0 1 0], 3)
% Parking: Hybrid A* drives arcs forwards and backwards and reverses into the empty bay
[park, r] = robotMap('parking');
figure; hybridAstar(park, [3 10 0], [18.9 3.2 pi/2], 'Resolution', r)
` },
  { name: 'robot_sensing.m', code: `% Robot sensing: a lidar, finding where you are, and building a map as you go
[map, res] = robotMap('rooms');
lidarSim(map, [4 17 0.3], 'Resolution', res, 'Beams', 120)
% Drive across the building (planned with room to spare), recording odometry and scans
safe = inflateMap(map, 0.7, res);
path = shortenPath(astarGrid(safe, [3 3], [22 22], 'Resolution', res), safe, res);
run = robotRun(map, path, 'Resolution', res, 'OdometryNoise', 0.08);
% Localisation from nowhere: 5000 particles spread over the free space
figure; mclLocalize(map, run, 'Resolution', res)
% SLAM: no map at all, only the scans and the drifting odometry
figure; slamGrid(run)
[M, poses] = slamGrid(run);
odometryMiss = norm(run.Odometry(end, 1:2) - run.True(end, 1:2))
slamMiss = norm(poses(end, 1:2) - run.True(end, 1:2))
% Round a loop and past the start: matching only the last 10 scans drifts slowly, closing the loop pulls it straight
safe2 = inflateMap(map, 0.7, res);
loop = [4 5; 12 7; 13 20; 5 17; 4 5; 12 7]; path2 = [];
for i = 1:size(loop, 1) - 1
  leg = shortenPath(astarGrid(safe2, loop(i, :), loop(i + 1, :), 'Resolution', res), safe2, res);
  if i > 1, leg = leg(2:end, :); end
  path2 = [path2; leg];
end
run2 = robotRun(map, path2, 'Resolution', res, 'OdometryNoise', 0.15);
figure; slamGrid(run2, 'Recent', 10)
% A pose graph with one wrong loop closure (pose 3 "seen" again at pose 7, but it's somewhere else):
% marked robust, the wrong edge is weighed down to almost nothing
P = [0 0 0; 1 0 0; 2 0 0; 3 0 0; 3 1 pi/2; 3 2 pi/2; 2 2 pi; 1 2 pi];
E = [(1:7)' (2:8)' [1 0 0; 1 0 0; 1 0 0; 0 1 pi/2; 1 0 0; 0 1 pi/2; 1 0 0] repmat([500 500 5000], 7, 1)];
E = [E; 1 8 1 2 pi 500 500 5000; 3 7 0 0 0 500 500 5000];
[Q, w] = optimizePoseGraph(P, E, 'Robust', true, 'Phi', 5);
disp(w(end-1:end))   % the true closure keeps its weight, the wrong one doesn't
` },
  { name: 'motors.m', code: `% Mechatronics: a DC motor with a speed controller, and a brushless motor under field-oriented control
m = dcmotor();                         % a small 24 V motor
G = dcmotorTF(m)                       % speed per volt, as a transfer function
kp = 0.02;   % slider 0.005 0.1
C = pid(kp, 2);                        % a PI controller
T = feedback(C*G, 1);
step(100*T, 0.2); title('Speed (rad/s) for a 100 rad/s request')
% The same motor driven straight at 24 V, a load from 0.1 s
figure; dcmotorSim(m, 24, 0.2, 'Load', 0.02, 'LoadAt', 0.1)
% A 1 kW brushless servo: speed up to 100 rad/s, then 2 N·m of load at 0.15 s
p = pmsm();
figure; focSim(p, 100, 0.3, 'Load', 2, 'LoadAt', 0.15)
s = focSim(p, 100, 0.3, 'Load', 2, 'LoadAt', 0.15);
fprintf('Torque current at the end: %.2f A (2 N·m / %.2f N·m/A)\\n', s.Iq(end), p.TorqueConstant)
% A 10:1 gearbox at 90 percent efficiency, and a 500-line encoder on a shaft turning at 5 rad/s
[Jm, bm, Tm] = gearReflect(0.05, 0.01, 8, 10, 0.9)
t = (0:0.001:0.1)'; [counts, ang, w] = encoderSim(t, 5*t, 500, 10); w(end)
% Faster than its base speed: field weakening (a negative d current) lets it reach 160 rad/s
figure; focSim(p, 160, 0.5)
% A stepper motor: ramped up it keeps every step; started at full speed it stalls and loses them
s = stepper();
figure; stepperSim(s, @(t) min(400, 2000*t), 0.4, 'Microsteps', 8)
figure; stepperSim(s, 3000, 0.2, 'Microsteps', 8)
figure; stepperPullout(s, [100 300 600 1000 1500 2000])
% A brushless motor driven six-step by its Hall sensors, holding 250 rad/s against a load
b = bldc();
figure; bldcSim(b, 0.3, 'Speed', 250, 'Load', 0.04)
% The same with the Halls 20 degrees off: more torque ripple
figure; bldcSim(b, 0.3, 'Speed', 250, 'Load', 0.04, 'HallOffset', 20)
% Heating: 8 A for 20 minutes, then 2 A (six-step: two phases carry the current)
figure; motorHeat(b.R, @(t) 8*(t < 1200) + 2*(t >= 1200), 3600, 'Phases', 2)
[~, info] = motorHeat(b.R, 0, 1, 'Phases', 2);
fprintf('Continuous rating: %.1f A\\n', info.Continuous)
` },
  { name: 'vehicles.m', code: `% Vehicle dynamics: how a car steers, accelerates and stops
c = vehicle();                          % a 1.5 t saloon, rear-driven, slightly understeering
h = vehicleHandling(c)                  % understeer gradient, characteristic speed
figure; vehicleHandling(c)
% A step of steering at 72 km/h: the yaw rate overshoots a little and settles
figure; vehicleSim(c, 'step', 3, 'Amplitude', 0.03, 'Speed', 20)
% The stability-control test at 100 km/h, coasting: this car stays straight...
figure; vehicleSim(c, 'sinedwell', 4, 'Amplitude', 0.06, 'InitialSpeed', 27.8, 'Force', 0)
% ...a car with weak rear tyres spins
loose = vehicle('Cr', 40000);
[r, info] = vehicleSim(loose, 'sinedwell', 4, 'Amplitude', 0.06, 'InitialSpeed', 27.8, 'Force', 0);
fprintf('Weak rear tyres: spun = %d, body slip up to %.0f degrees\\n', info.Spun, info.PeakSideSlip*180/pi)
% Straight lines: 0-100 km/h and the shortest stop from 100 km/h, dry and on snow
figure; accelRun(c)
[d, t] = brakingDistance(c, 27.78)
dSnow = brakingDistance(vehicle('Mu', 0.3), 27.78)
% The tyre's curve
a = linspace(-0.3, 0.3, 200);
figure; plot(a*180/pi, magicFormula(a, 10, 1.3, 1, -0.6)); grid on; xlabel('slip angle (deg)'); ylabel('side force / load')
% Body roll: the load moves to the outer tyres; the stiffer end loses grip first
stiffRear = vehicle('Roll', true, 'RollStiffFront', 20000, 'RollStiffRear', 80000);
[r, info] = vehicleSim(stiffRear, 'sinedwell', 4, 'Amplitude', 0.06, 'InitialSpeed', 27.8, 'Force', 0);
fprintf('Stiff rear roll bar: spun = %d, leaning up to %.1f degrees\\n', info.Spun, info.PeakRoll*180/pi)
van = vehicle('Roll', true, 'CgHeight', 1.1, 'Mass', 2200);
figure; vehicleSim(van, 'step', 3, 'Amplitude', 0.12, 'Speed', 25)   % a tall van lifts a wheel
% Rollover: a tall van in the fishhook test tips onto two wheels and rolls; on a slippery road it slides instead
van = vehicle('Mass', 2500, 'Inertia', 4500, 'CgHeight', 1.2, 'Cf', 110000, 'Cr', 140000, 'Track', 1.6, 'RollInertia', 1400, 'CamberRoll', [0.8 0.8], 'CamberStiffness', 0.1, 'RollSteer', [0.05 0.05]);
figure; vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'Speed', 22)
[~, dry] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'Speed', 22);
van.Mu = 0.55; [~, ice] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'Speed', 22);
fprintf('Dry road: rolled over %d; slippery: rolled over %d\\n', dry.RolledOver, ice.RolledOver)
% After rolling over it tumbles on; and a car sliding sideways into a kerb trips over it
van.Mu = 1; [~, hk] = vehicleSim(van, 'fishhook', 6, 'Amplitude', 0.12, 'InitialSpeed', 22, 'Force', 0);
fprintf('Rolled %d quarter turns, resting on its %s, %.1f m away\\n', hk.Rolls, hk.RestsOn, hk.TumbleDistance)
[~, kb] = vehicleTrip(vehicle('Roll', true), 12, 'Kerb', 0.15);
fprintf('A 15 cm kerb trips it from %.0f km/h sideways\\n', kb.TripSpeed*3.6)
% The people inside: unbelted they can be thrown out through a broken window; belts and curtain airbags keep them in
[~, nb] = vehicleTrip(vehicle('Roll', true), 18, 'Belts', 0);
[~, bc] = vehicleTrip(vehicle('Roll', true), 18, 'Belts', 1, 'Curtains', 1);
fprintf('Unbelted: thrown out at %.2f s, head %.0f g; belted with curtains: head %.0f g\\n', nb.ThrownOutAt, nb.HeadG, bc.HeadG)
% A head-on crash at 56 km/h (Euro NCAP's speed): belt and airbag against nothing at all
[~, ok] = vehicleCrash(vehicle(), 56/3.6);
[~, bad] = vehicleCrash(vehicle(), 56/3.6, 'Belts', 0, 'Airbags', 0);
fprintf('Belt + airbag: chest %.0f g, moved %.0f cm; nothing: chest %.0f g, hit the wheel = %d\\n', ok.ChestG, ok.Travel*100, bad.ChestG, bad.HitWheel)
% Only part of the front hitting at 64 km/h, and someone unbelted in the back pushing into the driver's seat
[~, off] = vehicleCrash(vehicle(), 64/3.6, 'Overlap', 0.25);
[~, bk] = vehicleCrash(vehicle(), 56/3.6, 'Behind', 'unbelted');
fprintf('Small overlap: %.0f cm into the cabin, slid off the airbag = %d; pushed from behind: hit the wheel = %d\\n', off.Intrusion*100, off.SlidOffAirbag, bk.HitWheel)
% A car into the side at 50 km/h: side and curtain airbags against none; the far side with someone beside
[~, sa] = vehicleSideCrash(vehicle(), 50/3.6);
[~, sn] = vehicleSideCrash(vehicle(), 50/3.6, 'Airbags', 0);
[~, sb] = vehicleSideCrash(vehicle(), 50/3.6, 'Seat', 'far', 'Beside', 1);
fprintf('Side: head %.0f g with airbags, %.0f g without; far side beside someone: head %.0f g\\n', sa.HeadG, sn.HeadG, sb.HeadG)
figure; vehicleTrip(vehicle('Roll', true), 15, 'Kerb', 0, 'Ground', 'soil')
` },
  { name: 'driving.m', code: `% Automated driving: keeping in lane and following the car ahead
c = vehicle();
r = roadPath('scurve');                       % 100 m left, then 100 m right
% Three lane keepers at 90 km/h: LQR feeds the bend forward and stays closest to the centre
for k = {'stanley', 'purepursuit', 'lqr'}
  [~, info] = laneKeep(c, r, 'Controller', k{1}, 'Speed', 25);
  fprintf('%-12s at most %.2f m off the centre\\n', k{1}, info.MaxError)
end
figure; laneKeep(c, 'lanechange', 'Controller', 'lqr', 'Speed', 20)
% Adaptive cruise: the car ahead slows from 90 to 30 km/h
figure; accFollow(c, @(t) 25 - 16.7*min(1, max(0, (t - 10)/4)), 40, 'TimeGap', 1.8, 'Gap', 70)
% A driver who doesn't react when the car ahead brakes hard: the emergency brake steps in
[f, info] = accFollow(c, @(t) max(0, 20 - 8*max(0, t - 5)), 15, 'ACC', 0, 'Gap', 40, 'InitialSpeed', 25);
fprintf('Crashed: %d, closest: %.1f m\\n', info.Crashed, info.MinGap)
` },
  { name: 'electric_car.m', code: `% Electric vehicles: how far a charge goes, where the energy goes, and how fast it charges
e = evModel();                                % about 78 kWh, 150 kW
fprintf('Pack: %.0f kWh at %.0f V\\n', e.BatteryKWh, e.NominalVoltage)
for name = {'city', 'suburban', 'motorway', 'mixed'}
  [~, info] = evSim(e, name{1});
  fprintf('%-9s %4.0f Wh/km, range about %3.0f km\\n', name{1}, info.WhPerKm, info.Range)
end
figure; evSim(e, 'mixed')
% Without regenerative braking, and in winter with 2.5 kW of heating
[~, a] = evSim(evModel('Regen', 0), 'city');
[~, b] = evSim(evModel('Accessories', 2500), 'city');
fprintf('City without regen: %.0f Wh/km; with the heating on: %.0f Wh/km\\n', a.WhPerKm, b.WhPerKm)
figure; evMotorMap(e)
figure; evCharge(e, 150)
` },
  { name: 'flight.m', code: `% Flight dynamics: the atmosphere, level flight, the natural modes and an autopilot
h = 0:1000:20000;
[T, a, P, rho] = atmosisa(h);
figure; plot(rho, h/1000); grid on; xlabel('density (kg/m^3)'); ylabel('height (km)'); title('The standard atmosphere')
ac = aircraft();                              % a light four-seater
tr = aircraftTrim(ac, 50, 1000)               % level at 50 m/s (97 knots), 1,000 m
m = aircraftModes(ac, 50, 1000)               % short period and phugoid
% A short nudge of the elevator: the nose bobs, then the slow phugoid trades height for speed
figure; aircraftSim(ac, 120, 'Elevator', @(t) -0.03*(t > 1 & t < 2))
% The autopilot climbs 150 m and holds the speed
figure; aircraftSim(ac, 90, 'HoldHeight', @(t) 1000 + 150*(t > 5), 'HoldSpeed', 50)
figure; aircraftPerformance(ac)
[n, R, t] = levelTurn(50, 45)                 % a 45-degree banked turn
% Rolling and yawing: the Dutch roll, the roll and the spiral
aircraftLateralModes(ac, 50, 1000)
figure; aircraftLateralSim(ac, 40, 'HoldHeading', 90, 'MaxBank', 30)            % the autopilot turns right
figure; aircraftLateralSim(ac, 15, 'Rudder', @(t) 0.15*(t > 0.5 & t < 1), 'YawDamper', 1)  % a rudder kick, damped
% The whole aeroplane at once: a half turn holding height and speed, then hands off (it sinks), and wind
ac = aircraft();
figure; aircraftSim6DOF(ac, 50, 'HoldHeading', 180, 'MaxBank', 35, 'HoldHeight', 1000, 'HoldSpeed', 50, 'YawDamper', 1)
[~, held] = aircraftSim6DOF(ac, 50, 'HoldHeading', 180, 'MaxBank', 35, 'HoldHeight', 1000, 'HoldSpeed', 50, 'YawDamper', 1);
[~, loose] = aircraftSim6DOF(ac, 50, 'HoldHeading', 180, 'MaxBank', 35);
fprintf('Held: lowest %.0f m, %.2f g; hands off: lowest %.0f m\\n', held.MinHeight, held.MaxLoadFactor, loose.MinHeight)
cw = aircraftSim6DOF(ac, 60, 'Wind', [0 10 0], 'HoldHeading', 0, 'HoldHeight', 1000, 'HoldSpeed', 50);
fprintf('A 10 m/s crosswind carried it %.0f m east in a minute\\n', cw.East(end))
[~, g] = aircraftSim6DOF(ac, 8, 'Gust', [2 60 4]);
fprintf('A 4 m/s gust: up to %.2f g\\n', g.MaxLoadFactor)
% An engine failing on a twin: it yaws towards the dead engine; the autopilot holds it on rudder
[~, out] = aircraftSim6DOF(ac, 40, 'Engines', 2, 'EngineFail', [2 2], 'HoldHeading', 0, 'YawDamper', 1);
fprintf('Engine out: %.0f m lost in 40 s; it can be held down to %.1f m/s (Vmc)\\n', 1000 - out.MinHeight, aircraftVmc(ac))
% Through a microburst at 300 m: a headwind, then falling air, then a tailwind
figure; aircraftSim6DOF(ac, 60, 'Height', 300, 'Microburst', [1500 0 600 15 8])
` },
  { name: 'orbits.m', code: `% Space flight: orbits, ground tracks, transfers and rockets (metres, m/s, degrees)
Re = 6378137;
[r, v] = keplerian2ijk(Re + 420e3, 0.0005, 51.64, 0, 0, 0);   % the space station's orbit
figure; orbitPropagate(r, v, 3*5560)                         % three turns and the ground track
[a, e, i, raan, argp, nu] = ijk2keplerian(r, v)
fprintf('Its plane turns %.2f degrees a day\\n', nodalPrecession(Re + 420e3, 0.0005, 51.64))
fprintf('Sun-synchronous at 700 km: %.2f degrees\\n', sunSyncInclination(700e3))
% From a 300 km parking orbit to geostationary
[dv1, dv2, t] = hohmannTransfer(Re + 300e3, 42164e3);
fprintf('Hohmann to GEO: %.0f + %.0f m/s, %.1f hours\\n', dv1, dv2, t/3600)
% Two positions an hour apart: which velocities join them? (Vallado's example)
[v1, v2] = lambertSolve([5000 10000 2100]*1e3, [-14600 2500 7000]*1e3, 3600)
% A two-stage rocket with 15 t on top
[dv, each] = rocketDeltaV([400000 25000 290; 100000 6000 340], 15000)
% The Sun and the Moon tip a geostationary orbit: 60 days with and without their pull
[gr, gv] = keplerian2ijk(42164.17e3, 0, 0.001, 0, 0, 0);
a1 = orbitPropagate(gr, gv, 60*86400, 'Step', 120, 'Epoch', [2026 1 1]);
a2 = orbitPropagate(gr, gv, 60*86400, 'Step', 120, 'Epoch', [2026 1 1], 'Sun', 1, 'Moon', 1);
[~, ~, i1] = ijk2keplerian([a1.X(end) a1.Y(end) a1.Z(end)], [a1.Vx(end) a1.Vy(end) a1.Vz(end)]);
[~, ~, i2] = ijk2keplerian([a2.X(end) a2.Y(end) a2.Z(end)], [a2.Vx(end) a2.Vy(end) a2.Vz(end)]);
fprintf('In 60 days the Sun and Moon tip it %.3f degrees (about %.2f a year)\\n', i2 - i1, (i2 - i1)*365.25/60)
moonPosition([2026 1 1])                       % where the Moon is (m)
% Air drag: how long a low orbit lasts, and one skimming the air falling
for h = [300 400 500 600]
  fprintf('%d km up: about %.0f days\\n', h, orbitDecay(h*1e3, 0.01))
end
[lr, lv] = keplerian2ijk(6378137 + 175e3, 0.001, 51.6, 0, 0, 0);
[tr, fell] = orbitPropagate(lr, lv, 2*86400, 'Drag', 0.01);
fprintf('Fell: %d after %.1f hours\\n', fell, tr.Time(end)/3600)
% The Sun's 11-year cycle: an active Sun swells the air and brings satellites down sooner
fprintf('400 km at a quiet Sun: %.0f days, average: %.0f, active: %.0f\\n', orbitDecay(400e3, 0.008, 70), orbitDecay(400e3, 0.008, 150), orbitDecay(400e3, 0.008, 230))
fprintf('Launched in 2030 (near a minimum): %.0f days; in 2025 (near a maximum): %.0f\\n', orbitDecay(400e3, 0.008, 2030), orbitDecay(400e3, 0.008, 2025))
figure; plot(2019:0.1:2042, solarFlux(2019:0.1:2042)); xlabel('year'); ylabel('F10.7'); title('The Sun''s cycle')
` },
  { name: 'railways.m', code: `% Railways: running a train along a line, driving to save energy, and how close trains can follow
t = trainModel('metro');
r = railRoute('metro');                       % six stations about a kilometre apart
figure; trainRun(t, r)                        % the fastest run
for c = [0 0.1 0.2]
  [~, info] = trainRun(t, r, 'Coast', c);
  fprintf('Coast %.1f: %.1f min, %.1f kWh\\n', c, info.Minutes, info.EnergyKWh)
end
% An intercity line with hills and curves
figure; trainRun(trainModel('intercity'), railRoute('intercity'), 'Coast', 0.1)
% Your own line: 2 km level at 100 km/h, then 1 km climbing 20 per thousand round a 500 m curve at 70 km/h
mine = railRoute([2000 0 0 100; 1000 20 500 70], [0 3000]);
[~, info] = trainRun(trainModel('metro'), mine)
% A 2,000-tonne freight train can't climb 25 per thousand on its own
[~, info] = trainRun(trainModel('freight'), railRoute('mountain'));
fprintf('Freight stalled %.1f km along the mountain line\\n', info.StalledAt/1000)
% Signalling: fixed blocks against moving block at 200 km/h
[h1, n1] = railHeadway(trainModel('intercity'), 200);
[h2, n2] = railHeadway(trainModel('intercity'), 200, 'Moving', 1);
fprintf('Fixed blocks: %.0f trains an hour; moving block: %.0f\\n', n1, n2)
% Five metro trains 90 s apart, 400 m blocks: the train graph shows them bunching
figure; railLine('metro', trainModel('metro'), (0:4)*90, 'Signals', 'fixed', 'Block', 400)
lt = railLine('metro', trainModel('metro'), (0:4)*90, 'Signals', 'moving')   % Delay and Held in minutes
% A slow freight train ahead of an intercity: it can't pass
mix = railLine('intercity', {trainModel('freight'), trainModel('intercity')}, [0 300])
% The power supply: 750 V DC, substations every 2.6 km; the lowest voltage drawn under the train graph
figure; railLine('metro', trainModel('metro'), (0:4)*60, 'Block', 400, 'Supply', 'metro', 'SubstationSpacing', 2600)
[~, ~, sup] = railLine('metro', trainModel('metro'), (0:4)*60, 'Block', 400, 'Supply', 'metro', 'SubstationSpacing', 5200);
fprintf('Substations only at the ends: down to %.0f V, trains tripped for %.0f s\\n', sup.MinVoltage, sup.TrippedSeconds)
% Single track both ways: trains pass only at stations; one late train makes the other wait
figure; railSingle('metro', trainModel('metro'), [1 -1 1 -1], [0 120 600 720])
[t1, clashes] = railSingle('metro', trainModel('metro'), [1 -1], [0 125], 'Late', [150 0])
[~, ~, stuck] = railSingle('metro', trainModel('metro'), [1 1 -1 -1], [0 60 0 60], 'Tracks', 1);
% Passing loops between stations, and a dispatcher that lets the important train through first
ic = trainModel('intercity');
t0 = railSingle('intercity', ic, [1 -1], [0 1200]);
t1 = railSingle('intercity', ic, [1 -1], [0 1200], 'Loops', [21e3 71e3]);
t2 = railSingle('intercity', ic, [1 -1], [0 1200], 'Dispatch', 'priority', 'Priority', [1 3]);
fprintf('Return train late: %.1f min, with loops %.1f, put first %.1f\\n', t0.Delay(2), t1.Delay(2), t2.Delay(2))
% An express through the middle stations, and a branch train joining at station 3
figure; railSingle('metro', trainModel('metro'), [1 1 -1 1], [0 240 120 360], 'Skip', {[], [2 3 4 5], [], []}, 'From', [NaN NaN NaN 3], 'Dispatch', 'best')
% Storage on a DC line: substations only at the ends, a supercapacitor midway
[~, ~, plain] = railLine('metro', trainModel('metro'), [0 150], 'Supply', 'metro', 'SubstationSpacing', 5200);
[~, ~, kept] = railLine('metro', trainModel('metro'), [0 150], 'Supply', 'metro', 'SubstationSpacing', 5200, 'Storage', 2600);
fprintf('From the substations: %.0f kWh, with storage %.0f kWh (stored %.0f, given back %.0f)\\n', plain.FromSubstationsKWh, kept.FromSubstationsKWh, kept.StoredKWh, kept.ReturnedKWh)
% A telephone cable 30 m from a 25 kV line: rail return against autotransformers
[~, ~, rr] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25', 'Cable', [30 100]);
[~, ~, at] = railLine('intercity', trainModel('intercity'), [0 300], 'Supply', 'ac25at', 'Cable', [30 100]);
fprintf('Induced while running: %.0f V (rails), %.0f V (autotransformers); a fault: %.0f V\\n', rr.MaxInducedVolts, at.MaxInducedVolts, rr.FaultInducedVolts)
fprintf('With one track at each station they lock up after %.1f minutes\\n', stuck)
% 25 kV AC: rail return against autotransformers, three intercity trains five minutes apart
for s = {'ac25', 'ac25at'}
  [~, ~, ac] = railLine('intercity', trainModel('intercity'), [0 300 600], 'Supply', s{1});
  fprintf('%s: lowest %.1f kV, %.0f kWh from the grid, %.0f s coasting through neutral sections\\n', s{1}, ac.MinVoltage/1000, ac.FromSubstationsKWh, ac.NeutralSeconds)
end
` },
  { name: 'deploy.m', code: `% Deploying to a car (M580): a speed controller as plain C, then as a ROS 2 node and an AUTOSAR component.
% The example inputs fix the sizes and types; the .zip files appear in Hyperion's files.
codegen('speedcontrol', {0, 0, 0}, 'Target', 'ROS 2', 'Rate', 50)
codegen('speedcontrol', {0, 0, 0}, 'Target', 'AUTOSAR', 'Rate', 100)
[a, b] = speedcontrol(20, 25, 30)

function [accel, brake] = speedcontrol(speed, target, gap)
  accel = 0.5 * (target - speed);
  if gap < 2 * speed
    accel = min(accel, -1.5);
  end
  accel = max(min(accel, 2), -6);
  brake = accel < -3;
end
` },
  { name: 'drivetests.m', code: `% Testing against requirements (M581): following a slower car, at several speeds and starting gaps
R = requirements();
R = addRequirement(R, 'R1', 'Never collides', @(m) ~m.Collided);
R = addRequirement(R, 'R2', 'Keeps at least 2 s to collision', @(m) m.MinTTC >= 2);
R = addRequirement(R, 'R3', 'Keeps at least 1 s of headway', @(m) m.MinHeadway >= 1);
[v, g] = meshgrid([12 16 20], [40 60 80]);
res = verifyScenarios(R, @(p) follow(p(1), p(2)), [v(:) g(:)]);
fprintf('%d of %d checks passed\\n', res.Passed, res.Passed + res.Failed)
disp(res.Results(~res.Results.Passed, :))
testReport(res, 'following.html', 'Title', 'Following a slower car')

function s = follow(speed, gap)
  s = drivingScenario('StopTime', 6);
  s = road(s, [0 0; 600 0], 'Lanes', 2);
  [s, e] = vehicle(s, 'Position', [0 -1.8]); s = trajectory(s, e, [0 -1.8; 600 -1.8], speed);
  [s, l] = vehicle(s, 'Position', [gap -1.8]); s = trajectory(s, l, [gap -1.8; 600 -1.8], 10);
end
` },
];
