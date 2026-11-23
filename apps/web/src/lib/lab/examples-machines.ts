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
];
