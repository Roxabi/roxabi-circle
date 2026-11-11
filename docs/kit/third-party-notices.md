# Third-party source notices

Kit-owned code is licensed under the [MIT License](licenses/MIT.txt). These notices cover identified third-party source included in this repository, which retains its own license terms and copyright notices. They do not replace dependencies' own licenses. Keep the notices in the source files when redistributing them.

## shadcn UI

The Base Nova primitives adapted under `packages/ui/src/components/ui/` and the sidebar-07-derived components, including `packages/ui/src/components/nav-user.tsx`, include source from [shadcn/ui](https://github.com/shadcn-ui/ui).

The upstream license is MIT. License snapshots: [Base Nova adoption reference](https://github.com/shadcn-ui/ui/blob/3cdaa6eb2f0da27aca8598cb752c32d840e06940/LICENSE.md) and [sidebar-07 adoption reference](https://github.com/shadcn-ui/ui/blob/cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4/LICENSE.md). These references document the upstream notices; they are not pins of the registry responses used during installation. The Kit adapts imports, styling and component behavior.

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dependency license checker

`scripts/kit/licenseChecker.ts` includes an adapted port of `tools/licenseChecker.ts` from `roxabi-boilerplate`. The upstream source is available in the [MIT-licensed snapshot caa64a8](https://github.com/Roxabi/roxabi-boilerplate/blob/caa64a8ace084fb9c456cbf92e14bb85a7c7c497/tools/licenseChecker.ts), with the following [license notice](https://github.com/Roxabi/roxabi-boilerplate/blob/caa64a8ace084fb9c456cbf92e14bb85a7c7c497/LICENSE). This attribution covers the upstream portions, not a license declaration for subsequent Kit changes.

```text
MIT License

Copyright (c) 2025 Roxabi SAS, Mickael Bouly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Generated Worker runtime declarations

The generated runtime declarations in `apps/example-api/src/worker-configuration.d.ts` and `apps/mcp-example/src/worker-configuration.d.ts` retain these upstream notices:

```text
Copyright (c) Cloudflare. All rights reserved.
Copyright (c) Microsoft Corporation. All rights reserved.
```

Those declarations identify Apache License 2.0. A [copy of the license](licenses/Apache-2.0.txt) is included here. Preserve the additional notices and disclaimers already present in the generated files; this summary does not replace them.
