#!/usr/bin/env python3
"""Thin wrapper that executes a generated Python script with controlled I/O.

Usage: python runner.py <input_dir> <output_dir> <script_path>

The script is exec'd in a namespace with INPUT_DIR, OUTPUT_DIR pre-set.
On success, the script should write outputs/result.json.
On failure, runner.py writes a minimal error result.json and exits with code 1.
"""

import json
import os
import sys
import traceback


def main():
    if len(sys.argv) != 4:
        print("Usage: runner.py <input_dir> <output_dir> <script_path>", file=sys.stderr)
        sys.exit(2)

    input_dir = os.path.abspath(sys.argv[1])
    output_dir = os.path.abspath(sys.argv[2])
    script_path = os.path.abspath(sys.argv[3])

    os.makedirs(output_dir, exist_ok=True)

    # Read script
    with open(script_path, "r") as f:
        code = f.read()

    # Build execution namespace
    namespace = {
        "__name__": "__main__",
        "INPUT_DIR": input_dir,
        "OUTPUT_DIR": output_dir,
    }

    try:
        exec(compile(code, script_path, "exec"), namespace)
    except Exception:
        tb = traceback.format_exc()
        print(tb, file=sys.stderr)

        # Write error result
        result = {
            "overlays": [],
            "metrics": {},
            "ctq_results": [],
            "stdout": "",
        }
        result_path = os.path.join(output_dir, "result.json")
        with open(result_path, "w") as f:
            json.dump(result, f)

        sys.exit(1)


if __name__ == "__main__":
    main()
