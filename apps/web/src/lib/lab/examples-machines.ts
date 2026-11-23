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
` },
];
