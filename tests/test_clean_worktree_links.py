"""clean-worktree.py must never follow links out of the worktree.

Reproduces the incident: worktree/node_modules is a junction to the main repo's
node_modules, which in turn links @scope/pkg -> packages/pkg. A bare
`git worktree remove` follows both and deletes the main repo's node_modules and
packages/** (verified on git 2.53 / Windows). The script must unlink first.

Run: python -m pytest tests/test_clean_worktree_links.py -q
"""
import importlib.util
import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "clean-worktree.py"


def _load():
    spec = importlib.util.spec_from_file_location("clean_worktree", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def _link_dir(link, target):
    """Directory link that needs no privilege: junction on Windows, symlink elsewhere."""
    if os.name == "nt":
        subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)],
                       check=True, capture_output=True)
    else:
        os.symlink(target, link, target_is_directory=True)


@pytest.fixture
def fixture(tmp_path):
    repo = tmp_path / "A"
    wt_base = tmp_path / "A_worktree"
    repo.mkdir()
    _git("init", "-q", cwd=repo)
    (repo / ".gitignore").write_text("node_modules\n")
    _git("add", ".gitignore", cwd=repo)
    _git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init", cwd=repo)
    (repo / "packages" / "core" / "src").mkdir(parents=True)
    (repo / "packages" / "core" / "src" / "a.txt").write_text("core")
    (repo / "node_modules" / "pkg").mkdir(parents=True)
    (repo / "node_modules" / "pkg" / "index.js").write_text("dep")
    (repo / "node_modules" / "@qa").mkdir()
    _link_dir(repo / "node_modules" / "@qa" / "core", repo / "packages" / "core")
    wt = wt_base / "T-1"
    _git("worktree", "add", "-q", "-b", "feature/T-1", str(wt), cwd=repo)
    _link_dir(wt / "node_modules", repo / "node_modules")
    return repo, wt


def _main_intact(repo):
    return ((repo / "node_modules" / "pkg" / "index.js").exists()
            and (repo / "packages" / "core" / "src" / "a.txt").exists())


def test_find_reparse_points_does_not_descend_into_links(fixture):
    repo, wt = fixture
    mod = _load()
    found = [p for p, _ in mod.find_reparse_points(str(wt))]
    assert len(found) == 1 and found[0].endswith("/node_modules")


def test_clean_task_keeps_main_repo_intact(fixture):
    repo, wt = fixture
    mod = _load()
    assert _main_intact(repo)
    mod.clean_task(str(repo).replace("\\", "/"), "T-1")
    assert not wt.exists()
    assert _main_intact(repo), "main repo node_modules/packages were deleted through the link"
    assert (repo / "node_modules" / "@qa" / "core" / "src" / "a.txt").exists()


def test_refuses_main_repo_path(fixture):
    repo, _ = fixture
    mod = _load()
    base = mod.get_worktree_base(str(repo))
    with pytest.raises(SystemExit):
        mod.assert_safe_worktree_path(str(repo), base, str(repo))
    with pytest.raises(SystemExit):
        mod.assert_safe_worktree_path(str(repo), base, str(repo.parent / "elsewhere" / "T-1"))
