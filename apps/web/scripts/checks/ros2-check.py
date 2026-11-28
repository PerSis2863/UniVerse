#!/usr/bin/env python3
# M582: drives Hyperion's ROS 2 node for gainpeak (M580, deploy.test.ts) on a real ROS 2: a wrong-sized x first, then x
# without k, then k; prints what it published and how often. Run with the package built and the node launched.
import time, rclpy
from rclpy.node import Node
from std_msgs.msg import Float64, Float64MultiArray
rclpy.init(); n = Node('hyperion_check')
got = {'y': [], 'peak': []}
n.create_subscription(Float64MultiArray, '/gainpeak/y', lambda m: got['y'].append((time.time(), list(m.data), [(d.label, d.size, d.stride) for d in m.layout.dim])), 10)
n.create_subscription(Float64, '/gainpeak/peak', lambda m: got['peak'].append((time.time(), m.data)), 10)
px = n.create_publisher(Float64MultiArray, '/gainpeak/x', 10); pk = n.create_publisher(Float64, '/gainpeak/k', 10)
def spin(s):
    end = time.time() + s
    while time.time() < end: rclpy.spin_once(n, timeout_sec=0.01)
t0 = time.time()
while px.get_subscription_count() == 0 or pk.get_subscription_count() == 0:
    spin(0.1)
    if time.time() - t0 > 20: raise SystemExit('node not found')
bad = Float64MultiArray(); bad.data = [1.0, 2.0]; px.publish(bad); spin(1.0)
print('after wrong-size x only:', len(got['y']), len(got['peak']))
x = Float64MultiArray(); x.data = [1.0, 4.0, 2.0, 5.0, 3.0, 6.0]; px.publish(x); spin(1.0)
print('after x, before k:', len(got['y']), len(got['peak']))
k = Float64(); k.data = 3.0; pk.publish(k); t1 = time.time(); spin(3.0)
ys = [g for g in got['y'] if g[0] > t1 + 0.5]
rate = (len(ys) - 1) / (ys[-1][0] - ys[0][0])
print('y', ys[-1][1], 'layout', ys[-1][2]); print('peak', got['peak'][-1][1]); print('rate %.1f a second' % rate)
n.destroy_node(); rclpy.shutdown()
