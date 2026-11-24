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
` },
];
