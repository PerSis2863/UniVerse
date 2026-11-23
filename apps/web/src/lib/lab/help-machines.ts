// Help for Hyperion's machines and vehicles toolboxes (M482–M491), kept apart from help.ts so the branches that add
// toolboxes at the same time merge cleanly. Same form: `name | how to call it | what it does`, `# ` starts a section.

export const MACHINES_HELP = `
# Robot arms
loadrobot | r = loadrobot('sixaxis') | A ready arm as a struct: 'twolink' (two 1 m links, 1 kg at each tip, in a vertical plane), 'planar3', 'sixaxis' (shoulder, elbow, wrist: the PUMA 560's DH table) or 'scara'.
robotDH | r = robotDH(dh, 'Joints', 'RRP', 'Mass', m, 'CoM', c, 'Inertia', I, 'Gravity', g, 'Limits', L) | An arm from a Denavit–Hartenberg table, one row [a alpha d theta] a joint (standard DH); CoM n × 3 in each link's frame, Inertia n × 3 (its principal moments).
getTransform | T = getTransform(r, q, k) | Where the tool is (or frame k: 0 the base), as a 4 × 4 transform, for the joint positions q.
geometricJacobian | J = geometricJacobian(r, q) | The 6 × n Jacobian at the tool in the base frame: rows [ωx ωy ωz vx vy vz] for each joint's speed.
manipulability | m = manipulability(r, q) | How freely the tool can move (√det(J Jᵀ)); 0 at a singular pose. 'position' uses only the position rows.
robotIK | [q, info] = robotIK(r, T, q0, 'Weights', [1 1 1 1 1 1]) | Inverse kinematics: joint positions that put the tool at pose T (or position [x y z]), by damped least squares from q0, within the joints' limits; info.Status, info.PoseErrorNorm.
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

# Robot motion
cubicpolytraj | [q, qd, qdd] = cubicpolytraj(wpts, tpts, t, 'VelocityBoundaryCondition', V) | A cubic piece between each pair of waypoints (one column each, at times tpts), sampled at t: still at every waypoint unless speeds are given.
quinticpolytraj | [q, qd, qdd] = quinticpolytraj(wpts, tpts, t) | Quintic pieces: speeds and accelerations both chosen at each waypoint (0 unless given), for smoother starts and stops.
trapveltraj | [q, qd, qdd, t] = trapveltraj(wpts, n, 'PeakVelocity', v, 'Acceleration', a) | Trapezoidal speed through the waypoints: speed up, cruise, slow down, stopping at each; n samples. Without limits each segment takes 1 s.
robotMap | [map, res] = robotMap('warehouse') | A map to plan on: 'warehouse', 'rooms' or 'maze' (1 = blocked, res cells a metre).
inflateMap | m = inflateMap(map, radius, res) | Grows every wall by radius metres, so a robot that size can be planned as a point.
astarGrid | [path, info] = astarGrid(map, start, goal, 'Resolution', res, 'Connectivity', 8) | The shortest way over the grid by A* (positions in metres [x y], origin bottom-left). Drawn without outputs.
rrtPlan | [path, info] = rrtPlan(map, start, goal, 'Resolution', res, 'Star', true, 'MaxIterations', 3000) | A way by a rapidly-exploring random tree; 'Star' keeps rewiring it shorter (RRT*). 'MaxConnectionDistance', 'GoalBias', 'Seed'. Drawn with the tree without outputs.
shortenPath | p = shortenPath(path, map, res) | Cuts the corners a straight line can cut without touching a wall.
diffdriveStep | pose = diffdriveStep(pose, v, w, dt) | A differential-drive robot after dt seconds at speed v and turn rate w (pose [x y heading]).
purePursuit | [v, w, target] = purePursuit(pose, path, lookahead, speed) | The turn that curves the robot onto the point of the path lookahead metres ahead.
followPath | [poses, t] = followPath(path, 'LookAhead', 0.8, 'Speed', 0.6, 'MaxTurnRate', 2, 'Map', map, 'Resolution', res) | Drives a differential-drive robot along the path by pure pursuit; drawn (on the map if given) without outputs.
`;
