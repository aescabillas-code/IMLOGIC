"""Add the IM•LOGIC ⇄ PET message thread to a PET Station checkout.

    python pet_bridge/apply_to_pet.py /path/to/pet-station

It copies im_pet_bridge.py into the PET repo and makes four small, marked edits (running it again changes nothing):
  1. streamlit_app.py   execute(): bridge_* requests are handled by im_pet_bridge (side "PET", PET's own database)
  2. web/shim.js        window.__bridge(op, args) for the page
  3. web/pet_station.html  the "IM•LOGIC" card in the case (thread + send box) and pet_bridge.js before the app starts
No new secrets: the thread is kept in PET's own database (collections bridge_links, bridge_msgs).
"""
import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).resolve().parent
MARK = "IM•LOGIC bridge"


def edit(path: pathlib.Path, anchor: str, new: str, mark: str) -> None:
    s = path.read_text(encoding="utf-8")
    if mark in s:
        print("  already applied:", path.name)
        return
    if s.count(anchor) != 1:
        raise SystemExit(f"{path}: anchor not found exactly once: {anchor[:60]!r}")
    path.write_text(s.replace(anchor, new), encoding="utf-8")
    print("  edited:", path.name)


def main(root: str) -> None:
    pet = pathlib.Path(root).resolve()
    app, shim, page = pet / "streamlit_app.py", pet / "web" / "shim.js", pet / "web" / "pet_station.html"
    for f in (app, shim, page):
        if not f.exists():
            raise SystemExit(f"Not a PET Station checkout (missing {f})")
    src = HERE.parent / "im_pet_bridge.py"
    shutil.copyfile(src, pet / "im_pet_bridge.py")
    print("  copied: im_pet_bridge.py")
    edit(app, "def execute(store: MemStore, op: str, a: Dict[str, Any]) -> Any:\n    \"\"\"Run one request from the browser. Same semantics as the original REST API.\"\"\"\n    a = a or {}\n",
         "def _bridge_db(store: Any) -> Any:   # IM•LOGIC bridge: the thread lives in PET's own database\n"
         "    fake = os.environ.get(\"BRIDGE_FAKE_FILE\")   # tests only: a file shared with an IM•LOGIC test server\n"
         "    if fake:\n        import im_pet_bridge\n        return im_pet_bridge.FakeDB(fake)\n"
         "    return getattr(store, \"db\", None)\n\n\n"
         "def execute(store: MemStore, op: str, a: Dict[str, Any]) -> Any:\n    \"\"\"Run one request from the browser. Same semantics as the original REST API.\"\"\"\n    a = a or {}\n"
         "    if isinstance(op, str) and op.startswith(\"bridge_\"):   # IM•LOGIC bridge (pet_bridge/apply_to_pet.py)\n"
         "        import im_pet_bridge\n"
         "        try:\n            return im_pet_bridge.execute(_bridge_db(store), op, a, \"PET\")\n"
         "        except im_pet_bridge.BridgeError as ex:\n            raise ApiError(ex.code, str(ex))\n", MARK)
    edit(shim, "  window.__petTemplate = function (name) { return rpc('template', { name: name }, 30000); };\n",
         "  window.__petTemplate = function (name) { return rpc('template', { name: name }, 30000); };\n"
         "  /* IM•LOGIC bridge: the recorded message thread with IM•LOGIC (pet_bridge/apply_to_pet.py) */\n"
         "  window.__bridge = function (op, args) { return rpc(op, args || {}, 20000); };\n", MARK)
    js = (HERE / "pet_bridge.js").read_text(encoding="utf-8")
    s = page.read_text(encoding="utf-8")
    if MARK in s or "brCard(c)" in s:
        print("  already applied:", page.name)
    else:
        a1, a2 = "$('case-body').innerHTML=`${statusBar}${info}${details}", "\nbootMe();loadTheme();"
        if s.count(a1) != 1 or s.count(a2) != 1:
            raise SystemExit("web/pet_station.html: anchors not found (the PET page was changed a lot); see pet_bridge/README.md")
        s = s.replace(a1, "$('case-body').innerHTML=`${statusBar}${info}${brCard(c)}${details}")
        s = s.replace(a2, "\n/* " + MARK + " */\n" + js + "\nbootMe();loadTheme();")
        page.write_text(s, encoding="utf-8")
        print("  edited:", page.name)
    print("Done. Deploy PET Station as usual; the IM•LOGIC card appears on PET cases that IM•LOGIC linked.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
