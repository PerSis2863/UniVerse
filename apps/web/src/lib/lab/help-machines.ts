// Help for Hyperion's machines and vehicles toolboxes (M482–M491), kept apart from help.ts so the branches that add
// toolboxes at the same time merge cleanly. Same form: `name | how to call it | what it does`, `# ` starts a section.

export const MACHINES_HELP = `
# Robot arms
loadrobot | r = loadrobot('sixaxis') | A ready arm as a struct: 'twolink' (two 1 m links, 1 kg at each tip, in a vertical plane), 'planar3', 'sixaxis' (shoulder, elbow, wrist: the PUMA 560's DH table), 'scara' or 'dualarm' (a turning waist with two arms: links 2–4 left, 5–7 right).
robotDH | r = robotDH(dh, 'Joints', 'RRP', 'Mass', m, 'CoM', c, 'Inertia', I, 'Gravity', g, 'Limits', L) | An arm from a Denavit–Hartenberg table, one row [a alpha d theta] a joint (standard DH); CoM n × 3 in each link's frame, Inertia n × 3 (its principal moments); 'Parent' the link each hangs from (0 the base), so an arm can branch.
getTransform | T = getTransform(r, q, k) | Where the tool is (or frame k: 0 the base), as a 4 × 4 transform, for the joint positions q.
geometricJacobian | J = geometricJacobian(r, q, tool) | The 6 × n Jacobian at the tool in the base frame: rows [ωx ωy ωz vx vy vz] for each joint's speed (tool: which link's end, the last by default).
manipulability | m = manipulability(r, q) | How freely the tool can move (√det(J Jᵀ)); 0 at a singular pose. 'position' uses only the position rows.
robotIK | [q, info] = robotIK(r, T, q0, 'Weights', [1 1 1 1 1 1], 'EndEffector', k) | Inverse kinematics: joint positions that put the tool at pose T (or position [x y z]), by damped least squares from q0, within the joints' limits; info.Status, info.PoseErrorNorm.
massMatrix | M = massMatrix(r, q) | The joint-space mass matrix M(q).
gravityTorque | g = gravityTorque(r, q) | The torques that hold the arm still against gravity.
velocityProduct | c = velocityProduct(r, q, qd) | The Coriolis and centrifugal torques C(q, q̇) q̇.
inverseDynamics | tau = inverseDynamics(r, q, qd, qdd) | The torques for that motion (recursive Newton–Euler, gravity included).
forwardDynamics | qdd = forwardDynamics(r, q, qd, tau) | The joint accelerations torques tau give: M \\ (τ − C q̇ − g).
show | show(r, q), show(map, res) | Draws the arm at joint positions q (the tool's axes in red, green and blue), or a map.
robotWorkspace | P = robotWorkspace(r, n) | Where the tool can reach: n random poses within the joints' limits (drawn without outputs).
eul2rotm | R = eul2rotm([z y x], 'ZYX') | A rotation matrix from Euler angles (radians; 'ZYX' by default, also 'XYZ' and 'ZYZ').
rotm2eul | e = rotm2eul(R, 'ZYX') | Euler angles (radians) of a rotation matrix.
eul2tform | T = eul2tform([z y x]) | A 4 × 4 transform that only turns.
tform2eul | e = tform2eul(T) | The Euler angles of a transform.
trvec2tform | T = trvec2tform([x y z]) | A 4 × 4 transform that only moves.
tform2trvec | p = tform2trvec(T) | The position part of a transform.
rotm2tform | T = rotm2tform(R) | A rotation as a 4 × 4 transform.
tform2rotm | R = tform2rotm(T) | The rotation part of a transform.
axang2rotm | R = axang2rotm([x y z angle]) | A turn of angle (radians) about an axis.
rotm2axang | v = rotm2axang(R) | A rotation as [x y z angle].
rotx | R = rotx(deg) | A turn about x, in degrees.
roty | R = roty(deg) | A turn about y, in degrees.
rotz | R = rotz(deg) | A turn about z, in degrees.
checkCollision | [hit, gap, selfPairs, obstacleHits] = checkCollision(r, q, 'Spheres', [x y z radius], 'Boxes', [x1 y1 z1 x2 y2 z2], 'Cylinders', [x y z1 z2 r], 'Meshes', {corners}, 'Radius', 0.05) | Whether the arm touches itself or obstacles: each link a capsule round it. Cylinders stand upright; a mesh is any convex shape given by its corners (N × 3; a shape that isn't convex counts as its hull), several in a cell array. Obstacles are numbered spheres, boxes, cylinders, meshes. gap: the smallest distance between surfaces; the pairs of link numbers (and link, obstacle number) that touch. A negative gap is how deep the worst overlap goes.

# Robot motion
cubicpolytraj | [q, qd, qdd] = cubicpolytraj(wpts, tpts, t, 'VelocityBoundaryCondition', V) | A cubic piece between each pair of waypoints (one column each, at times tpts), sampled at t: still at every waypoint unless speeds are given.
quinticpolytraj | [q, qd, qdd] = quinticpolytraj(wpts, tpts, t) | Quintic pieces: speeds and accelerations both chosen at each waypoint (0 unless given), for smoother starts and stops.
trapveltraj | [q, qd, qdd, t] = trapveltraj(wpts, n, 'PeakVelocity', v, 'Acceleration', a) | Trapezoidal speed through the waypoints: speed up, cruise, slow down, stopping at each; n samples. Without limits each segment takes 1 s.
robotMap | [map, res] = robotMap('warehouse') | A map to plan on: 'warehouse', 'rooms', 'maze' or 'parking' (1 = blocked, res cells a metre).
inflateMap | m = inflateMap(map, radius, res) | Grows every wall by radius metres, so a robot that size can be planned as a point.
astarGrid | [path, info] = astarGrid(map, start, goal, 'Resolution', res, 'Connectivity', 8) | The shortest way over the grid by A* (positions in metres [x y], origin bottom-left). Drawn without outputs.
rrtPlan | [path, info] = rrtPlan(map, start, goal, 'Resolution', res, 'Star', true, 'MaxIterations', 3000) | A way by a rapidly-exploring random tree; 'Star' keeps rewiring it shorter (RRT*). 'MaxConnectionDistance', 'GoalBias', 'Seed'. Drawn with the tree without outputs.
shortenPath | p = shortenPath(path, map, res) | Cuts the corners a straight line can cut without touching a wall.
diffdriveStep | pose = diffdriveStep(pose, v, w, dt) | A differential-drive robot after dt seconds at speed v and turn rate w (pose [x y heading]).
purePursuit | [v, w, target] = purePursuit(pose, path, lookahead, speed) | The turn that curves the robot onto the point of the path lookahead metres ahead.
followPath | [poses, t] = followPath(path, 'LookAhead', 0.8, 'Speed', 0.6, 'MaxTurnRate', 2, 'Map', map, 'Resolution', res) | Drives a differential-drive robot along the path by pure pursuit; drawn (on the map if given) without outputs.
dubinsPath | [poses, len, word] = dubinsPath(start, goal, R) | The shortest forward-only way for a car with turning radius R between two poses [x y heading]: three pieces (left, straight, right arcs), e.g. 'LSR'. Drawn without outputs.
reedsSheppPath | [poses, len, word, lengths] = reedsSheppPath(start, goal, R) | The shortest way for a car with turning radius R between two poses [x y heading] when it may also reverse (Reeds–Shepp): up to five pieces, e.g. 'LRSL'; poses have a 4th column, −1 while reversing, and lengths are negative backwards. Drawn when no output is asked (violet forwards, orange backwards). MATLAB keeps this in reedsSheppConnection.
hybridAstar | [poses, info] = hybridAstar(map, start, goal, 'Resolution', res, 'MinTurningRadius', 5, 'CarLength', 4.5, 'CarWidth', 1.8, 'Reverse', true) | A route a car can drive (finishing with a Reeds–Shepp shot when it may reverse, a Dubins one when not; arcs no tighter than its turning radius, forwards and backwards) between poses at its rear axle: rows [x y heading direction], direction −1 when reversing. robotMap('parking') is a car park to try it in. Drawn without outputs.

# Robot sensing
lidarSim | [ranges, angles] = lidarSim(map, pose, 'Resolution', res, 'Beams', 180, 'MaxRange', 8, 'FieldOfView', 2*pi, 'Noise', 0.02) | A lidar's scan from a pose [x y heading] on a map (each beam to the first wall, max range if none). Drawn with its beams without outputs.
robotRun | run = robotRun(map, path, 'Resolution', res, 'Beams', 90, 'OdometryNoise', 0.05) | A robot driven along a path: run.True (where it really was), run.Odometry (what its wheels say, drifting), run.Scans (one row of ranges a step), run.Angles.
mclLocalize | [poses, info] = mclLocalize(map, run, 'Resolution', res, 'Particles', 5000, 'Start', pose) | Monte Carlo localisation (a particle filter): where the robot is from its odometry and scans. Without 'Start' it begins knowing nothing (particles everywhere). Drawn without outputs.
slamGrid | [M, poses, origin, closures, rejected] = slamGrid(run, 'Resolution', 4, 'Recent', 10, 'LoopClosure', true) | SLAM: builds the map and corrects the poses together, each scan matched to the map so far ('Recent', n: only to the last n scans, as lidar odometry does, with loop closures on). Loop closure: back at a place seen long ago, the scan is matched there and the whole path re-solved as a pose graph; closures lists [from to]. M: the chance each cell is blocked (row 1 at the top), origin [x y] of its corner. Also slamGrid(odometry, scans, angles). Each loop closure is robust: one that disagrees with the rest of the path is set aside (rejected) instead of bending the map.
optimizePoseGraph | [P, w] = optimizePoseGraph(poses, edges, 'Robust', true, 'Phi', 1) | The poses that agree best with every measured move: poses rows [x y heading], edges rows [i j dx dy dtheta] (the move from pose i to j in i's frame), optionally with weights [wx wy wtheta] after. Gauss–Newton, pose 1 held still. With 'Robust', edges between poses that aren't neighbours (loop closures) are weighed down when they disagree (dynamic covariance scaling, Phi the disagreement allowed in full); w gives each edge's final weight, near 0 for a wrong one.
buildMap | [M, origin] = buildMap(scans, poses, angles, res, maxRange) | An occupancy map from scans taken at known poses (log-odds: free along each beam, blocked where it ends).

# Mechatronics
dcmotor | m = dcmotor('R', 1.2, 'L', 0.6e-3, 'K', 0.05, 'J', 2e-5, 'B', 1e-5) | A DC motor as a struct (a small 24 V motor unless given): resistance, inductance, motor constant (V·s/rad = N·m/A), inertia, friction.
dcmotorTF | G = dcmotorTF(m, 'speed') | The motor as a transfer function from voltage: 'speed', 'position' or 'current'; use it with step, bode, pid and feedback.
dcmotorSim | [t, w, i, theta] = dcmotorSim(m, V, T, 'Load', TL, 'LoadAt', t0) | The motor driven by V volts (a number or @(t) …) for T seconds, a load torque from t0. Drawn without outputs.
pmsm | p = pmsm('PolePairs', 4, 'FluxLinkage', 0.05, 'Rs', 0.2, 'Ld', 5e-4, 'Lq', 5e-4, 'Vdc', 48, 'Imax', 20) | A permanent-magnet synchronous motor (also a BLDC driven with sine waves) as a struct, with its torque constant, most torque and base speed.
focTune | g = focTune(p, 'CurrentBandwidth', 500, 'SpeedBandwidth', 20) | Gains for field-oriented control: current PIs that cancel the winding's pole, a speed PI (bandwidths in Hz).
focSim | s = focSim(p, wRef, T, 'Load', TL, 'LoadAt', t0, 'Gains', g, 'FieldWeakening', true, 'MTPA', true) | The PMSM under field-oriented control following a speed (rad/s, a number or @(t) …): i_d set for the most torque per amp, and pushed negative above the base speed so the motor can go faster than the supply's voltage would otherwise allow (turn either off with 0). A table of speed, i_d, i_q, voltages, torque and phase currents. Drawn without outputs. 'PWM', 10000 switches the inverter for real (space-vector PWM at that frequency, the controller sampled once a period): the currents show the switching ripple.
clarke | ab = clarke(abc) | Three phases (rows [a b c]) to the two-axis α–β frame (amplitude kept).
invclarke | abc = invclarke(ab) | α–β back to three phases.
park | dq = park(ab, theta) | α–β into the rotor's d–q frame at angle theta (radians, one or one a row).
invpark | ab = invpark(dq, theta) | d–q back to α–β.
gearReflect | [J, b, T] = gearReflect(J, b, T, N, efficiency) | A load behind a gearbox of ratio N as the motor sees it: inertia and damping over N², torque over N·efficiency.
encoderSim | [counts, angle, speed] = encoderSim(t, theta, lines, window) | A quadrature encoder (4 counts a line): its counts, the angle they say, and the speed from counts over a window of samples.
stepper | s = stepper('Current', 1.5, 'Supply', 24, 'Teeth', 50, 'Km', 0.3) | A two-phase hybrid stepper motor (200 full steps a turn by default) and its current-controlled driver, as a struct with its holding torque.
stepperSim | [r, lost] = stepperSim(s, rate, T, 'Microsteps', 8, 'Load', TL) | The stepper driven at a step rate (full steps a second, a number or @(t) …): the commanded and real angles, speed and phase currents, and how many steps it lost (a load too heavy or a start too fast). Drawn without outputs.
stepperPullout | T = stepperPullout(s, rates, microsteps) | The pull-out torque curve: at each step rate, the most load the motor carries without losing steps (found by simulation). Drawn without outputs.
bldc | b = bldc('R', 0.3, 'L', 0.2e-3, 'Ke', 0.03, 'PolePairs', 4, 'J', 3e-5, 'B', 2e-5, 'Vdc', 24) | A brushless DC motor with trapezoidal back-EMF (a struct): per-phase resistance, inductance and back-EMF constant (V·s/rad), with its torque constant (2·Ke), no-load speed and stall current worked out.
bldcSim | r = bldcSim(b, T, 'Duty', 0.5, 'Speed', w, 'Load', 0.05, 'HallOffset', 20) | Six-step (trapezoidal) driving with Hall sensors: in each 60° sector two phases are switched on and the third floats, its current dying away through a diode (the dip in torque at each change). A fixed duty or a speed loop; 'HallOffset' misplaces the sensors (electrical degrees). A table: Time, Speed, Ia, Ib, Ic, Torque, Duty, Sector; drawn when no output is asked. 'PWM', 20000 switches the high side for real instead of using its average.
motorHeat | [h, info] = motorHeat(R, I, T, 'Rwh', 0.6, 'Rha', 1.2, 'Cw', 60, 'Ch', 900, 'Ambient', 25, 'Limit', 155, 'Phases', 1, 'ExtraLoss', 0) | How hot a motor gets: the winding (heated by its copper loss, its resistance R at 25 °C rising 0.39 % a kelvin) and the housing (cooled by the air), thermal resistances in K/W and capacities in J/K. I a number or @(t) …; 'Phases' the loss factor (1 DC, 1.5 three-phase dq amplitude, 2 six-step). A table: Time, Winding, Housing, Loss; info.Continuous is the most current it carries for ever without passing the limit, info.OverLimitAt when it passes it (NaN if never).
`;
