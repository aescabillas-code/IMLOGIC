"""Attendance (Nov 24): the first log-in of a shift is kept; a later sign-in or an "absent" mark never replaces it."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import streamlit_app as app  # noqa: E402

DOC = dict(n="Ann Old", d="2026-11-24", sch="08:00-17:00", st=1000, en=9000)


def put(st, data):
    app.execute(st, "put", {"c": "att", "id": "annold_2026-11-24", "data": data})
    return st.get("att", "annold_2026-11-24")


class KeepFirstLogin(unittest.TestCase):
    def test_first_login_is_saved(self):
        st = app.MemStore()
        d = put(st, dict(DOC, **{"in": 1200, "late": 0, "ts": 1200}))
        self.assertEqual(d["in"], 1200)

    def test_later_sign_in_does_not_replace_it(self):
        st = app.MemStore()
        put(st, dict(DOC, **{"in": 1200, "late": 0, "ts": 1200}))
        d = put(st, dict(DOC, **{"in": 5000, "late": 66, "ts": 5000}))       # reload / second device later in the shift
        self.assertEqual((d["in"], d["late"]), (1200, 0))
        self.assertEqual(d["ts"], 5000)

    def test_absent_mark_does_not_erase_a_login(self):
        st = app.MemStore()
        put(st, dict(DOC, **{"in": 1200, "late": 0, "ts": 1200}))
        d = put(st, dict(DOC, **{"in": None, "absent": True, "ts": 9100}))
        self.assertEqual(d["in"], 1200)
        self.assertNotIn("absent", d)

    def test_earlier_login_still_wins(self):
        st = app.MemStore()
        put(st, dict(DOC, **{"in": 5000, "late": 66, "ts": 5000}))
        d = put(st, dict(DOC, **{"in": 1200, "late": 0, "ts": 5100}))
        self.assertEqual(d["in"], 1200)

    def test_other_collections_untouched(self):
        st = app.MemStore()
        app.execute(st, "put", {"c": "seen", "id": "x", "data": {"in": 5}})
        app.execute(st, "put", {"c": "seen", "id": "x", "data": {"in": 9}})
        self.assertEqual(st.get("seen", "x")["in"], 9)


if __name__ == "__main__":
    unittest.main()
