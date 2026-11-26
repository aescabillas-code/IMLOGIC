"""Nov 26: agent statuses are not lost when two screens save the staff document at once; every sign-in is kept."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import streamlit_app as app  # noqa: E402


def staff(*people):
    return {"list": [dict(p) for p in people], "ts": 1}


class StatusKept(unittest.TestCase):
    def test_newer_status_of_another_agent_is_kept(self):
        st = app.MemStore()
        a0 = {"name": "Karen Sabile", "status": "available", "stTs": 100}
        b0 = {"name": "Jonathan Gaspar", "status": "available", "stTs": 100}
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff(a0, b0)})
        # Karen goes unavailable (her screen saves the whole document)
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff(dict(a0, status="unavailable", reason="Break", stTs=200), b0)})
        # Jonathan's screen still had the old copy and saves his own change: Karen's newer status must stay
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff(a0, dict(b0, status="unavailable", reason="Lunch", stTs=210))})
        L = {p["name"]: p for p in st.get("config", "staff")["list"]}
        self.assertEqual((L["Karen Sabile"]["status"], L["Karen Sabile"]["reason"]), ("unavailable", "Break"))
        self.assertEqual((L["Jonathan Gaspar"]["status"], L["Jonathan Gaspar"]["reason"]), ("unavailable", "Lunch"))

    def test_back_to_available_clears_the_reason(self):
        st = app.MemStore()
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff({"name": "A B", "status": "unavailable", "reason": "Break", "stTs": 300})})
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff({"name": "A B", "status": "available", "stTs": 400})})
        p = st.get("config", "staff")["list"][0]
        self.assertEqual(p["status"], "available")
        self.assertNotIn("reason", p)

    def test_schedule_changes_are_not_blocked(self):
        st = app.MemStore()
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff({"name": "A B", "status": "unavailable", "stTs": 300, "start": "08:00"})})
        app.execute(st, "put", {"c": "config", "id": "staff", "data": staff({"name": "A B", "status": "available", "stTs": 100, "start": "09:00"}, {"name": "New One"})})
        L = st.get("config", "staff")["list"]
        self.assertEqual((L[0]["start"], L[0]["status"]), ("09:00", "unavailable"))   # schedule saved, newer status kept
        self.assertEqual(L[1]["name"], "New One")


class SignInsKept(unittest.TestCase):
    def test_every_sign_in_is_kept(self):
        st = app.MemStore()
        for t in (1000, 5000, 9000):
            app.execute(st, "put", {"c": "avail", "id": "Karen_Sabile", "data": {"n": "Karen Sabile", "inAt": t}})
        d = st.get("avail", "Karen_Sabile")
        self.assertEqual(d["ins"], [1000, 5000, 9000])
        self.assertEqual(d["inAt"], 9000)

    def test_old_sign_ins_drop_off(self):
        st = app.MemStore()
        day = 864e5
        app.execute(st, "put", {"c": "avail", "id": "x", "data": {"n": "x", "inAt": 1}})
        app.execute(st, "put", {"c": "avail", "id": "x", "data": {"n": "x", "inAt": int(50 * day)}})
        self.assertEqual(st.get("avail", "x")["ins"], [int(50 * day)])


if __name__ == "__main__":
    unittest.main()
