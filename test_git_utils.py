import os
import sys
import shutil

# Add crates/backend to sys.path
sys.path.append(os.path.join(os.getcwd(), 'crates', 'backend'))

import git_utils

def test_get_log():
    # Setup
    test_dir = "test_repo"
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    os.makedirs(test_dir)
    
    try:
        # Init repo
        print("Initializing repo...")
        git_utils.init_repo(test_dir)
        
        # Create a file
        with open(os.path.join(test_dir, "test.txt"), "w") as f:
            f.write("hello")
            
        # Commit
        print("Committing...")
        git_utils.commit(test_dir, "first_commit")
        
        # Get log
        print("Getting log...")
        logs = git_utils.get_log(test_dir)
        
        for log in logs:
            print(f"Log: {log['hexsha']}")
            print(f"Message: {log['message']}")
            print("-" * 20)
            
            if "Time:" in log['message']:
                print("SUCCESS: Time found in message")
            else:
                print("FAILURE: Time not found in message")
                
    finally:
        # Cleanup
        if os.path.exists(test_dir):
            try:
                git_utils.WatchdogManager.stop_monitoring(test_dir)
            except:
                pass
            shutil.rmtree(test_dir)

if __name__ == "__main__":
    test_get_log()
