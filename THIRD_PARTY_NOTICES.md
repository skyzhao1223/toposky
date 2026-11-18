# Third-party dependency notices

Generated from the production entries of the npm lockfile, including transitive and optional
platform packages. Development-only entries are excluded. This is a locked dependency inventory,
not a claim that every listed package is present in every image or browser bundle.

Inventory coverage: **151/151 production lockfile entries** have a declared version and license.

Regenerate with `npm run notices:generate`; CI checks it with `npm run notices:check`.
`npm run notices:bundle` collects installed-package license/copyright notices and the standard
license texts into `build/legal/THIRD_PARTY_LICENSES.txt` for distribution.

## License texts

- [0BSD](licenses/0BSD.txt)
- [Apache-2.0](licenses/Apache-2.0.txt)
- [BSD-3-Clause](licenses/BSD-3-Clause.txt)
- [CC-BY-4.0](licenses/CC-BY-4.0.txt)
- [EPL-2.0](licenses/EPL-2.0.txt)
- [GPL-3.0-or-later](licenses/GPL-3.0-or-later.txt)
- [ISC](licenses/ISC.txt)
- [LGPL-3.0-or-later](licenses/LGPL-3.0-or-later.txt)
- [MIT](licenses/MIT.txt)
- [Python-2.0](licenses/Python-2.0.txt)

## Important distribution notes

- TopoSky does not relicense its dependencies. Their original terms and attribution remain applicable.
- `elkjs` is used unmodified under EPL-2.0. Its upstream source is https://github.com/kieler/elkjs.
- `sharp` uses platform-specific libvips binaries and associated libraries. LGPL components remain
  dynamically linked and unmodified; preserve the license notices and the ability to replace those
  libraries. Sharp/libvips source and build recipes are available at https://github.com/lovell/sharp,
  https://github.com/lovell/sharp-libvips and https://github.com/libvips/libvips. A distributor must
  review corresponding-source and other obligations for the exact binaries/platform being shipped.
- `argparse` uses Python-2.0; `caniuse-lite` data uses CC-BY-4.0. Preserve the notices in the bundle.
- The Node base image and its operating-system packages are outside this npm inventory; preserve
  their notices separately when distributing container images.
- This inventory and the license bundle are engineering checks, not legal clearance.

## Locked production packages

| Package | Version | Declared license | Optional/platform-specific |
|---|---|---|---|
| [@ant-design/colors](https://www.npmjs.com/package/@ant-design/colors/v/8.0.1) | 8.0.1 | MIT | no |
| [@ant-design/cssinjs](https://www.npmjs.com/package/@ant-design/cssinjs/v/2.1.2) | 2.1.2 | MIT | no |
| [@ant-design/cssinjs-utils](https://www.npmjs.com/package/@ant-design/cssinjs-utils/v/2.1.2) | 2.1.2 | MIT | no |
| [@ant-design/fast-color](https://www.npmjs.com/package/@ant-design/fast-color/v/3.0.1) | 3.0.1 | MIT | no |
| [@ant-design/icons](https://www.npmjs.com/package/@ant-design/icons/v/6.3.4) | 6.3.4 | MIT | no |
| [@ant-design/icons-svg](https://www.npmjs.com/package/@ant-design/icons-svg/v/4.6.0) | 4.6.0 | MIT | no |
| [@ant-design/nextjs-registry](https://www.npmjs.com/package/@ant-design/nextjs-registry/v/1.3.0) | 1.3.0 | MIT | no |
| [@ant-design/react-slick](https://www.npmjs.com/package/@ant-design/react-slick/v/2.0.0) | 2.0.0 | MIT | no |
| [@babel/runtime](https://www.npmjs.com/package/@babel/runtime/v/7.29.7) | 7.29.7 | MIT | no |
| [@babel/runtime](https://www.npmjs.com/package/@babel/runtime/v/8.0.0) | 8.0.0 | MIT | no |
| [@emnapi/runtime](https://www.npmjs.com/package/@emnapi/runtime/v/1.11.3) | 1.11.3 | MIT | yes |
| [@emotion/hash](https://www.npmjs.com/package/@emotion/hash/v/0.8.0) | 0.8.0 | MIT | no |
| [@emotion/unitless](https://www.npmjs.com/package/@emotion/unitless/v/0.7.5) | 0.7.5 | MIT | no |
| [@img/colour](https://www.npmjs.com/package/@img/colour/v/1.1.0) | 1.1.0 | MIT | yes |
| [@img/sharp-darwin-arm64](https://www.npmjs.com/package/@img/sharp-darwin-arm64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-darwin-x64](https://www.npmjs.com/package/@img/sharp-darwin-x64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-freebsd-wasm32](https://www.npmjs.com/package/@img/sharp-freebsd-wasm32/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-libvips-darwin-arm64](https://www.npmjs.com/package/@img/sharp-libvips-darwin-arm64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-darwin-x64](https://www.npmjs.com/package/@img/sharp-libvips-darwin-x64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-arm](https://www.npmjs.com/package/@img/sharp-libvips-linux-arm/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-arm64](https://www.npmjs.com/package/@img/sharp-libvips-linux-arm64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-ppc64](https://www.npmjs.com/package/@img/sharp-libvips-linux-ppc64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-riscv64](https://www.npmjs.com/package/@img/sharp-libvips-linux-riscv64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-s390x](https://www.npmjs.com/package/@img/sharp-libvips-linux-s390x/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linux-x64](https://www.npmjs.com/package/@img/sharp-libvips-linux-x64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linuxmusl-arm64](https://www.npmjs.com/package/@img/sharp-libvips-linuxmusl-arm64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-libvips-linuxmusl-x64](https://www.npmjs.com/package/@img/sharp-libvips-linuxmusl-x64/v/1.3.4) | 1.3.4 | LGPL-3.0-or-later | yes |
| [@img/sharp-linux-arm](https://www.npmjs.com/package/@img/sharp-linux-arm/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linux-arm64](https://www.npmjs.com/package/@img/sharp-linux-arm64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linux-ppc64](https://www.npmjs.com/package/@img/sharp-linux-ppc64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linux-riscv64](https://www.npmjs.com/package/@img/sharp-linux-riscv64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linux-s390x](https://www.npmjs.com/package/@img/sharp-linux-s390x/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linux-x64](https://www.npmjs.com/package/@img/sharp-linux-x64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linuxmusl-arm64](https://www.npmjs.com/package/@img/sharp-linuxmusl-arm64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-linuxmusl-x64](https://www.npmjs.com/package/@img/sharp-linuxmusl-x64/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-wasm32](https://www.npmjs.com/package/@img/sharp-wasm32/v/0.35.5) | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | yes |
| [@img/sharp-webcontainers-wasm32](https://www.npmjs.com/package/@img/sharp-webcontainers-wasm32/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [@img/sharp-win32-arm64](https://www.npmjs.com/package/@img/sharp-win32-arm64/v/0.35.5) | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| [@img/sharp-win32-ia32](https://www.npmjs.com/package/@img/sharp-win32-ia32/v/0.35.5) | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| [@img/sharp-win32-x64](https://www.npmjs.com/package/@img/sharp-win32-x64/v/0.35.5) | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | yes |
| [@next/env](https://www.npmjs.com/package/@next/env/v/16.4.6) | 16.4.6 | MIT | no |
| [@next/swc-darwin-arm64](https://www.npmjs.com/package/@next/swc-darwin-arm64/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-darwin-x64](https://www.npmjs.com/package/@next/swc-darwin-x64/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-linux-arm64-gnu](https://www.npmjs.com/package/@next/swc-linux-arm64-gnu/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-linux-arm64-musl](https://www.npmjs.com/package/@next/swc-linux-arm64-musl/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-linux-x64-gnu](https://www.npmjs.com/package/@next/swc-linux-x64-gnu/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-linux-x64-musl](https://www.npmjs.com/package/@next/swc-linux-x64-musl/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-win32-arm64-msvc](https://www.npmjs.com/package/@next/swc-win32-arm64-msvc/v/16.4.6) | 16.4.6 | MIT | yes |
| [@next/swc-win32-x64-msvc](https://www.npmjs.com/package/@next/swc-win32-x64-msvc/v/16.4.6) | 16.4.6 | MIT | yes |
| [@rc-component/async-validator](https://www.npmjs.com/package/@rc-component/async-validator/v/6.0.0) | 6.0.0 | MIT | no |
| [@rc-component/cascader](https://www.npmjs.com/package/@rc-component/cascader/v/1.22.0) | 1.22.0 | MIT | no |
| [@rc-component/checkbox](https://www.npmjs.com/package/@rc-component/checkbox/v/2.0.0) | 2.0.0 | MIT | no |
| [@rc-component/collapse](https://www.npmjs.com/package/@rc-component/collapse/v/1.2.0) | 1.2.0 | MIT | no |
| [@rc-component/color-picker](https://www.npmjs.com/package/@rc-component/color-picker/v/3.1.1) | 3.1.1 | MIT | no |
| [@rc-component/context](https://www.npmjs.com/package/@rc-component/context/v/2.0.2) | 2.0.2 | MIT | no |
| [@rc-component/dialog](https://www.npmjs.com/package/@rc-component/dialog/v/1.10.0) | 1.10.0 | MIT | no |
| [@rc-component/drawer](https://www.npmjs.com/package/@rc-component/drawer/v/1.4.2) | 1.4.2 | MIT | no |
| [@rc-component/dropdown](https://www.npmjs.com/package/@rc-component/dropdown/v/1.0.3) | 1.0.3 | MIT | no |
| [@rc-component/form](https://www.npmjs.com/package/@rc-component/form/v/1.8.6) | 1.8.6 | MIT | no |
| [@rc-component/image](https://www.npmjs.com/package/@rc-component/image/v/1.10.0) | 1.10.0 | MIT | no |
| [@rc-component/input](https://www.npmjs.com/package/@rc-component/input/v/1.3.1) | 1.3.1 | MIT | no |
| [@rc-component/input-number](https://www.npmjs.com/package/@rc-component/input-number/v/1.6.2) | 1.6.2 | MIT | no |
| [@rc-component/listy](https://www.npmjs.com/package/@rc-component/listy/v/1.2.3) | 1.2.3 | MIT | no |
| [@rc-component/mentions](https://www.npmjs.com/package/@rc-component/mentions/v/1.12.0) | 1.12.0 | MIT | no |
| [@rc-component/menu](https://www.npmjs.com/package/@rc-component/menu/v/1.5.0) | 1.5.0 | MIT | no |
| [@rc-component/mini-decimal](https://www.npmjs.com/package/@rc-component/mini-decimal/v/1.1.4) | 1.1.4 | MIT | no |
| [@rc-component/motion](https://www.npmjs.com/package/@rc-component/motion/v/1.3.3) | 1.3.3 | MIT | no |
| [@rc-component/mutate-observer](https://www.npmjs.com/package/@rc-component/mutate-observer/v/2.0.1) | 2.0.1 | MIT | no |
| [@rc-component/notification](https://www.npmjs.com/package/@rc-component/notification/v/2.0.8) | 2.0.8 | MIT | no |
| [@rc-component/overflow](https://www.npmjs.com/package/@rc-component/overflow/v/1.0.1) | 1.0.1 | MIT | no |
| [@rc-component/pagination](https://www.npmjs.com/package/@rc-component/pagination/v/1.4.0) | 1.4.0 | MIT | no |
| [@rc-component/picker](https://www.npmjs.com/package/@rc-component/picker/v/1.12.2) | 1.12.2 | MIT | no |
| [@rc-component/portal](https://www.npmjs.com/package/@rc-component/portal/v/2.2.1) | 2.2.1 | MIT | no |
| [@rc-component/progress](https://www.npmjs.com/package/@rc-component/progress/v/1.0.3) | 1.0.3 | MIT | no |
| [@rc-component/qrcode](https://www.npmjs.com/package/@rc-component/qrcode/v/2.0.0) | 2.0.0 | MIT | no |
| [@rc-component/rate](https://www.npmjs.com/package/@rc-component/rate/v/1.0.1) | 1.0.1 | MIT | no |
| [@rc-component/resize-observer](https://www.npmjs.com/package/@rc-component/resize-observer/v/1.1.2) | 1.1.2 | MIT | no |
| [@rc-component/segmented](https://www.npmjs.com/package/@rc-component/segmented/v/1.3.0) | 1.3.0 | MIT | no |
| [@rc-component/select](https://www.npmjs.com/package/@rc-component/select/v/1.10.1) | 1.10.1 | MIT | no |
| [@rc-component/slider](https://www.npmjs.com/package/@rc-component/slider/v/1.1.1) | 1.1.1 | MIT | no |
| [@rc-component/steps](https://www.npmjs.com/package/@rc-component/steps/v/1.2.3) | 1.2.3 | MIT | no |
| [@rc-component/switch](https://www.npmjs.com/package/@rc-component/switch/v/1.0.3) | 1.0.3 | MIT | no |
| [@rc-component/table](https://www.npmjs.com/package/@rc-component/table/v/1.11.1) | 1.11.1 | MIT | no |
| [@rc-component/tabs](https://www.npmjs.com/package/@rc-component/tabs/v/1.13.0) | 1.13.0 | MIT | no |
| [@rc-component/tooltip](https://www.npmjs.com/package/@rc-component/tooltip/v/1.5.2) | 1.5.2 | MIT | no |
| [@rc-component/tour](https://www.npmjs.com/package/@rc-component/tour/v/2.4.0) | 2.4.0 | MIT | no |
| [@rc-component/tree](https://www.npmjs.com/package/@rc-component/tree/v/1.4.0) | 1.4.0 | MIT | no |
| [@rc-component/tree-select](https://www.npmjs.com/package/@rc-component/tree-select/v/1.16.1) | 1.16.1 | MIT | no |
| [@rc-component/trigger](https://www.npmjs.com/package/@rc-component/trigger/v/3.10.1) | 3.10.1 | MIT | no |
| [@rc-component/upload](https://www.npmjs.com/package/@rc-component/upload/v/1.1.1) | 1.1.1 | MIT | no |
| [@rc-component/util](https://www.npmjs.com/package/@rc-component/util/v/1.13.0) | 1.13.0 | MIT | no |
| [@rc-component/virtual-list](https://www.npmjs.com/package/@rc-component/virtual-list/v/1.5.1) | 1.5.1 | MIT | no |
| [@swc/helpers](https://www.npmjs.com/package/@swc/helpers/v/0.5.23) | 0.5.23 | Apache-2.0 | no |
| [@types/d3-color](https://www.npmjs.com/package/@types/d3-color/v/3.1.3) | 3.1.3 | MIT | no |
| [@types/d3-drag](https://www.npmjs.com/package/@types/d3-drag/v/3.0.7) | 3.0.7 | MIT | no |
| [@types/d3-interpolate](https://www.npmjs.com/package/@types/d3-interpolate/v/3.0.4) | 3.0.4 | MIT | no |
| [@types/d3-selection](https://www.npmjs.com/package/@types/d3-selection/v/3.0.11) | 3.0.11 | MIT | no |
| [@types/d3-transition](https://www.npmjs.com/package/@types/d3-transition/v/3.0.9) | 3.0.9 | MIT | no |
| [@types/d3-zoom](https://www.npmjs.com/package/@types/d3-zoom/v/3.0.8) | 3.0.8 | MIT | no |
| [@types/dagre](https://www.npmjs.com/package/@types/dagre/v/0.7.54) | 0.7.54 | MIT | no |
| [@types/react](https://www.npmjs.com/package/@types/react/v/19.2.18) | 19.2.18 | MIT | no |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom/v/19.2.7) | 19.2.7 | MIT | no |
| [@xyflow/react](https://www.npmjs.com/package/@xyflow/react/v/12.11.6) | 12.11.6 | MIT | no |
| [@xyflow/system](https://www.npmjs.com/package/@xyflow/system/v/0.0.82) | 0.0.82 | MIT | no |
| [antd](https://www.npmjs.com/package/antd/v/6.6.3) | 6.6.3 | MIT | no |
| [argparse](https://www.npmjs.com/package/argparse/v/2.0.1) | 2.0.1 | Python-2.0 | no |
| [baseline-browser-mapping](https://www.npmjs.com/package/baseline-browser-mapping/v/2.11.21) | 2.11.21 | Apache-2.0 | no |
| [caniuse-lite](https://www.npmjs.com/package/caniuse-lite/v/1.0.30001810) | 1.0.30001810 | CC-BY-4.0 | no |
| [classcat](https://www.npmjs.com/package/classcat/v/5.0.5) | 5.0.5 | MIT | no |
| [client-only](https://www.npmjs.com/package/client-only/v/0.0.1) | 0.0.1 | MIT | no |
| [clsx](https://www.npmjs.com/package/clsx/v/2.1.1) | 2.1.1 | MIT | no |
| [compute-scroll-into-view](https://www.npmjs.com/package/compute-scroll-into-view/v/3.1.1) | 3.1.1 | MIT | no |
| [csstype](https://www.npmjs.com/package/csstype/v/3.2.3) | 3.2.3 | MIT | no |
| [d3-color](https://www.npmjs.com/package/d3-color/v/3.1.0) | 3.1.0 | ISC | no |
| [d3-dispatch](https://www.npmjs.com/package/d3-dispatch/v/3.0.1) | 3.0.1 | ISC | no |
| [d3-drag](https://www.npmjs.com/package/d3-drag/v/3.0.0) | 3.0.0 | ISC | no |
| [d3-ease](https://www.npmjs.com/package/d3-ease/v/3.0.1) | 3.0.1 | BSD-3-Clause | no |
| [d3-interpolate](https://www.npmjs.com/package/d3-interpolate/v/3.0.1) | 3.0.1 | ISC | no |
| [d3-selection](https://www.npmjs.com/package/d3-selection/v/3.0.0) | 3.0.0 | ISC | no |
| [d3-timer](https://www.npmjs.com/package/d3-timer/v/3.0.1) | 3.0.1 | ISC | no |
| [d3-transition](https://www.npmjs.com/package/d3-transition/v/3.0.1) | 3.0.1 | ISC | no |
| [d3-zoom](https://www.npmjs.com/package/d3-zoom/v/3.0.0) | 3.0.0 | ISC | no |
| [dagre](https://www.npmjs.com/package/dagre/v/0.8.5) | 0.8.5 | MIT | no |
| [dayjs](https://www.npmjs.com/package/dayjs/v/1.11.23) | 1.11.23 | MIT | no |
| [detect-libc](https://www.npmjs.com/package/detect-libc/v/2.1.2) | 2.1.2 | Apache-2.0 | no |
| [elkjs](https://www.npmjs.com/package/elkjs/v/0.12.0) | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later | no |
| [graphlib](https://www.npmjs.com/package/graphlib/v/2.1.8) | 2.1.8 | MIT | no |
| [is-mobile](https://www.npmjs.com/package/is-mobile/v/5.0.0) | 5.0.0 | MIT | no |
| [js-yaml](https://www.npmjs.com/package/js-yaml/v/4.3.2) | 4.3.2 | MIT | no |
| [json2mq](https://www.npmjs.com/package/json2mq/v/0.2.0) | 0.2.0 | MIT | no |
| [lodash](https://www.npmjs.com/package/lodash/v/4.18.1) | 4.18.1 | MIT | no |
| [nanoid](https://www.npmjs.com/package/nanoid/v/3.3.18) | 3.3.18 | MIT | no |
| [next](https://www.npmjs.com/package/next/v/16.4.6) | 16.4.6 | MIT | no |
| [picocolors](https://www.npmjs.com/package/picocolors/v/1.1.1) | 1.1.1 | ISC | no |
| [postcss](https://www.npmjs.com/package/postcss/v/8.5.23) | 8.5.23 | MIT | no |
| [react](https://www.npmjs.com/package/react/v/19.2.8) | 19.2.8 | MIT | no |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.2.8) | 19.2.8 | MIT | no |
| [react-is](https://www.npmjs.com/package/react-is/v/19.2.8) | 19.2.8 | MIT | no |
| [scheduler](https://www.npmjs.com/package/scheduler/v/0.27.0) | 0.27.0 | MIT | no |
| [scroll-into-view-if-needed](https://www.npmjs.com/package/scroll-into-view-if-needed/v/3.1.0) | 3.1.0 | MIT | no |
| [semver](https://www.npmjs.com/package/semver/v/7.8.5) | 7.8.5 | ISC | no |
| [sharp](https://www.npmjs.com/package/sharp/v/0.35.5) | 0.35.5 | Apache-2.0 | yes |
| [source-map-js](https://www.npmjs.com/package/source-map-js/v/1.2.2) | 1.2.2 | BSD-3-Clause | no |
| [string-convert](https://www.npmjs.com/package/string-convert/v/0.2.1) | 0.2.1 | MIT | no |
| [styled-jsx](https://www.npmjs.com/package/styled-jsx/v/5.1.6) | 5.1.6 | MIT | no |
| [stylis](https://www.npmjs.com/package/stylis/v/4.4.0) | 4.4.0 | MIT | no |
| [throttle-debounce](https://www.npmjs.com/package/throttle-debounce/v/5.0.2) | 5.0.2 | MIT | no |
| [tslib](https://www.npmjs.com/package/tslib/v/2.8.1) | 2.8.1 | 0BSD | no |
| [use-sync-external-store](https://www.npmjs.com/package/use-sync-external-store/v/1.6.0) | 1.6.0 | MIT | no |
| [uuid](https://www.npmjs.com/package/uuid/v/14.0.2) | 14.0.2 | MIT | no |
| [zustand](https://www.npmjs.com/package/zustand/v/4.5.7) | 4.5.7 | MIT | no |
