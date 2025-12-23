import os
import git
from datetime import datetime
from typing import Dict, Any, List, Optional

def get_repo(path: str) -> Optional[git.Repo]:
    try:
        return git.Repo(path, search_parent_directories=True)
    except git.InvalidGitRepositoryError:
        return None
    except Exception as e:
        print(f"Error getting repo: {e}")
        return None

def init_repo(path: str) -> bool:
    try:
        git.Repo.init(path)
        return True
    except Exception as e:
        print(f"Error init repo: {e}")
        return False

def get_status(path: str) -> Dict[str, Any]:
    repo = get_repo(path)
    if not repo:
        return {"is_repo": False}
    
    try:
        # Get status
        staged = []
        unstaged = []
        untracked = repo.untracked_files
        
        # Check staged changes
        # HEAD might not exist if it's a fresh repo
        has_head = True
        try:
            repo.head.commit
        except ValueError:
            has_head = False

        if has_head:
            diff_index = repo.index.diff(repo.head.commit)
            for diff in diff_index:
                staged.append({
                    "path": diff.a_path,
                    "change_type": diff.change_type
                })
        else:
            # If no commit yet, everything in index is staged
            # repo.index.entries is a dict of (path, stage) -> entry
            # We just want unique paths
            paths = set(k[0] for k in repo.index.entries.keys())
            for p in paths:
                staged.append({
                    "path": p,
                    "change_type": "A"
                })

        # Check unstaged changes (diff between index and working tree)
        diff_local = repo.index.diff(None)
        for diff in diff_local:
            unstaged.append({
                "path": diff.a_path,
                "change_type": diff.change_type
            })

        return {
            "is_repo": True,
            "current_branch": repo.active_branch.name if has_head and not repo.head.is_detached else "detached" if has_head else "master",
            "staged": staged,
            "unstaged": unstaged,
            "untracked": untracked
        }
    except Exception as e:
        print(f"Error getting status: {e}")
        return {"is_repo": True, "error": str(e)}

def commit(path: str, message: str) -> bool:
    repo = get_repo(path)
    if not repo:
        return False
    
    try:
        # Check if we need to stage files. 
        # If nothing is staged, stage everything.
        has_head = True
        try:
            repo.head.commit
        except ValueError:
            has_head = False

        has_staged = False
        if has_head:
            if len(repo.index.diff(repo.head.commit)) > 0:
                has_staged = True
        elif len(repo.index.entries) > 0:
            has_staged = True
            
        if not has_staged:
            # If nothing staged, stage everything (git add .)
            repo.git.add(A=True)
            
        repo.index.commit(message)
        return True
    except Exception as e:
        print(f"Error committing: {e}")
        return False

def get_log(path: str, limit: int = 20) -> List[Dict[str, Any]]:
    repo = get_repo(path)
    if not repo:
        return []
        
    try:
        repo.head.commit
    except ValueError:
        return []
    
    commits = []
    try:
        for commit in repo.iter_commits(max_count=limit):
            commits.append({
                "hexsha": commit.hexsha,
                "message": commit.message.strip(),
                "author_name": commit.author.name,
                "author_email": commit.author.email,
                "date": datetime.fromtimestamp(commit.committed_date).isoformat(),
                "summary": commit.summary
            })
    except Exception as e:
        print(f"Error getting log: {e}")
        
    return commits

def reset(path: str, commit_hash: str, mode: str = "mixed") -> bool:
    # mode: 'soft', 'mixed', 'hard'
    repo = get_repo(path)
    if not repo:
        return False
        
    try:
        repo.git.reset(f"--{mode}", commit_hash)
        return True
    except Exception as e:
        print(f"Error resetting: {e}")
        return False
