import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Lab } from './interp';
import { FileStore } from './files';
import { toMat, type Cell, type Struct } from './values';
import './codegen-lab';

// M580: a function's C wrapped as a ROS 2 node and as an AUTOSAR component. The component is built with the computer's
// C compiler and run through its stand-in RTE; the node is built against small stand-ins for rclcpp and std_msgs that
// record subscriptions, the timer and what is published, so its logic runs too. Both must match Hyperion's answers.
const SRC = `function [y, peak] = gainpeak(x, k)
  y = zeros(2, 3);
  peak = -1e300;
  for j = 1:3
    for i = 1:2
      y(i, j) = k * x(i, j);
      if y(i, j) > peak
        peak = y(i, j);
      end
    end
  end
end
function c = clampc(v)
  c = min(max(v, int16(-100)), int16(100));
end`;
const has = (cmd: string) => { try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const lab = () => { const files = new FileStore(); const l = new Lab({ out: () => {}, files }); l.run(SRC); return { l, files }; };
const unpack = (files: FileStore, zip: string, dir: string) => { const u = unzipSync(files.get(zip).bytes); for (const [k, v] of Object.entries(u)) { mkdirSync(dirname(join(dir, k)), { recursive: true }); writeFileSync(join(dir, k), v); } return Object.fromEntries(Object.entries(u).map(([k, v]) => [k, strFromU8(v)])); };

/** Every reference (DEST="…">/A/B/C<) names an element whose SHORT-NAME path exists, and the tags balance. */
function arxmlRefs(x: string) {
  const paths = new Set<string>(), stack: string[] = [], names: (string | null)[] = [], refs: string[] = [];
  for (const m of x.matchAll(/<(\/?)([A-Z0-9-]+)[^>]*?(\/?)>([^<]*)/g)) {
    const [, close, tag, self, text] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== tag) throw new Error(`unbalanced </${tag}>`); names.pop(); continue; }
    stack.push(tag); names.push(null);
    if (tag === 'SHORT-NAME') { names[names.length - 2] = text; paths.add('/' + names.filter(Boolean).join('/')); }
    if (/-REF$|-TREF$/.test(tag)) refs.push(text.trim());
  }
  if (stack.length) throw new Error(`unclosed <${stack.at(-1)}>`);
  return refs.filter((r) => !r.startsWith('/AUTOSAR_Platform/') && !paths.has(r));
}

describe('Hyperion deployment: ROS 2 and AUTOSAR (M580)', () => {
  it('writes a ROS 2 package and an AUTOSAR component, with sound references', () => {
    const { l, files } = lab();
    l.run("codegen('gainpeak', {zeros(2, 3), 1}, 'Target', 'ROS 2', 'Rate', 20); r = codegen('gainpeak', {zeros(2, 3), 1}, 'Target', 'AUTOSAR', 'Rate', 100, 'Name', 'GainSwc');");
    const ros = unpack(files, 'gainpeak_ros.zip', mkdtempSync(join(tmpdir(), 'hyp-ros-')));
    expect(Object.keys(ros).sort()).toEqual(['gainpeak_ros/CMakeLists.txt', 'gainpeak_ros/README.md', 'gainpeak_ros/launch/gainpeak.launch.py', 'gainpeak_ros/package.xml', 'gainpeak_ros/src/gainpeak.c', 'gainpeak_ros/src/gainpeak.h', 'gainpeak_ros/src/gainpeak_node.cpp']);
    expect(ros['gainpeak_ros/package.xml']).toContain('<name>gainpeak_ros</name>');
    expect(ros['gainpeak_ros/src/gainpeak_node.cpp']).toContain('declare_parameter<double>("rate_hz", 20.0)');
    const r = l.vars.get('r') as Struct, names = (r.f.get('Files') as Cell).d.map((x) => (x.k === 'str' ? x.v : ''));
    expect(names).toContain('GainSwc/GainSwc.arxml');
    const arxml = ((r.f.get('Texts') as Cell).d[names.indexOf('GainSwc/GainSwc.arxml')] as { v: string }).v;
    expect(arxmlRefs(arxml)).toEqual([]);
    expect(arxml).toContain('<PERIOD>0.01</PERIOD>'); expect(arxml).toContain('<ARRAY-SIZE>6</ARRAY-SIZE>');
    expect(() => l.run("codegen('gainpeak', {zeros(2, 3), 1}, 'Target', 'Simulink')")).toThrow(/ROS 2/);
    expect(() => l.run("codegen('gainpeak', {zeros(2, 3), 1}, 'Rate', -1)")).toThrow(/Rate/);
  });
  it.runIf(has('cc'))('the AUTOSAR component builds and runs through its RTE with Hyperion’s answers', () => {
    const { l, files } = lab();
    l.run("codegen('gainpeak', {zeros(2, 3), 1}, 'Target', 'AUTOSAR'); codegen('clampc', {int16(0)}, 'Target', 'AUTOSAR'); [y, p] = gainpeak([1 2 3; 4 5 6], -2.5); c = clampc(int16(250));");
    const dir = mkdtempSync(join(tmpdir(), 'hyp-ar-'));
    unpack(files, 'GainpeakSwc.zip', dir); unpack(files, 'ClampcSwc.zip', dir);
    const d = join(dir, 'GainpeakSwc'), test = `#include <stdio.h>
#include "Rte_GainpeakSwc.h"
int main(void) {
  const double x[6] = {1, 4, 2, 5, 3, 6};
  for (int i = 0; i < 6; i++) Rte_Test_In_x[i] = x[i];
  Rte_Test_In_k = -2.5;
  GainpeakSwc_Init(); GainpeakSwc_Step();
  for (int i = 0; i < 6; i++) printf("%g ", Rte_Test_Out_y[i]);
  printf("%g\\n", Rte_Test_Out_peak);
  return 0;
}`;
    writeFileSync(join(d, 'test.c'), test);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-I.', '-o', 'run', 'test.c', 'GainpeakSwc.c', 'Rte_GainpeakSwc.c', 'gainpeak.c', '-lm'], { cwd: d });
    const got = execFileSync(join(d, 'run')).toString().trim().split(' ').map(Number);
    expect(got).toEqual([...toMat(l.vars.get('y')!).d, toMat(l.vars.get('p')!).d[0]]);
    const d2 = join(dir, 'ClampcSwc');
    writeFileSync(join(d2, 'test.c'), '#include <stdio.h>\n#include "Rte_ClampcSwc.h"\nint main(void) { Rte_Test_In_v = 250; ClampcSwc_Step(); printf("%d\\n", (int)Rte_Test_Out_c); return 0; }');
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-I.', '-o', 'run', 'test.c', 'ClampcSwc.c', 'Rte_ClampcSwc.c', 'clampc.c', '-lm'], { cwd: d2 });
    expect(Number(execFileSync(join(d2, 'run')).toString())).toBe(toMat(l.vars.get('c')!).d[0]);
  });
  it.runIf(has('c++') && has('cc'))('the ROS 2 node waits for every input, then publishes Hyperion’s answers at its rate', () => {
    const { l, files } = lab();
    l.run("codegen('gainpeak', {zeros(2, 3), 1}, 'Target', 'ROS 2', 'Rate', 25); [y, p] = gainpeak([1 2 3; 4 5 6], 3);");
    const dir = mkdtempSync(join(tmpdir(), 'hyp-ros-')), pkg = join(dir, 'gainpeak_ros');
    unpack(files, 'gainpeak_ros.zip', dir);
    const inc = join(dir, 'stub'), types = ['Float64', 'Float64MultiArray', 'Float32', 'Bool', 'Int16', 'Int32'];
    mkdirSync(join(inc, 'rclcpp'), { recursive: true }); mkdirSync(join(inc, 'std_msgs/msg'), { recursive: true });
    writeFileSync(join(inc, 'rclcpp/rclcpp.hpp'), `#pragma once
#include <chrono>
#include <cstdio>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>
namespace rclcpp {
struct Logger {}; struct Clock {};
struct TimerBase { using SharedPtr = std::shared_ptr<TimerBase>; };
template <class M> struct Subscription { using SharedPtr = std::shared_ptr<Subscription>; };
template <class M> struct Publisher { using SharedPtr = std::shared_ptr<Publisher>; std::vector<M> sent; void publish(const M & m) { sent.push_back(m); } };
struct Registry { std::map<std::string, std::function<void(const void *)>> subs; std::map<std::string, void *> pubs; std::function<void()> timer; double period = 0; int warnings = 0; };
inline Registry & reg() { static Registry r; return r; }
class Node {
public:
  explicit Node(const std::string &) {}
  template <class T> T declare_parameter(const std::string &, T v) { return v; }
  template <class M, class CB> typename Subscription<M>::SharedPtr create_subscription(const std::string & t, int, CB cb) { reg().subs[t] = [cb](const void * p) { cb(std::make_shared<M>(*static_cast<const M *>(p))); }; return std::make_shared<Subscription<M>>(); }
  template <class M> typename Publisher<M>::SharedPtr create_publisher(const std::string & t, int) { auto p = std::make_shared<Publisher<M>>(); reg().pubs[t] = p.get(); keep_.push_back(p); return p; }
  template <class R, class P, class CB> TimerBase::SharedPtr create_wall_timer(std::chrono::duration<R, P> d, CB cb) { reg().timer = cb; reg().period = std::chrono::duration<double>(d).count(); return std::make_shared<TimerBase>(); }
  Logger get_logger() { return {}; }
  std::shared_ptr<Clock> get_clock() { return std::make_shared<Clock>(); }
private:
  std::vector<std::shared_ptr<void>> keep_;
};
inline void init(int, char **) {}
template <class N> void spin(N) {}
inline void shutdown() {}
}
#define RCLCPP_WARN_THROTTLE(logger, clock, ms, ...) ((void)(logger), (void)(clock), rclcpp::reg().warnings++)
`);
    const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    writeFileSync(join(inc, 'std_msgs/msg/layout.hpp'), '#pragma once\n#include <cstdint>\n#include <memory>\n#include <string>\n#include <vector>\nnamespace std_msgs { namespace msg {\nstruct MultiArrayDimension { std::string label; uint32_t size = 0, stride = 0; };\nstruct MultiArrayLayout { std::vector<MultiArrayDimension> dim; uint32_t data_offset = 0; };\n} }\n');
    for (const t of types) {
      const multi = t.endsWith('MultiArray'), el = ({ Float64: 'double', Float32: 'float', Bool: 'bool', Int16: 'int16_t', Int32: 'int32_t' } as Record<string, string>)[t.replace('MultiArray', '')];
      writeFileSync(join(inc, `std_msgs/msg/${snake(t)}.hpp`), `#pragma once\n#include "layout.hpp"\nnamespace std_msgs { namespace msg {\nstruct ${t} { ${multi ? `MultiArrayLayout layout; std::vector<${el}> data;` : `${el} data{};`} using SharedPtr = std::shared_ptr<${t}>; };\n} }\n`);
    }
    writeFileSync(join(pkg, 'harness.cpp'), `#define main generated_main
#include "src/gainpeak_node.cpp"
#undef main
#include <cstdio>
using std_msgs::msg::Float64; using std_msgs::msg::Float64MultiArray;
int main() {
  auto node = std::make_shared<GainpeakNode>();
  auto & r = rclcpp::reg();
  auto * py = static_cast<rclcpp::Publisher<Float64MultiArray> *>(r.pubs["~/y"]);
  auto * pp = static_cast<rclcpp::Publisher<Float64> *>(r.pubs["~/peak"]);
  r.timer();                                   // no inputs yet: nothing published
  Float64MultiArray bad; bad.data = {1, 2};    // the wrong size: refused with a warning
  r.subs["~/x"](&bad);
  Float64MultiArray x; x.data = {1, 4, 2, 5, 3, 6};
  r.subs["~/x"](&x);
  r.timer();                                   // k still missing
  Float64 k; k.data = 3; r.subs["~/k"](&k);
  r.timer(); r.timer();
  std::printf("%g %zu %zu %d ", r.period, py->sent.size(), pp->sent.size(), r.warnings);
  for (double v : py->sent.back().data) std::printf("%g ", v);
  std::printf("%g %u %u\\n", pp->sent.back().data, py->sent.back().layout.dim[0].size, py->sent.back().layout.dim[1].size);
  return 0;
}
`);
    execFileSync('cc', ['-std=c99', '-Wall', '-Werror', '-c', '-o', 'gainpeak.o', 'src/gainpeak.c'], { cwd: pkg });
    execFileSync('c++', ['-std=c++17', '-Wall', '-Werror', '-I', inc, '-I', 'src', '-o', 'run', 'harness.cpp', 'gainpeak.o', '-lm'], { cwd: pkg });
    const out = execFileSync(join(pkg, 'run')).toString().trim().split(' ').map(Number);
    expect(out.slice(0, 4)).toEqual([0.04, 2, 2, 1]); // 25 a second; published twice (only once both inputs came); one warning
    expect(out.slice(4, 10)).toEqual([...toMat(l.vars.get('y')!).d]);
    expect(out.slice(10)).toEqual([toMat(l.vars.get('p')!).d[0], 3, 2]); // peak; 3 columns of 2 rows
  });
});
