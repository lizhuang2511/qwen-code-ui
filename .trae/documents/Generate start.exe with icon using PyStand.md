I will generate the executable following the method described in `README.md`, while adapting the C++ code to work with your existing environment.

**Plan:**

1.  **Adapt `PyStand.cpp`**:
    *   Modify the `main` function to initialize `PyStand` with your specific runtime path: `"build\\force_run.dist"` (instead of the default `"runtime"`).
    *   Update `LoadPython` and `CheckEnviron` to load `python312.dll` (instead of `python3.dll`).
2.  **Build with CMake**:
    *   Create a build directory (`build_pystand`) and run CMake, which will automatically use `appicon.ico` as defined in `resource.rc`.
    *   Compile the Release version of `PyStand.exe`.
3.  **Finalize**:
    *   Rename the output `PyStand.exe` to `start.exe` and place it in the project root. This ensures it automatically finds and runs `start.py` according to PyStand's naming convention.

This approach respects your instruction to only adapt the C code and icon usage without altering other files or directory structures.
