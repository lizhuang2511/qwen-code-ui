import os
import shutil
import sys
import unittest
from pathlib import Path

# Add crates to path
sys.path.append(os.path.join(os.getcwd(), "crates"))

import filesystem

class TestFilesystemNewOps(unittest.TestCase):
    def setUp(self):
        self.test_dir = Path("test_fs_ops")
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)
        self.test_dir.mkdir()

    def tearDown(self):
        if self.test_dir.exists():
            shutil.rmtree(self.test_dir)

    def test_create_directory(self):
        new_dir = self.test_dir / "new_folder"
        self.assertTrue(filesystem.create_directory(str(new_dir)))
        self.assertTrue(new_dir.exists())
        self.assertTrue(new_dir.is_dir())
        
        # Test existing
        self.assertFalse(filesystem.create_directory(str(new_dir)))

    def test_delete_path(self):
        # Test file deletion
        f = self.test_dir / "test.txt"
        f.touch()
        self.assertTrue(filesystem.delete_path(str(f)))
        self.assertFalse(f.exists())

        # Test folder deletion
        d = self.test_dir / "test_dir"
        d.mkdir()
        (d / "inner.txt").touch()
        self.assertTrue(filesystem.delete_path(str(d)))
        self.assertFalse(d.exists())
        
        # Test non-existent
        self.assertFalse(filesystem.delete_path(str(f)))

    def test_rename_path(self):
        # Test file rename
        src = self.test_dir / "src.txt"
        dst = self.test_dir / "dst.txt"
        src.touch()
        self.assertTrue(filesystem.rename_path(str(src), str(dst)))
        self.assertFalse(src.exists())
        self.assertTrue(dst.exists())

        # Test folder move
        src_dir = self.test_dir / "src_dir"
        src_dir.mkdir()
        dst_dir = self.test_dir / "dst_dir"
        
        self.assertTrue(filesystem.rename_path(str(src_dir), str(dst_dir)))
        self.assertFalse(src_dir.exists())
        self.assertTrue(dst_dir.exists())

if __name__ == '__main__':
    unittest.main()
