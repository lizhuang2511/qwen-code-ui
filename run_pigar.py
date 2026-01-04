import sys
import os
import glob

# Monkey patch glob.glob to prevent click from expanding arguments
original_glob = glob.glob
def no_expand_glob(pathname, *args, **kwargs):
    # Only prevent expansion for our specific exclusion patterns
    if pathname in ['crates/tests/*', 'tests/*']:
        return [pathname]
    return original_glob(pathname, *args, **kwargs)

glob.glob = no_expand_glob

# Add crates to sys.path so pigar can resolve local imports
project_root = os.path.dirname(os.path.abspath(__file__))
crates_dir = os.path.join(project_root, 'crates')
if crates_dir not in sys.path:
    sys.path.insert(0, crates_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Try to import main from pigar
try:
    from pigar.__main__ import main
except ImportError:
    try:
        from pigar.cli import main
    except ImportError:
        print("Could not find pigar main entry point")
        sys.exit(1)

# Set arguments
# Target crates directory
sys.argv = [
    'pigar', 'generate', 'crates',
    '-e', 'crates/tests/*',
    '--auto-select',
    '--question-answer', 'yes'
]

print(f"Running pigar with args: {sys.argv}")
try:
    main()
except SystemExit as e:
    print(f"Pigar exited with code: {e.code}")
    sys.exit(e.code)
except Exception as e:
    print(f"An error occurred: {e}")
    sys.exit(1)
