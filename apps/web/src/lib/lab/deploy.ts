// Hyperion's deployment wrappers (M580, the owner, 27 Nov: the automated-driving page's "deploy… ROS 2… AUTOSAR"):
// the plain C that codegen writes (codegen.ts), wrapped so it runs inside a car's software:
// - a ROS 2 package (rclcpp, C++17): a node that subscribes to one topic per input, runs the function at a fixed rate
//   once every input has arrived, and publishes one topic per output (std_msgs numbers, or MultiArrays whose layout
//   says the data is stored column by column);
// - an AUTOSAR Classic software component: a periodic runnable that reads its inputs through the RTE, calls the
//   function and writes its outputs, the component's description (ARXML, release 4: data types, sender-receiver
//   interfaces, ports, a timing event, the runnable's reads and writes, the implementation) and a stand-in RTE so it
//   builds and can be tested on a computer before the real RTE is generated.
// Our own templates from the ROS 2 and AUTOSAR documentation; no vendor tool's output is copied.

import type { CIo, Port } from './codegen';

export interface DeployOpts { rate?: number; name?: string }
const isWide = (p: Port) => p.ctype === 'fx128_t';
const n = (p: Port) => p.ty.r * p.ty.c;
const scalar = (p: Port) => n(p) === 1;
const ROS_NUM: Record<string, string> = { double: 'Float64', float: 'Float32', bool: 'Bool', int8_t: 'Int8', uint8_t: 'UInt8', int16_t: 'Int16', uint16_t: 'UInt16', int32_t: 'Int32', uint32_t: 'UInt32', int64_t: 'Int64', uint64_t: 'UInt64' };
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const fixedNote = (p: Port) => (p.ty.cls === 'fixed' ? ` (fixed point: the stored whole number; value = stored × 2^-${p.ty.fx!.fl})` : '');
function check(io: CIo) {
  const wide = [...io.ins, ...io.outs].find(isWide);
  if (wide) throw new Error(`${wide.name} is a fixed-point number wider than 64 bits; deployment takes up to 64.`);
}
/** A ROS 2 message type for a port: its package path, C++ type and header. */
function rosType(p: Port) {
  const base = ROS_NUM[p.ctype], arr = !scalar(p), name = arr ? (p.ctype === 'bool' ? 'UInt8MultiArray' : `${base}MultiArray`) : base;
  return { name, cpp: `std_msgs::msg::${name}`, hdr: `std_msgs/msg/${snake(name)}.hpp` };
}

/** The ROS 2 package's files, by path inside the package folder's parent. */
export function ros2Package(entry: string, c: string, h: string, io: CIo, o: DeployOpts = {}): Record<string, string> {
  check(io);
  const rate = o.rate ?? 50, pkg = (o.name ?? `${entry}_ros`).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '') || 'hyperion_node';
  const cls = `${entry.replace(/(^|_)(\w)/g, (_, _u, ch: string) => ch.toUpperCase())}Node`, node = `${snake(entry)}_node`;
  const all = [...io.ins, ...io.outs], hdrs = [...new Set(all.map((p) => rosType(p).hdr))].sort();
  const allBits = io.ins.length ? `0x${((2 ** io.ins.length) - 1).toString(16)}u` : '0u';
  const subs = io.ins.map((p, i) => {
    const t = rosType(p), cb = scalar(p)
      ? `in_${p.name}_ = msg->data; got_ |= 1u << ${i};`
      : `if (msg->data.size() != ${n(p)}u) { RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 5000, "${p.name}: expected ${n(p)} values (${p.ty.r}x${p.ty.c}, column by column), got %zu", msg->data.size()); return; }\n        for (size_t i = 0; i < ${n(p)}u; ++i) in_${p.name}_[i] = static_cast<${p.ctype}>(msg->data[i]);\n        got_ |= 1u << ${i};`;
    return `    sub_${p.name}_ = create_subscription<${t.cpp}>(\n      "~/${p.name}", 10, [this](${t.cpp}::SharedPtr msg) {\n        ${cb}\n      });`;
  });
  const pubs = io.outs.map((p) => `    pub_${p.name}_ = create_publisher<${rosType(p).cpp}>("~/${p.name}", 10);`);
  const locals = io.outs.map((p) => (scalar(p) ? `    ${p.ctype} out_${p.name}{};` : `    ${p.ctype} out_${p.name}[${n(p)}] = {};`));
  const args = [...io.ins.map((p) => `in_${p.name}_`), ...(io.oneScalar ? [] : io.outs.map((p) => (scalar(p) ? `&out_${p.name}` : `out_${p.name}`)))];
  const call = io.oneScalar ? `    out_${io.outs[0].name} = ${io.cname}(${args.join(', ')});` : `    ${io.cname}(${args.join(', ')});`;
  const publish = io.outs.map((p) => {
    const t = rosType(p);
    if (scalar(p)) return `    { ${t.cpp} msg; msg.data = out_${p.name}; pub_${p.name}_->publish(msg); }`;
    return `    {\n      ${t.cpp} msg;\n      msg.layout.dim.resize(2);\n      msg.layout.dim[0].label = "columns"; msg.layout.dim[0].size = ${p.ty.c}; msg.layout.dim[0].stride = ${n(p)};\n      msg.layout.dim[1].label = "rows"; msg.layout.dim[1].size = ${p.ty.r}; msg.layout.dim[1].stride = ${p.ty.r};\n      msg.data.assign(out_${p.name}, out_${p.name} + ${n(p)});\n      pub_${p.name}_->publish(msg);\n    }`;
  });
  const members = [
    ...io.ins.map((p) => (scalar(p) ? `  ${p.ctype} in_${p.name}_{};` : `  ${p.ctype} in_${p.name}_[${n(p)}] = {};`)),
    '  unsigned got_ = 0;',
    ...io.ins.map((p) => `  rclcpp::Subscription<${rosType(p).cpp}>::SharedPtr sub_${p.name}_;`),
    ...io.outs.map((p) => `  rclcpp::Publisher<${rosType(p).cpp}>::SharedPtr pub_${p.name}_;`),
    '  rclcpp::TimerBase::SharedPtr timer_;',
  ];
  const topics = [...io.ins.map((p) => `- in  \`~/${p.name}\`: ${rosType(p).name}, ${scalar(p) ? 'one value' : `${n(p)} values (${p.ty.r}×${p.ty.c}, column by column)`}${fixedNote(p)}`), ...io.outs.map((p) => `- out \`~/${p.name}\`: ${rosType(p).name}, ${scalar(p) ? 'one value' : `${n(p)} values (${p.ty.r}×${p.ty.c}, column by column)`}${fixedNote(p)}`)];
  const cpp = `// ${node}.cpp: generated by Hyperion. A ROS 2 node around ${entry}.c: it subscribes to one topic per input, runs
// ${entry} ${rate} times a second (the rate_hz parameter) once every input has arrived, and publishes one topic per output.
// Topics are private (~/name), so they sit under the node's name; remap them with --ros-args -r.
#include <chrono>
#include <cstddef>
#include <memory>
#include <rclcpp/rclcpp.hpp>
${hdrs.map((x) => `#include <${x}>`).join('\n')}
#include "${entry}.h"

class ${cls} : public rclcpp::Node {
public:
  ${cls}() : Node("${snake(entry)}") {
    const double rate = declare_parameter<double>("rate_hz", ${rate.toFixed(1)});
${subs.join('\n')}
${pubs.join('\n')}
    timer_ = create_wall_timer(std::chrono::duration<double>(1.0 / rate), [this] { step(); });
  }

private:
  void step() {
    if (got_ != ${allBits}) return; // wait until every input has arrived once
${locals.join('\n')}
${call}
${publish.join('\n')}
  }

${members.join('\n')}
};

int main(int argc, char ** argv) {
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<${cls}>());
  rclcpp::shutdown();
  return 0;
}
`;
  const cmake = `cmake_minimum_required(VERSION 3.8)
project(${pkg} C CXX)
if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
endif()
if(NOT CMAKE_C_STANDARD)
  set(CMAKE_C_STANDARD 99)
endif()

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)

add_executable(${node} src/${node}.cpp src/${entry}.c)
target_include_directories(${node} PRIVATE src)
target_link_libraries(${node} rclcpp::rclcpp \${std_msgs_TARGETS} m)

install(TARGETS ${node} DESTINATION lib/\${PROJECT_NAME})
install(DIRECTORY launch DESTINATION share/\${PROJECT_NAME})

ament_package()
`;
  const xml = `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${pkg}</name>
  <version>0.1.0</version>
  <description>${entry}, generated by Hyperion, as a ROS 2 node.</description>
  <maintainer email="you@example.com">Your name</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cmake</buildtool_depend>
  <depend>rclcpp</depend>
  <depend>std_msgs</depend>

  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>
`;
  const launch = `# ${snake(entry)}.launch.py: generated by Hyperion. ros2 launch ${pkg} ${snake(entry)}.launch.py
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(package='${pkg}', executable='${node}', name='${snake(entry)}', parameters=[{'rate_hz': ${rate.toFixed(1)}}]),
    ])
`;
  const readme = `# ${pkg}

${entry}, generated by Hyperion, as a ROS 2 node (rclcpp, C++17; ROS 2 Humble or newer).

    cd ~/ros2_ws/src && unzip ${pkg}.zip
    cd ~/ros2_ws && colcon build --packages-select ${pkg} && source install/setup.bash
    ros2 run ${pkg} ${node} --ros-args -p rate_hz:=${rate}
    ros2 launch ${pkg} ${snake(entry)}.launch.py

It runs ${entry} ${rate} times a second once every input has arrived (the last value of each is used), and publishes
every output each time. Topics (under the node's name, /${snake(entry)}/…):

${topics.join('\n')}

Edit the maintainer and licence in package.xml before sharing it.
`;
  return { [`${pkg}/package.xml`]: xml, [`${pkg}/CMakeLists.txt`]: cmake, [`${pkg}/src/${node}.cpp`]: cpp, [`${pkg}/src/${entry}.c`]: c, [`${pkg}/src/${entry}.h`]: h, [`${pkg}/launch/${snake(entry)}.launch.py`]: launch, [`${pkg}/README.md`]: readme };
}

// ——— AUTOSAR Classic ———
const AR_TYPE: Record<string, string> = { double: 'float64', float: 'float32', bool: 'boolean', int8_t: 'sint8', uint8_t: 'uint8', int16_t: 'sint16', uint16_t: 'uint16', int32_t: 'sint32', uint32_t: 'uint32', int64_t: 'sint64', uint64_t: 'uint64' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The AUTOSAR software component's files, by path inside the component's folder's parent. */
export function autosarSwc(entry: string, c: string, h: string, io: CIo, o: DeployOpts = {}): Record<string, string> {
  check(io);
  const rate = o.rate ?? 100, period = 1 / rate, swc = (o.name ?? `${entry.replace(/(^|_)(\w)/g, (_, _u, ch: string) => ch.toUpperCase())}Swc`).replace(/\W/g, '_');
  const P = (p: Port, dir: 'In' | 'Out') => `${dir}_${p.name}`, typeName = (p: Port) => (scalar(p) ? AR_TYPE[p.ctype] : `${swc}_${p.name}_T`);
  const ports: [Port, 'In' | 'Out'][] = [...io.ins.map((p) => [p, 'In'] as [Port, 'In']), ...io.outs.map((p) => [p, 'Out'] as [Port, 'Out'])];
  const ptr = (p: Port) => `${AR_TYPE[p.ctype]}*`;
  const runnable = `/* ${swc}.c: generated by Hyperion. The AUTOSAR software component around ${entry}.c: the runnable
 * ${swc}_Step runs every ${(period * 1000).toFixed(3).replace(/\.?0+$/, '')} ms (its timing event in ${swc}.arxml), reads every input
 * through the RTE, calls ${entry} and writes every output. Arrays travel column by column. */
#include "Rte_${swc}.h"
#include "${entry}.h"

void ${swc}_Init(void)
{
}

void ${swc}_Step(void)
{
${io.ins.map((p) => (scalar(p) ? `  ${p.ctype} in_${p.name} = 0;` : `  ${p.ctype} in_${p.name}[${n(p)}] = {0};`)).join('\n')}
${io.outs.map((p) => (scalar(p) ? `  ${p.ctype} out_${p.name} = 0;` : `  ${p.ctype} out_${p.name}[${n(p)}] = {0};`)).join('\n')}
${io.ins.map((p) => `  (void)Rte_Read_${P(p, 'In')}_Value((${ptr(p)})${scalar(p) ? '&' : ''}in_${p.name});`).join('\n')}
${io.oneScalar ? `  out_${io.outs[0].name} = ${io.cname}(${io.ins.map((p) => `in_${p.name}`).join(', ')});` : `  ${io.cname}(${[...io.ins.map((p) => `in_${p.name}`), ...io.outs.map((p) => (scalar(p) ? `&out_${p.name}` : `out_${p.name}`))].join(', ')});`}
${io.outs.map((p) => `  (void)Rte_Write_${P(p, 'Out')}_Value(${scalar(p) ? `(${AR_TYPE[p.ctype]})out_${p.name}` : `(const ${ptr(p)})out_${p.name}`});`).join('\n')}
}
`;
  // a stand-in RTE: each port's value in a variable, so the component builds and runs on a computer
  const rte = `/* Rte_${swc}.h: a stand-in RTE written by Hyperion, so ${swc}.c builds and can be tested on a computer.
 * Replace it with the Rte_${swc}.h your AUTOSAR tool generates from ${swc}.arxml: the calls are the same.
 * Rte_Test_<port> is each port's value here: a test writes the inputs, calls ${swc}_Step and reads the outputs. */
#ifndef RTE_${swc.toUpperCase()}_H
#define RTE_${swc.toUpperCase()}_H
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#ifndef PLATFORM_TYPES_H
typedef bool boolean; typedef int8_t sint8; typedef uint8_t uint8; typedef int16_t sint16; typedef uint16_t uint16;
typedef int32_t sint32; typedef uint32_t uint32; typedef int64_t sint64; typedef uint64_t uint64; typedef float float32; typedef double float64;
#endif
#ifndef STD_TYPES_H
typedef uint8 Std_ReturnType;
#define E_OK ((Std_ReturnType)0u)
#endif
${ports.map(([p, d]) => `extern ${AR_TYPE[p.ctype]} Rte_Test_${P(p, d)}${scalar(p) ? '' : `[${n(p)}]`};`).join('\n')}
${io.ins.map((p) => `Std_ReturnType Rte_Read_${P(p, 'In')}_Value(${ptr(p)} data);`).join('\n')}
${io.outs.map((p) => `Std_ReturnType Rte_Write_${P(p, 'Out')}_Value(${scalar(p) ? AR_TYPE[p.ctype] : `const ${ptr(p)}`} data);`).join('\n')}
void ${swc}_Init(void);
void ${swc}_Step(void);
#endif
`;
  const rteC = `/* Rte_${swc}.c: the stand-in RTE's values and calls (see Rte_${swc}.h); not needed with your tool's RTE. */
#include "Rte_${swc}.h"
${ports.map(([p, d]) => `${AR_TYPE[p.ctype]} Rte_Test_${P(p, d)}${scalar(p) ? '' : `[${n(p)}]`};`).join('\n')}
${io.ins.map((p) => `Std_ReturnType Rte_Read_${P(p, 'In')}_Value(${ptr(p)} data) { memcpy(data, ${scalar(p) ? '&' : ''}Rte_Test_${P(p, 'In')}, sizeof(Rte_Test_${P(p, 'In')})); return E_OK; }`).join('\n')}
${io.outs.map((p) => (scalar(p) ? `Std_ReturnType Rte_Write_${P(p, 'Out')}_Value(${AR_TYPE[p.ctype]} data) { Rte_Test_${P(p, 'Out')} = data; return E_OK; }` : `Std_ReturnType Rte_Write_${P(p, 'Out')}_Value(const ${ptr(p)} data) { memcpy(Rte_Test_${P(p, 'Out')}, data, sizeof(Rte_Test_${P(p, 'Out')})); return E_OK; }`)).join('\n')}
`;
  const pkgRef = '/Hyperion';
  const arrays = ports.filter(([p]) => !scalar(p)).map(([p]) => `        <IMPLEMENTATION-DATA-TYPE>
          <SHORT-NAME>${typeName(p)}</SHORT-NAME>
          <CATEGORY>ARRAY</CATEGORY>
          <SUB-ELEMENTS>
            <IMPLEMENTATION-DATA-TYPE-ELEMENT>
              <SHORT-NAME>Element</SHORT-NAME>
              <CATEGORY>TYPE_REFERENCE</CATEGORY>
              <ARRAY-SIZE>${n(p)}</ARRAY-SIZE>
              <ARRAY-SIZE-SEMANTICS>FIXED-SIZE</ARRAY-SIZE-SEMANTICS>
              <SW-DATA-DEF-PROPS>
                <SW-DATA-DEF-PROPS-VARIANTS>
                  <SW-DATA-DEF-PROPS-CONDITIONAL>
                    <IMPLEMENTATION-DATA-TYPE-REF DEST="IMPLEMENTATION-DATA-TYPE">/AUTOSAR_Platform/ImplementationDataTypes/${AR_TYPE[p.ctype]}</IMPLEMENTATION-DATA-TYPE-REF>
                  </SW-DATA-DEF-PROPS-CONDITIONAL>
                </SW-DATA-DEF-PROPS-VARIANTS>
              </SW-DATA-DEF-PROPS>
            </IMPLEMENTATION-DATA-TYPE-ELEMENT>
          </SUB-ELEMENTS>
        </IMPLEMENTATION-DATA-TYPE>`);
  const typeRef = (p: Port) => (scalar(p) ? `/AUTOSAR_Platform/ImplementationDataTypes/${AR_TYPE[p.ctype]}` : `${pkgRef}/DataTypes/${typeName(p)}`);
  const ifs = ports.map(([p, d]) => `        <SENDER-RECEIVER-INTERFACE>
          <SHORT-NAME>If_${swc}_${P(p, d)}</SHORT-NAME>
          <DESC><L-2 L="EN">${esc(`${d === 'In' ? 'Input' : 'Output'} ${p.name} of ${entry}: ${p.ty.r}x${p.ty.c} ${p.ctype}${fixedNote(p)}`)}</L-2></DESC>
          <IS-SERVICE>false</IS-SERVICE>
          <DATA-ELEMENTS>
            <VARIABLE-DATA-PROTOTYPE>
              <SHORT-NAME>Value</SHORT-NAME>
              <TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">${typeRef(p)}</TYPE-TREF>
            </VARIABLE-DATA-PROTOTYPE>
          </DATA-ELEMENTS>
        </SENDER-RECEIVER-INTERFACE>`);
  const comp = `${pkgRef}/Components/${swc}`;
  const portXml = ports.map(([p, d]) => d === 'In'
    ? `            <R-PORT-PROTOTYPE>\n              <SHORT-NAME>${P(p, d)}</SHORT-NAME>\n              <REQUIRED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">${pkgRef}/Interfaces/If_${swc}_${P(p, d)}</REQUIRED-INTERFACE-TREF>\n            </R-PORT-PROTOTYPE>`
    : `            <P-PORT-PROTOTYPE>\n              <SHORT-NAME>${P(p, d)}</SHORT-NAME>\n              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">${pkgRef}/Interfaces/If_${swc}_${P(p, d)}</PROVIDED-INTERFACE-TREF>\n            </P-PORT-PROTOTYPE>`);
  const access = (p: Port, d: 'In' | 'Out') => `                    <VARIABLE-ACCESS>
                      <SHORT-NAME>${d === 'In' ? 'read' : 'write'}_${p.name}</SHORT-NAME>
                      <ACCESSED-VARIABLE>
                        <AUTOSAR-VARIABLE-IREF>
                          <PORT-PROTOTYPE-REF DEST="${d === 'In' ? 'R' : 'P'}-PORT-PROTOTYPE">${comp}/${P(p, d)}</PORT-PROTOTYPE-REF>
                          <TARGET-DATA-PROTOTYPE-REF DEST="VARIABLE-DATA-PROTOTYPE">${pkgRef}/Interfaces/If_${swc}_${P(p, d)}/Value</TARGET-DATA-PROTOTYPE-REF>
                        </AUTOSAR-VARIABLE-IREF>
                      </ACCESSED-VARIABLE>
                    </VARIABLE-ACCESS>`;
  const arxml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${swc}.arxml: generated by Hyperion from ${entry}.m. An AUTOSAR Classic (release 4) application software component:
     its data types, sender-receiver interfaces, ports, a timing event every ${period} s, the runnable ${swc}_Step with
     its reads and writes, and its implementation. Platform types come from /AUTOSAR_Platform, as every tool provides. -->
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Hyperion</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>DataTypes</SHORT-NAME>
          <ELEMENTS>
${arrays.join('\n')}
          </ELEMENTS>
        </AR-PACKAGE>
        <AR-PACKAGE>
          <SHORT-NAME>Interfaces</SHORT-NAME>
          <ELEMENTS>
${ifs.join('\n')}
          </ELEMENTS>
        </AR-PACKAGE>
        <AR-PACKAGE>
          <SHORT-NAME>Components</SHORT-NAME>
          <ELEMENTS>
            <APPLICATION-SW-COMPONENT-TYPE>
              <SHORT-NAME>${swc}</SHORT-NAME>
              <PORTS>
${portXml.join('\n')}
              </PORTS>
              <INTERNAL-BEHAVIORS>
                <SWC-INTERNAL-BEHAVIOR>
                  <SHORT-NAME>${swc}_Behavior</SHORT-NAME>
                  <EVENTS>
                    <TIMING-EVENT>
                      <SHORT-NAME>${swc}_Every</SHORT-NAME>
                      <START-ON-EVENT-REF DEST="RUNNABLE-ENTITY">${comp}/${swc}_Behavior/${swc}_Step</START-ON-EVENT-REF>
                      <PERIOD>${period}</PERIOD>
                    </TIMING-EVENT>
                  </EVENTS>
                  <RUNNABLES>
                    <RUNNABLE-ENTITY>
                      <SHORT-NAME>${swc}_Init</SHORT-NAME>
                      <MINIMUM-START-INTERVAL>0</MINIMUM-START-INTERVAL>
                      <CAN-BE-INVOKED-CONCURRENTLY>false</CAN-BE-INVOKED-CONCURRENTLY>
                      <SYMBOL>${swc}_Init</SYMBOL>
                    </RUNNABLE-ENTITY>
                    <RUNNABLE-ENTITY>
                      <SHORT-NAME>${swc}_Step</SHORT-NAME>
                      <MINIMUM-START-INTERVAL>0</MINIMUM-START-INTERVAL>
                      <CAN-BE-INVOKED-CONCURRENTLY>false</CAN-BE-INVOKED-CONCURRENTLY>${io.ins.length ? `
                      <DATA-READ-ACCESSS>
${io.ins.map((p) => access(p, 'In')).join('\n')}
                      </DATA-READ-ACCESSS>` : ''}${io.outs.length ? `
                      <DATA-WRITE-ACCESSS>
${io.outs.map((p) => access(p, 'Out')).join('\n')}
                      </DATA-WRITE-ACCESSS>` : ''}
                      <SYMBOL>${swc}_Step</SYMBOL>
                    </RUNNABLE-ENTITY>
                  </RUNNABLES>
                </SWC-INTERNAL-BEHAVIOR>
              </INTERNAL-BEHAVIORS>
            </APPLICATION-SW-COMPONENT-TYPE>
            <SWC-IMPLEMENTATION>
              <SHORT-NAME>${swc}_Implementation</SHORT-NAME>
              <CODE-DESCRIPTORS>
                <CODE>
                  <SHORT-NAME>Code</SHORT-NAME>
                  <ARTIFACT-DESCRIPTORS>
${[`${swc}.c`, `${entry}.c`, `${entry}.h`].map((f) => `                    <AUTOSAR-ENGINEERING-OBJECT>\n                      <SHORT-LABEL>${f}</SHORT-LABEL>\n                      <CATEGORY>${f.endsWith('.h') ? 'SWHDR' : 'SWSRC'}</CATEGORY>\n                    </AUTOSAR-ENGINEERING-OBJECT>`).join('\n')}
                  </ARTIFACT-DESCRIPTORS>
                </CODE>
              </CODE-DESCRIPTORS>
              <PROGRAMMING-LANGUAGE>C</PROGRAMMING-LANGUAGE>
              <BEHAVIOR-REF DEST="SWC-INTERNAL-BEHAVIOR">${comp}/${swc}_Behavior</BEHAVIOR-REF>
            </SWC-IMPLEMENTATION>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;
  const readme = `# ${swc}

${entry}, generated by Hyperion, as an AUTOSAR Classic software component.

- ${swc}.arxml: the component's description (release 4.x). Import it into your AUTOSAR tool, map its ports, and let
  the tool generate the RTE.
- ${swc}.c: the runnables (${swc}_Init, and ${swc}_Step every ${(period * 1000).toFixed(3).replace(/\.?0+$/, '')} ms).
- ${entry}.c / ${entry}.h: the function, plain C99.
- Rte_${swc}.h and Rte_${swc}.c: a stand-in RTE so you can build and test it on a computer now; your tool's
  generated RTE replaces them.

Ports (arrays column by column):

${ports.map(([p, d]) => `- ${d === 'In' ? 'reads ' : 'writes'} ${P(p, d)}.Value: ${scalar(p) ? AR_TYPE[p.ctype] : `${n(p)} × ${AR_TYPE[p.ctype]} (${p.ty.r}×${p.ty.c})`}${fixedNote(p)}`).join('\n')}

Try it on a computer: cc -std=c99 -I. test.c ${swc}.c Rte_${swc}.c ${entry}.c -lm, where test.c sets Rte_Test_In_… and calls
${swc}_Step().
`;
  return { [`${swc}/${swc}.arxml`]: arxml, [`${swc}/${swc}.c`]: runnable, [`${swc}/Rte_${swc}.h`]: rte, [`${swc}/Rte_${swc}.c`]: rteC, [`${swc}/${entry}.c`]: c, [`${swc}/${entry}.h`]: h, [`${swc}/README.md`]: readme };
}
